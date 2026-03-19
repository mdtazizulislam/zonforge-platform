"""
ZonForge Sentinel — Statistical Anomaly Detectors

5 detector models, each comparing a current observation
against a 30-day rolling per-user baseline using z-score.

Detectors:
  1. LoginTimeDetector       — hour-of-day distribution
  2. LoginLocationDetector   — country cluster
  3. ApiVolumeDetector       — API call rate per hour
  4. DataDownloadDetector    — download volume per session
  5. DeviceFingerprintDetector — new/unseen device ID
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from src.config import get_settings
from src.db import ch_query, get_redis
from src.logger import get_logger
from src.models.baseline import (
    AnomalySignal,
    Baseline,
    compute_hourly_distribution,
    compute_mean_std,
    compute_zscore,
    hour_distribution_anomaly_score,
    zscore_to_confidence,
    zscore_to_severity,
)
from src.services.baseline_store import BaselineStore

log = get_logger("anomaly-service.detectors")


# ─────────────────────────────────────────────────────────────────
# 1. LOGIN TIME ANOMALY DETECTOR
#
# Builds a probability distribution of which hours the user
# typically logs in. Flags logins at highly unusual hours.
# ─────────────────────────────────────────────────────────────────

class LoginTimeDetector:
    METRIC = "login_hour_distribution"

    def __init__(self, store: BaselineStore, settings: Any) -> None:
        self.store    = store
        self.settings = settings

    async def build_baseline(
        self, tenant_id: str, user_id: str,
    ) -> Baseline:
        """Build 30-day login hour distribution for user."""
        rows = ch_query(
            """
            SELECT toHour(event_time) AS login_hour, count() AS cnt
            FROM events
            WHERE tenant_id      = {tenant_id:UUID}
              AND actor_user_id  = {user_id:UUID}
              AND event_action   IN ('login_success')
              AND outcome        = 'success'
              AND event_time     >= now() - INTERVAL 30 DAY
            GROUP BY login_hour
            ORDER BY login_hour
            """,
            {"tenant_id": tenant_id, "user_id": user_id},
        )

        distribution: dict[str, int] = {str(r["login_hour"]): int(r["cnt"]) for r in rows}
        total_logins  = sum(distribution.values())

        # Mean and std dev of login hours (circular: hour is 0-23)
        all_hours = [
            int(h) for h, cnt in distribution.items()
            for _ in range(int(cnt))
        ]
        mean, std_dev = compute_mean_std([float(h) for h in all_hours])

        now = datetime.now(tz=timezone.utc)
        return Baseline(
            tenant_id       = tenant_id,
            user_id         = user_id,
            metric_name     = self.METRIC,
            baseline_data   = {"distribution": distribution, "total_logins": total_logins},
            sample_count    = total_logins,
            mean_value      = mean,
            std_dev_value   = std_dev,
            last_updated_at = now,
            valid_from_date = now,
        )

    async def detect(
        self,
        tenant_id:    str,
        user_id:      str,
        login_hour:   int,
        event_ids:    list[str],
    ) -> AnomalySignal | None:
        baseline = await self.store.get_baseline(tenant_id, user_id, self.METRIC)

        if not baseline or baseline.sample_count < self.settings.min_samples_for_baseline:
            return None   # Not enough data

        dist_raw = baseline.baseline_data.get("distribution", {})
        dist     = {int(k): int(v) for k, v in dist_raw.items()}
        total    = sum(dist.values())
        prob_dist = {h: cnt / total for h, cnt in dist.items()}

        anomaly_score = hour_distribution_anomaly_score(login_hour, prob_dist)

        # Threshold: 0.85 = this hour accounts for <15% of normal logins
        if anomaly_score < 0.85:
            return None

        z_score    = anomaly_score * 4.0   # scale to z-score equivalent
        confidence = zscore_to_confidence(z_score, self.settings.anomaly_confidence_base)
        severity   = zscore_to_severity(z_score)

        typical_hours = sorted(prob_dist, key=lambda h: prob_dist[h], reverse=True)[:3]

        return AnomalySignal(
            tenant_id         = tenant_id,
            user_id           = user_id,
            entity_id         = user_id,
            entity_type       = "user",
            metric_name       = self.METRIC,
            observed_value    = float(login_hour),
            baseline_mean     = baseline.mean_value   or 12.0,
            baseline_std_dev  = baseline.std_dev_value or 4.0,
            z_score           = z_score,
            confidence        = confidence,
            severity          = severity,
            description       = (
                f"Login at {login_hour:02d}:00 is unusual. "
                f"Typical login hours: {typical_hours}. "
                f"Anomaly score: {anomaly_score:.2f}"
            ),
            evidence_event_ids = event_ids,
            metadata = {
                "login_hour":    login_hour,
                "typical_hours": typical_hours,
                "anomaly_score": anomaly_score,
                "detector":      "login_time",
            },
        )


# ─────────────────────────────────────────────────────────────────
# 2. LOGIN LOCATION ANOMALY DETECTOR
#
# Tracks which countries the user typically logs in from.
# Flags logins from countries not in the 30-day baseline.
# ─────────────────────────────────────────────────────────────────

class LoginLocationDetector:
    METRIC = "login_countries"

    def __init__(self, store: BaselineStore, settings: Any) -> None:
        self.store    = store
        self.settings = settings

    async def build_baseline(
        self, tenant_id: str, user_id: str,
    ) -> Baseline:
        rows = ch_query(
            """
            SELECT actor_ip_country AS country, count() AS cnt
            FROM events
            WHERE tenant_id     = {tenant_id:UUID}
              AND actor_user_id = {user_id:UUID}
              AND event_action  IN ('login_success')
              AND outcome       = 'success'
              AND actor_ip_country IS NOT NULL
              AND event_time    >= now() - INTERVAL 30 DAY
            GROUP BY country
            """,
            {"tenant_id": tenant_id, "user_id": user_id},
        )

        countries: dict[str, int] = {r["country"]: int(r["cnt"]) for r in rows}
        total     = sum(countries.values())
        now       = datetime.now(tz=timezone.utc)

        return Baseline(
            tenant_id       = tenant_id,
            user_id         = user_id,
            metric_name     = self.METRIC,
            baseline_data   = {"countries": countries, "total": total},
            sample_count    = total,
            mean_value      = float(len(countries)),
            std_dev_value   = 0.0,
            last_updated_at = now,
            valid_from_date = now,
        )

    async def detect(
        self,
        tenant_id:    str,
        user_id:      str,
        country:      str,
        event_ids:    list[str],
    ) -> AnomalySignal | None:
        baseline = await self.store.get_baseline(tenant_id, user_id, self.METRIC)

        if not baseline or baseline.sample_count < self.settings.min_samples_for_baseline:
            return None

        known_countries = set(baseline.baseline_data.get("countries", {}).keys())

        if country in known_countries:
            return None   # Known country — not anomalous

        # New country — confidence based on how many logins in baseline
        confidence = min(
            self.settings.anomaly_confidence_base + 0.1 * len(known_countries) / 10,
            0.92,
        )
        z_score    = 3.0   # Fixed high z-score for new country

        return AnomalySignal(
            tenant_id         = tenant_id,
            user_id           = user_id,
            entity_id         = user_id,
            entity_type       = "user",
            metric_name       = self.METRIC,
            observed_value    = 1.0,
            baseline_mean     = 0.0,
            baseline_std_dev  = 0.0,
            z_score           = z_score,
            confidence        = confidence,
            severity          = "medium",
            description       = (
                f"Login from {country} — not seen in 30-day history. "
                f"Known countries: {sorted(known_countries)}"
            ),
            evidence_event_ids = event_ids,
            metadata = {
                "new_country":    country,
                "known_countries": list(known_countries),
                "detector":        "login_location",
            },
        )


# ─────────────────────────────────────────────────────────────────
# 3. API CALL VOLUME ANOMALY DETECTOR
#
# Tracks hourly API call rate per user/service account.
# Flags hours with anomalously high request volume.
# ─────────────────────────────────────────────────────────────────

class ApiVolumeDetector:
    METRIC = "api_calls_per_hour"

    def __init__(self, store: BaselineStore, settings: Any) -> None:
        self.store    = store
        self.settings = settings

    async def build_baseline(
        self, tenant_id: str, user_id: str,
    ) -> Baseline:
        rows = ch_query(
            """
            SELECT count() AS hourly_count
            FROM events
            WHERE tenant_id     = {tenant_id:UUID}
              AND actor_user_id = {user_id:UUID}
              AND event_category = 'api_call'
              AND event_time    >= now() - INTERVAL 30 DAY
            GROUP BY toStartOfHour(event_time)
            """,
            {"tenant_id": tenant_id, "user_id": user_id},
        )

        hourly_counts = [float(r["hourly_count"]) for r in rows]
        mean, std_dev = compute_mean_std(hourly_counts)
        now           = datetime.now(tz=timezone.utc)

        return Baseline(
            tenant_id       = tenant_id,
            user_id         = user_id,
            metric_name     = self.METRIC,
            baseline_data   = {
                "hourly_p95": sorted(hourly_counts)[int(len(hourly_counts) * 0.95)]
                              if hourly_counts else 0,
                "sample_hours": len(hourly_counts),
            },
            sample_count    = len(hourly_counts),
            mean_value      = mean,
            std_dev_value   = std_dev,
            last_updated_at = now,
            valid_from_date = now,
        )

    async def detect(
        self,
        tenant_id:          str,
        user_id:            str,
        observed_api_count: int,
        event_ids:          list[str],
    ) -> AnomalySignal | None:
        baseline = await self.store.get_baseline(tenant_id, user_id, self.METRIC)

        if not baseline or baseline.sample_count < 5:
            return None
        if baseline.mean_value is None or baseline.std_dev_value is None:
            return None
        if baseline.std_dev_value < 1.0:
            return None   # No meaningful variance to compare against

        z_score = compute_zscore(
            float(observed_api_count),
            baseline.mean_value,
            baseline.std_dev_value,
        )

        if z_score < self.settings.anomaly_zscore_threshold:
            return None

        confidence = zscore_to_confidence(z_score, self.settings.anomaly_confidence_base)
        severity   = zscore_to_severity(z_score)

        return AnomalySignal(
            tenant_id         = tenant_id,
            user_id           = user_id,
            entity_id         = user_id,
            entity_type       = "user",
            metric_name       = self.METRIC,
            observed_value    = float(observed_api_count),
            baseline_mean     = baseline.mean_value,
            baseline_std_dev  = baseline.std_dev_value,
            z_score           = z_score,
            confidence        = confidence,
            severity          = severity,
            description       = (
                f"API call volume {observed_api_count}/hour is {z_score:.1f}σ "
                f"above baseline mean of {baseline.mean_value:.0f}/hour"
            ),
            evidence_event_ids = event_ids,
            metadata = {
                "observed":   observed_api_count,
                "baseline":   baseline.mean_value,
                "z_score":    z_score,
                "detector":   "api_volume",
            },
        )


# ─────────────────────────────────────────────────────────────────
# 4. DATA DOWNLOAD VOLUME ANOMALY DETECTOR
#
# Tracks per-session download volume.
# Flags sessions with anomalously high download volume.
# ─────────────────────────────────────────────────────────────────

class DataDownloadDetector:
    METRIC = "download_count_per_hour"

    def __init__(self, store: BaselineStore, settings: Any) -> None:
        self.store    = store
        self.settings = settings

    async def build_baseline(
        self, tenant_id: str, user_id: str,
    ) -> Baseline:
        rows = ch_query(
            """
            SELECT count() AS download_count
            FROM events
            WHERE tenant_id     = {tenant_id:UUID}
              AND actor_user_id = {user_id:UUID}
              AND event_action  IN ('file_download', 'download', 'GetObject')
              AND outcome       = 'success'
              AND event_time    >= now() - INTERVAL 30 DAY
            GROUP BY toStartOfHour(event_time)
            """,
            {"tenant_id": tenant_id, "user_id": user_id},
        )

        counts    = [float(r["download_count"]) for r in rows]
        mean, std = compute_mean_std(counts)
        now       = datetime.now(tz=timezone.utc)

        return Baseline(
            tenant_id       = tenant_id,
            user_id         = user_id,
            metric_name     = self.METRIC,
            baseline_data   = {"sample_hours": len(counts)},
            sample_count    = len(counts),
            mean_value      = mean,
            std_dev_value   = std,
            last_updated_at = now,
            valid_from_date = now,
        )

    async def detect(
        self,
        tenant_id:      str,
        user_id:        str,
        download_count: int,
        event_ids:      list[str],
    ) -> AnomalySignal | None:
        baseline = await self.store.get_baseline(tenant_id, user_id, self.METRIC)

        if not baseline or baseline.sample_count < 5:
            return None
        if not baseline.mean_value or not baseline.std_dev_value:
            return None
        if baseline.std_dev_value < 1.0:
            return None

        z_score = compute_zscore(
            float(download_count),
            baseline.mean_value,
            baseline.std_dev_value,
        )

        if z_score < self.settings.anomaly_zscore_threshold:
            return None

        return AnomalySignal(
            tenant_id         = tenant_id,
            user_id           = user_id,
            entity_id         = user_id,
            entity_type       = "user",
            metric_name       = self.METRIC,
            observed_value    = float(download_count),
            baseline_mean     = baseline.mean_value,
            baseline_std_dev  = baseline.std_dev_value,
            z_score           = z_score,
            confidence        = zscore_to_confidence(z_score, self.settings.anomaly_confidence_base),
            severity          = zscore_to_severity(z_score),
            description       = (
                f"Downloaded {download_count} files this hour — "
                f"{z_score:.1f}σ above baseline ({baseline.mean_value:.0f}/hour)"
            ),
            evidence_event_ids = event_ids,
            metadata = {
                "observed": download_count,
                "baseline": baseline.mean_value,
                "z_score":  z_score,
                "detector": "data_download",
            },
        )


# ─────────────────────────────────────────────────────────────────
# 5. DEVICE FINGERPRINT ANOMALY DETECTOR
#
# Tracks the set of device IDs and user agents a user has
# previously authenticated from. Flags never-before-seen devices.
# ─────────────────────────────────────────────────────────────────

class DeviceFingerprintDetector:
    METRIC = "known_devices"

    def __init__(self, store: BaselineStore, settings: Any) -> None:
        self.store    = store
        self.settings = settings

    async def build_baseline(
        self, tenant_id: str, user_id: str,
    ) -> Baseline:
        rows = ch_query(
            """
            SELECT
              actor_device_id AS device_id,
              count()         AS login_count
            FROM events
            WHERE tenant_id     = {tenant_id:UUID}
              AND actor_user_id = {user_id:UUID}
              AND event_action  IN ('login_success')
              AND actor_device_id IS NOT NULL
              AND event_time    >= now() - INTERVAL 30 DAY
            GROUP BY actor_device_id
            LIMIT 100
            """,
            {"tenant_id": tenant_id, "user_id": user_id},
        )

        devices = {r["device_id"]: int(r["login_count"]) for r in rows}
        now     = datetime.now(tz=timezone.utc)

        return Baseline(
            tenant_id       = tenant_id,
            user_id         = user_id,
            metric_name     = self.METRIC,
            baseline_data   = {"devices": devices},
            sample_count    = len(devices),
            mean_value      = float(len(devices)),
            std_dev_value   = 0.0,
            last_updated_at = now,
            valid_from_date = now,
        )

    async def detect(
        self,
        tenant_id:  str,
        user_id:    str,
        device_id:  str,
        event_ids:  list[str],
    ) -> AnomalySignal | None:
        if not device_id:
            return None

        baseline = await self.store.get_baseline(tenant_id, user_id, self.METRIC)

        if not baseline or baseline.sample_count < 3:
            return None   # Not enough device history

        known_devices = set(baseline.baseline_data.get("devices", {}).keys())

        if device_id in known_devices:
            return None

        # New device — confidence scales with number of known devices
        known_count = len(known_devices)
        confidence  = min(
            self.settings.anomaly_confidence_base + 0.05 * known_count,
            0.88,
        )

        return AnomalySignal(
            tenant_id         = tenant_id,
            user_id           = user_id,
            entity_id         = user_id,
            entity_type       = "user",
            metric_name       = self.METRIC,
            observed_value    = 1.0,
            baseline_mean     = 0.0,
            baseline_std_dev  = 0.0,
            z_score           = 2.5,
            confidence        = confidence,
            severity          = "medium",
            description       = (
                f"Login from new device {device_id[:16]}... "
                f"User has {known_count} known devices in 30-day history."
            ),
            evidence_event_ids = event_ids,
            metadata = {
                "new_device_id": device_id,
                "known_device_count": known_count,
                "detector": "device_fingerprint",
            },
        )
