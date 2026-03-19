"""
ZonForge Sentinel — Baseline Builder

Nightly cron job that rebuilds all per-user baselines
from the last 30 days of ClickHouse events.

Schedule: 2 AM UTC daily (configurable)
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from src.config import get_settings
from src.db import ch_query, get_redis
from src.logger import get_logger
from src.models.detectors import (
    ApiVolumeDetector,
    DataDownloadDetector,
    DeviceFingerprintDetector,
    LoginLocationDetector,
    LoginTimeDetector,
)
from src.services.baseline_store import BaselineStore

log = get_logger("anomaly-service.baseline-builder")


class BaselineBuilder:
    """
    Rebuilds all baselines for all active users across all tenants.
    Runs nightly to ensure baselines stay current.
    """

    def __init__(self) -> None:
        self.settings = get_settings()
        self.store    = BaselineStore()
        self.detectors = [
            LoginTimeDetector(self.store, self.settings),
            LoginLocationDetector(self.store, self.settings),
            ApiVolumeDetector(self.store, self.settings),
            DataDownloadDetector(self.store, self.settings),
            DeviceFingerprintDetector(self.store, self.settings),
        ]

    async def run_full_rebuild(self) -> dict[str, int]:
        """
        Rebuild baselines for all active users.
        Returns stats: {tenants, users, baselines_built, errors}
        """
        start     = datetime.now(tz=timezone.utc)
        stats     = {"tenants": 0, "users": 0, "baselines_built": 0, "errors": 0}

        log.info("Starting nightly baseline rebuild...")

        # Get all tenants with recent activity
        tenants = await self._get_active_tenants()
        stats["tenants"] = len(tenants)
        log.info(f"Found {len(tenants)} active tenants")

        for tenant_id in tenants:
            try:
                tenant_stats = await self._rebuild_tenant_baselines(tenant_id)
                stats["users"]            += tenant_stats["users"]
                stats["baselines_built"]  += tenant_stats["baselines_built"]
                stats["errors"]           += tenant_stats["errors"]
            except Exception as exc:
                log.error("Tenant baseline rebuild failed",
                          tenant_id=tenant_id, error=str(exc))
                stats["errors"] += 1

        duration_s = (datetime.now(tz=timezone.utc) - start).total_seconds()
        log.info(
            "Nightly baseline rebuild complete",
            duration_seconds=duration_s,
            **stats,
        )
        return stats

    async def _rebuild_tenant_baselines(
        self, tenant_id: str,
    ) -> dict[str, int]:
        stats = {"users": 0, "baselines_built": 0, "errors": 0}

        # Get active users for this tenant (seen in last 7 days)
        users = await self.store.get_users_for_tenant(tenant_id)
        stats["users"] = len(users)

        if not users:
            return stats

        log.debug(f"Rebuilding baselines for {len(users)} users in tenant {tenant_id[:8]}")

        for user_id in users:
            for detector in self.detectors:
                try:
                    baseline = await detector.build_baseline(tenant_id, user_id)
                    if baseline.sample_count >= self.settings.min_samples_for_baseline:
                        await self.store.save_baseline(baseline)
                        stats["baselines_built"] += 1
                except Exception as exc:
                    log.warning(
                        "Baseline build failed",
                        tenant_id=tenant_id,
                        user_id=user_id,
                        metric=getattr(detector, "METRIC", "unknown"),
                        error=str(exc),
                    )
                    stats["errors"] += 1

            # Small delay between users to avoid overwhelming ClickHouse
            await asyncio.sleep(0.05)

        return stats

    async def _get_active_tenants(self) -> list[str]:
        """Get tenant IDs with events in the last 7 days."""
        rows = ch_query(
            """
            SELECT DISTINCT tenant_id::String AS tenant_id
            FROM events
            WHERE event_time >= now() - INTERVAL 7 DAY
            LIMIT 10000
            """,
        )
        return [r["tenant_id"] for r in rows if r.get("tenant_id")]

    async def rebuild_user(
        self, tenant_id: str, user_id: str,
    ) -> dict[str, int]:
        """Rebuild baselines for a single user (on-demand)."""
        stats = {"baselines_built": 0, "errors": 0}
        for detector in self.detectors:
            try:
                baseline = await detector.build_baseline(tenant_id, user_id)
                if baseline.sample_count >= self.settings.min_samples_for_baseline:
                    await self.store.save_baseline(baseline)
                    stats["baselines_built"] += 1
            except Exception as exc:
                log.warning("On-demand baseline build failed",
                            user_id=user_id, error=str(exc))
                stats["errors"] += 1
        return stats
