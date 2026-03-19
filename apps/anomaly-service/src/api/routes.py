"""
ZonForge Sentinel — Anomaly Service API Routes

Endpoints consumed by:
  - normalization-worker  (evaluate events inline)
  - detection-engine      (trigger anomaly check on demand)
  - ops team              (baseline management)
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from src.logger import get_logger
from src.services.anomaly_orchestrator import AnomalyOrchestrator
from src.workers.baseline_builder import BaselineBuilder

log        = get_logger("anomaly-service.api")
router     = APIRouter()
orchestrator = AnomalyOrchestrator()
builder    = BaselineBuilder()


# ── Request / Response schemas ────────────────────────────────────

class EvaluateEventRequest(BaseModel):
    tenant_id:        str
    event_id:         str
    actor_user_id:    str | None = None
    actor_ip_country: str | None = None
    actor_device_id:  str | None = None
    event_action:     str
    event_category:   str
    event_time:       datetime | None = None
    metadata:         dict[str, Any] = Field(default_factory=dict)


class EvaluateBatchRequest(BaseModel):
    events: list[EvaluateEventRequest] = Field(..., max_length=1000)


class AnomalySignalResponse(BaseModel):
    metric_name:   str
    entity_id:     str
    z_score:       float
    confidence:    float
    severity:      str
    description:   str
    mitre_tactics: list[str]


class EvaluateResponse(BaseModel):
    anomalies_found: int
    emitted:         int
    signals:         list[AnomalySignalResponse]


class RebuildBaselineRequest(BaseModel):
    tenant_id: str
    user_id:   str


# ─────────────────────────────────────────────
# ROUTES
# ─────────────────────────────────────────────

@router.post("/internal/evaluate-event", response_model=EvaluateResponse)
async def evaluate_event(req: EvaluateEventRequest) -> EvaluateResponse:
    """
    Evaluate a single normalized event for anomalies.
    Called by normalization-worker for every login/API/download event.
    """
    event_dict = req.model_dump()
    signals    = await orchestrator.evaluate_event(event_dict)

    from src.services.anomaly_orchestrator import ANOMALY_MITRE
    response_signals = [
        AnomalySignalResponse(
            metric_name   = s.metric_name,
            entity_id     = s.entity_id,
            z_score       = round(s.z_score, 3),
            confidence    = round(s.confidence, 3),
            severity      = s.severity,
            description   = s.description,
            mitre_tactics = ANOMALY_MITRE.get(s.metric_name, {}).get("tactics", []),
        )
        for s in signals
    ]

    emitted = await orchestrator.emit_signals(signals)

    return EvaluateResponse(
        anomalies_found = len(signals),
        emitted         = emitted,
        signals         = response_signals,
    )


@router.post("/internal/evaluate-batch")
async def evaluate_batch(req: EvaluateBatchRequest) -> dict[str, int]:
    """
    Evaluate a batch of events. Returns aggregate stats.
    """
    total_anomalies = 0
    total_emitted   = 0

    for event in req.events:
        event_dict = event.model_dump()
        signals    = await orchestrator.evaluate_event(event_dict)
        emitted    = await orchestrator.emit_signals(signals)
        total_anomalies += len(signals)
        total_emitted   += emitted

    return {
        "events_evaluated": len(req.events),
        "anomalies_found":  total_anomalies,
        "signals_emitted":  total_emitted,
    }


@router.post("/internal/rebuild-baseline")
async def rebuild_baseline(req: RebuildBaselineRequest) -> dict[str, Any]:
    """
    On-demand baseline rebuild for a specific user.
    Triggered when a new user is onboarded or anomalies seem stale.
    """
    stats = await builder.rebuild_user(req.tenant_id, req.user_id)
    return {
        "tenant_id":        req.tenant_id,
        "user_id":          req.user_id,
        "baselines_built":  stats["baselines_built"],
        "errors":           stats["errors"],
    }


@router.post("/admin/baselines/rebuild-all")
async def trigger_full_rebuild() -> dict[str, str]:
    """
    Trigger a full baseline rebuild across all tenants.
    Long-running — runs asynchronously.
    """
    import asyncio
    asyncio.create_task(builder.run_full_rebuild())
    return {"message": "Full baseline rebuild started asynchronously"}


@router.get("/health")
async def health() -> dict[str, Any]:
    from src.db import get_ch, get_pg_pool, get_redis
    checks: dict[str, str] = {}

    try:
        pool = get_pg_pool()
        async with pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        checks["postgres"] = "ok"
    except Exception as exc:
        checks["postgres"] = f"error: {exc}"

    try:
        get_ch().query("SELECT 1")
        checks["clickhouse"] = "ok"
    except Exception as exc:
        checks["clickhouse"] = f"error: {exc}"

    try:
        await get_redis().ping()
        checks["redis"] = "ok"
    except Exception as exc:
        checks["redis"] = f"error: {exc}"

    overall = "ok" if all(v == "ok" for v in checks.values()) else "degraded"

    return {
        "status":    overall,
        "service":   "anomaly-service",
        "checks":    checks,
        "detectors": list(orchestrator.detectors.keys()),
        "timestamp": datetime.utcnow().isoformat(),
    }
