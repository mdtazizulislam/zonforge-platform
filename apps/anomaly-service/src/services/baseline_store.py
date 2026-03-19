"""
ZonForge Sentinel — Baseline Store

Reads and writes per-user baselines from/to the
anomaly_baselines PostgreSQL table.
Also caches hot baselines in Redis for sub-ms reads.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from src.db import get_redis, pg_conn
from src.logger import get_logger
from src.models.baseline import Baseline

log = get_logger("anomaly-service.baseline-store")

_CACHE_TTL = 4 * 3600   # 4 hours


class BaselineStore:

    # ── Read baseline ──────────────────────────────────────────────

    async def get_baseline(
        self,
        tenant_id:   str,
        user_id:     str,
        metric_name: str,
    ) -> Baseline | None:
        # 1. Redis cache
        cache_key = f"zf:{tenant_id}:anomaly:baseline:{user_id}:{metric_name}"
        redis     = get_redis()
        cached    = await redis.get(cache_key)
        if cached:
            data = json.loads(cached)
            return Baseline(
                tenant_id       = data["tenant_id"],
                user_id         = data["user_id"],
                metric_name     = data["metric_name"],
                baseline_data   = data["baseline_data"],
                sample_count    = data["sample_count"],
                mean_value      = data.get("mean_value"),
                std_dev_value   = data.get("std_dev_value"),
                last_updated_at = datetime.fromisoformat(data["last_updated_at"]),
                valid_from_date = datetime.fromisoformat(data["valid_from_date"]),
            )

        # 2. PostgreSQL fallback
        async with pg_conn() as conn:
            row = await conn.fetchrow(
                """
                SELECT tenant_id, user_id, metric_name, baseline_data,
                       sample_count, mean_value, std_dev_value,
                       last_updated_at, valid_from_date
                FROM anomaly_baselines
                WHERE tenant_id = $1
                  AND user_id   = $2
                  AND metric_name = $3
                ORDER BY last_updated_at DESC
                LIMIT 1
                """,
                tenant_id, user_id, metric_name,
            )

        if not row:
            return None

        baseline = Baseline(
            tenant_id       = row["tenant_id"],
            user_id         = row["user_id"],
            metric_name     = row["metric_name"],
            baseline_data   = json.loads(row["baseline_data"])
                              if isinstance(row["baseline_data"], str)
                              else dict(row["baseline_data"]),
            sample_count    = row["sample_count"],
            mean_value      = float(row["mean_value"])    if row["mean_value"]    else None,
            std_dev_value   = float(row["std_dev_value"]) if row["std_dev_value"] else None,
            last_updated_at = row["last_updated_at"],
            valid_from_date = row["valid_from_date"],
        )

        # Warm cache
        await redis.setex(cache_key, _CACHE_TTL, json.dumps({
            "tenant_id":       baseline.tenant_id,
            "user_id":         baseline.user_id,
            "metric_name":     baseline.metric_name,
            "baseline_data":   baseline.baseline_data,
            "sample_count":    baseline.sample_count,
            "mean_value":      baseline.mean_value,
            "std_dev_value":   baseline.std_dev_value,
            "last_updated_at": baseline.last_updated_at.isoformat(),
            "valid_from_date": baseline.valid_from_date.isoformat(),
        }))

        return baseline

    # ── Save / update baseline ─────────────────────────────────────

    async def save_baseline(self, baseline: Baseline) -> None:
        async with pg_conn() as conn:
            await conn.execute(
                """
                INSERT INTO anomaly_baselines
                  (tenant_id, user_id, metric_name, baseline_data,
                   sample_count, mean_value, std_dev_value,
                   last_updated_at, valid_from_date, created_at)
                VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, NOW())
                ON CONFLICT (tenant_id, user_id, metric_name)
                  DO UPDATE SET
                    baseline_data   = EXCLUDED.baseline_data,
                    sample_count    = EXCLUDED.sample_count,
                    mean_value      = EXCLUDED.mean_value,
                    std_dev_value   = EXCLUDED.std_dev_value,
                    last_updated_at = EXCLUDED.last_updated_at
                """,
                baseline.tenant_id,
                baseline.user_id,
                baseline.metric_name,
                json.dumps(baseline.baseline_data),
                baseline.sample_count,
                baseline.mean_value,
                baseline.std_dev_value,
                baseline.last_updated_at,
                baseline.valid_from_date,
            )

        # Invalidate cache
        cache_key = (
            f"zf:{baseline.tenant_id}:anomaly:baseline"
            f":{baseline.user_id}:{baseline.metric_name}"
        )
        await get_redis().delete(cache_key)

    # ── List all tenants with baselines ────────────────────────────

    async def get_tenants_with_baselines(self) -> list[str]:
        async with pg_conn() as conn:
            rows = await conn.fetch(
                "SELECT DISTINCT tenant_id FROM anomaly_baselines"
            )
        return [r["tenant_id"] for r in rows]

    # ── List users for a tenant ────────────────────────────────────

    async def get_users_for_tenant(self, tenant_id: str) -> list[str]:
        async with pg_conn() as conn:
            rows = await conn.fetch(
                """
                SELECT DISTINCT actor_user_id::text
                FROM events
                WHERE tenant_id = $1::uuid
                  AND actor_user_id IS NOT NULL
                  AND event_time  >= NOW() - INTERVAL '7 days'
                LIMIT 10000
                """,
                tenant_id,
            )
        return [r["actor_user_id"] for r in rows if r["actor_user_id"]]
