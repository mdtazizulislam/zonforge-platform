"""
ZonForge Sentinel — Database Clients
PostgreSQL (asyncpg), ClickHouse (clickhouse-connect), Redis
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator

import asyncpg
import clickhouse_connect
import redis.asyncio as aioredis

from src.config import get_settings
from src.logger import get_logger

log = get_logger("anomaly-service.db")

# ── PostgreSQL ────────────────────────────────────────────────────

_pg_pool: asyncpg.Pool | None = None


async def init_postgres() -> None:
    global _pg_pool
    settings = get_settings()
    _pg_pool = await asyncpg.create_pool(
        host=settings.postgres_host,
        port=settings.postgres_port,
        database=settings.postgres_db,
        user=settings.postgres_user,
        password=settings.postgres_password,
        ssl=settings.postgres_ssl,
        min_size=2,
        max_size=10,
        command_timeout=30,
    )
    log.info("PostgreSQL pool created")


async def close_postgres() -> None:
    global _pg_pool
    if _pg_pool:
        await _pg_pool.close()
        _pg_pool = None


def get_pg_pool() -> asyncpg.Pool:
    if _pg_pool is None:
        raise RuntimeError("PostgreSQL pool not initialised. Call init_postgres() first.")
    return _pg_pool


@asynccontextmanager
async def pg_conn() -> AsyncGenerator[asyncpg.Connection, None]:
    pool = get_pg_pool()
    async with pool.acquire() as conn:
        yield conn  # type: ignore[misc]


# ── ClickHouse ────────────────────────────────────────────────────

_ch_client: clickhouse_connect.driver.Client | None = None


def init_clickhouse() -> None:
    global _ch_client
    settings = get_settings()
    # Parse host URL to extract scheme/host/port
    host     = settings.clickhouse_host.replace("http://", "").replace("https://", "")
    secure   = settings.clickhouse_host.startswith("https://")
    _ch_client = clickhouse_connect.get_client(
        host=host.split(":")[0],
        port=int(host.split(":")[1]) if ":" in host else (443 if secure else 8123),
        username=settings.clickhouse_user,
        password=settings.clickhouse_password,
        database=settings.clickhouse_db,
        secure=secure,
        compress=True,
        query_limit=0,
    )
    log.info("ClickHouse client created")


def get_ch() -> clickhouse_connect.driver.Client:
    if _ch_client is None:
        raise RuntimeError("ClickHouse not initialised. Call init_clickhouse() first.")
    return _ch_client


def ch_query(sql: str, params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    """Execute a ClickHouse query and return rows as list of dicts."""
    client = get_ch()
    result = client.query(sql, parameters=params or {})
    columns = result.column_names
    return [dict(zip(columns, row)) for row in result.result_rows]


# ── Redis ─────────────────────────────────────────────────────────

_redis: aioredis.Redis | None = None


async def init_redis() -> None:
    global _redis
    settings = get_settings()
    _redis = await aioredis.from_url(
        settings.redis_url,
        encoding="utf-8",
        decode_responses=True,
        max_connections=20,
    )
    await _redis.ping()
    log.info("Redis connected")


async def close_redis() -> None:
    global _redis
    if _redis:
        await _redis.aclose()
        _redis = None


def get_redis() -> aioredis.Redis:
    if _redis is None:
        raise RuntimeError("Redis not initialised. Call init_redis() first.")
    return _redis
