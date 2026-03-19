"""
ZonForge Sentinel — Anomaly Service Configuration
All settings validated via pydantic-settings at startup.
"""
from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="ZONFORGE_",
        env_file=".env.local",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── App ───────────────────────────────────────
    env: Literal["development", "test", "staging", "production"] = "development"
    log_level: str = "INFO"
    port: int = Field(default=3004, ge=1, le=65535)

    # ── PostgreSQL ────────────────────────────────
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_db: str = "zonforge"
    postgres_user: str = "zonforge"
    postgres_password: str
    postgres_ssl: bool = False

    # ── ClickHouse ────────────────────────────────
    clickhouse_host: str = "http://localhost:8123"
    clickhouse_db: str = "zonforge_events"
    clickhouse_user: str = "default"
    clickhouse_password: str = ""

    # ── Redis ─────────────────────────────────────
    redis_host: str = "localhost"
    redis_port: int = 6379
    redis_password: str | None = None
    redis_tls: bool = False

    # ── Detection queue (internal API) ────────────
    detection_api_url: str = "http://localhost:3003"
    ingestion_api_url: str = "http://localhost:3001"

    # ── Anomaly settings ──────────────────────────
    baseline_days: int = Field(default=30, ge=7, le=90)
    min_samples_for_baseline: int = Field(default=10, ge=5)
    anomaly_zscore_threshold: float = Field(default=2.5, ge=1.5, le=5.0)
    anomaly_confidence_base: float = Field(default=0.70, ge=0.5, le=1.0)

    # ── Cron schedule ─────────────────────────────
    baseline_recalc_cron: str = "0 2 * * *"   # 2 AM daily

    @property
    def postgres_dsn(self) -> str:
        ssl = "?sslmode=require" if self.postgres_ssl else ""
        return (
            f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}{ssl}"
        )

    @property
    def redis_url(self) -> str:
        password_part = f":{self.redis_password}@" if self.redis_password else ""
        scheme = "rediss" if self.redis_tls else "redis"
        return f"{scheme}://{password_part}{self.redis_host}:{self.redis_port}/0"


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
