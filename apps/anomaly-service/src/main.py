"""
ZonForge Sentinel — Anomaly Detection Service
FastAPI application entry point.
"""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from fastapi import FastAPI

from src.api.routes import router
from src.config import get_settings
from src.db import (
    close_postgres,
    close_redis,
    init_clickhouse,
    init_postgres,
    init_redis,
)
from src.logger import configure_logging, get_logger
from src.workers.baseline_builder import BaselineBuilder

configure_logging()
log      = get_logger("anomaly-service")
settings = get_settings()


# ── App lifespan ──────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    # ── Startup ──────────────────────────────────────────────────
    log.info("Starting ZonForge Anomaly Service...")

    await init_postgres()
    log.info("✅ PostgreSQL connected")

    init_clickhouse()
    log.info("✅ ClickHouse connected")

    await init_redis()
    log.info("✅ Redis connected")

    # ── Nightly baseline rebuild scheduler ────────────────────────
    builder   = BaselineBuilder()
    scheduler = AsyncIOScheduler()
    scheduler.add_job(
        builder.run_full_rebuild,
        trigger  = CronTrigger.from_crontab(settings.baseline_recalc_cron),
        id       = "nightly_baseline_rebuild",
        name     = "Nightly Baseline Rebuild",
        max_instances = 1,
        misfire_grace_time = 3600,
    )
    scheduler.start()
    log.info(
        "✅ Baseline rebuild scheduler started",
        cron=settings.baseline_recalc_cron,
    )

    # Run initial baseline build 30s after startup
    async def delayed_initial_build() -> None:
        await asyncio.sleep(30)
        log.info("Running initial baseline build...")
        await builder.run_full_rebuild()

    asyncio.create_task(delayed_initial_build())

    log.info(
        "🚀 ZonForge Anomaly Service ready",
        port=settings.port,
        env=settings.env,
        baseline_days=settings.baseline_days,
        zscore_threshold=settings.anomaly_zscore_threshold,
    )

    yield  # App runs here

    # ── Shutdown ─────────────────────────────────────────────────
    log.info("Shutting down anomaly service...")
    scheduler.shutdown(wait=False)
    await close_postgres()
    await close_redis()
    log.info("✅ Anomaly service shut down cleanly")


# ── FastAPI app ───────────────────────────────────────────────────

app = FastAPI(
    title       = "ZonForge Anomaly Service",
    description = "Statistical anomaly detection for ZonForge Sentinel",
    version     = "0.1.0",
    lifespan    = lifespan,
    docs_url    = "/docs" if settings.env != "production" else None,
    redoc_url   = None,
)

app.include_router(router)


# ── Entry point ───────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "src.main:app",
        host    = "0.0.0.0",
        port    = settings.port,
        reload  = settings.env == "development",
        workers = 1 if settings.env == "development" else 2,
        log_config = None,   # Use structlog instead
    )
