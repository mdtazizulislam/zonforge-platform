"""
ZonForge Sentinel — Anomaly Orchestrator

Coordinates all 5 detectors for a given user event.
Emits anomaly signals to the detection signals queue
via the detection-engine internal API.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any

import httpx

from src.config import get_settings
from src.db import get_redis
from src.logger import get_logger
from src.models.baseline import AnomalySignal
from src.models.detectors import (
    ApiVolumeDetector,
    DataDownloadDetector,
    DeviceFingerprintDetector,
    LoginLocationDetector,
    LoginTimeDetector,
)
from src.services.baseline_store import BaselineStore

log = get_logger("anomaly-service.orchestrator")

# MITRE ATT&CK mapping for anomaly signals
ANOMALY_MITRE: dict[str, dict[str, list[str]]] = {
    "login_hour_distribution": {
        "tactics":    ["TA0001"],
        "techniques": ["T1078"],
    },
    "login_countries": {
        "tactics":    ["TA0001"],
        "techniques": ["T1078.004"],
    },
    "api_calls_per_hour": {
        "tactics":    ["TA0006"],
        "techniques": ["T1550.001"],
    },
    "download_count_per_hour": {
        "tactics":    ["TA0010"],
        "techniques": ["T1530"],
    },
    "known_devices": {
        "tactics":    ["TA0001"],
        "techniques": ["T1078"],
    },
}


class AnomalyOrchestrator:
    def __init__(self) -> None:
        self.settings   = get_settings()
        self.store      = BaselineStore()
        self.detectors  = {
            "login_time":     LoginTimeDetector(self.store, self.settings),
            "login_location": LoginLocationDetector(self.store, self.settings),
            "api_volume":     ApiVolumeDetector(self.store, self.settings),
            "data_download":  DataDownloadDetector(self.store, self.settings),
            "device_fp":      DeviceFingerprintDetector(self.store, self.settings),
        }

    # ── Evaluate a single normalized event ────────────────────────

    async def evaluate_event(self, event: dict[str, Any]) -> list[AnomalySignal]:
        tenant_id = event.get("tenant_id")
        user_id   = event.get("actor_user_id")
        if not tenant_id or not user_id:
            return []

        signals:    list[AnomalySignal] = []
        event_ids = [event.get("event_id", "")]
        action    = event.get("event_action", "")
        category  = event.get("event_category", "")

        # ── Login time anomaly ─────────────────────────────────────
        if action in ("login_success",) and event.get("event_time"):
            try:
                evt_time    = datetime.fromisoformat(str(event["event_time"]))
                login_hour  = evt_time.hour
                sig = await self.detectors["login_time"].detect(
                    tenant_id, user_id, login_hour, event_ids,
                )
                if sig:
                    signals.append(sig)
            except Exception as exc:
                log.warning("login_time detector failed", error=str(exc))

        # ── Login location anomaly ─────────────────────────────────
        if action in ("login_success",) and event.get("actor_ip_country"):
            try:
                sig = await self.detectors["login_location"].detect(
                    tenant_id, user_id,
                    str(event["actor_ip_country"]),
                    event_ids,
                )
                if sig:
                    signals.append(sig)
            except Exception as exc:
                log.warning("login_location detector failed", error=str(exc))

        # ── Device fingerprint anomaly ─────────────────────────────
        if action in ("login_success",) and event.get("actor_device_id"):
            try:
                sig = await self.detectors["device_fp"].detect(
                    tenant_id, user_id,
                    str(event["actor_device_id"]),
                    event_ids,
                )
                if sig:
                    signals.append(sig)
            except Exception as exc:
                log.warning("device_fp detector failed", error=str(exc))

        # ── API volume anomaly (check hourly bucket) ───────────────
        if category == "api_call":
            await self._check_api_volume(tenant_id, user_id, signals)

        # ── Download volume anomaly ────────────────────────────────
        if action in ("file_download", "download", "GetObject"):
            await self._check_download_volume(tenant_id, user_id, signals)

        return signals

    async def _check_api_volume(
        self, tenant_id: str, user_id: str, signals: list[AnomalySignal],
    ) -> None:
        """Count API calls in current hour and check against baseline."""
        from src.db import ch_query
        rows = ch_query(
            """
            SELECT count() AS cnt
            FROM events
            WHERE tenant_id     = {tenant_id:UUID}
              AND actor_user_id = {user_id:UUID}
              AND event_category = 'api_call'
              AND event_time    >= toStartOfHour(now())
            """,
            {"tenant_id": tenant_id, "user_id": user_id},
        )
        count = int(rows[0]["cnt"]) if rows else 0
        if count < 10:
            return   # Skip low-volume users

        try:
            sig = await self.detectors["api_volume"].detect(
                tenant_id, user_id, count, [],
            )
            if sig:
                signals.append(sig)
        except Exception as exc:
            log.warning("api_volume detector failed", error=str(exc))

    async def _check_download_volume(
        self, tenant_id: str, user_id: str, signals: list[AnomalySignal],
    ) -> None:
        from src.db import ch_query
        rows = ch_query(
            """
            SELECT count() AS cnt, groupArray(event_id) AS ids
            FROM events
            WHERE tenant_id     = {tenant_id:UUID}
              AND actor_user_id = {user_id:UUID}
              AND event_action  IN ('file_download', 'download', 'GetObject')
              AND outcome       = 'success'
              AND event_time    >= toStartOfHour(now())
            """,
            {"tenant_id": tenant_id, "user_id": user_id},
        )
        count = int(rows[0]["cnt"]) if rows else 0
        ids   = list(rows[0]["ids"])[:20] if rows else []
        if count < 5:
            return

        try:
            sig = await self.detectors["data_download"].detect(
                tenant_id, user_id, count, ids,
            )
            if sig:
                signals.append(sig)
        except Exception as exc:
            log.warning("data_download detector failed", error=str(exc))

    # ── Emit signals to detection pipeline ────────────────────────

    async def emit_signals(self, signals: list[AnomalySignal]) -> int:
        if not signals:
            return 0

        emitted = 0
        redis   = get_redis()

        for sig in signals:
            # Dedup check (24h)
            dedup_key = (
                f"zf:platform:detection:dedup:"
                f"{sig.tenant_id}:anomaly_{sig.metric_name}:{sig.entity_id}"
            )
            if await redis.exists(dedup_key):
                log.debug("anomaly signal deduplicated", metric=sig.metric_name)
                continue

            signal_id  = str(uuid.uuid4())
            mitre_info = ANOMALY_MITRE.get(sig.metric_name, {
                "tactics": ["TA0001"], "techniques": ["T1078"],
            })

            payload = {
                "signalId":         signal_id,
                "tenantId":         sig.tenant_id,
                "detectionType":    "anomaly",
                "entityId":         sig.entity_id,
                "entityType":       sig.entity_type,
                "confidence":       sig.confidence,
                "severity":         sig.severity,
                "mitreTactics":     mitre_info["tactics"],
                "mitreTechniques":  mitre_info["techniques"],
                "evidenceEventIds": sig.evidence_event_ids,
                "firstSignalTime":  datetime.now(tz=timezone.utc).isoformat(),
                "metadata": {
                    **sig.metadata,
                    "metric_name": sig.metric_name,
                    "z_score":     sig.z_score,
                    "description": sig.description,
                },
            }

            # Post to detection engine internal endpoint
            try:
                async with httpx.AsyncClient(timeout=5.0) as client:
                    resp = await client.post(
                        f"{self.settings.detection_api_url}/internal/anomaly-signal",
                        json=payload,
                    )
                    if resp.is_success:
                        await redis.setex(dedup_key, 86400, signal_id)
                        emitted += 1
                    else:
                        log.warning(
                            "Failed to emit anomaly signal",
                            status=resp.status_code,
                        )
            except Exception as exc:
                log.error("Signal emission failed", error=str(exc))

        if emitted > 0:
            log.info("Anomaly signals emitted", count=emitted)

        return emitted
