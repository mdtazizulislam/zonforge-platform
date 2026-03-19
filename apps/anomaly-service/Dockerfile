# ─────────────────────────────────────────────────────────────────
# ZonForge Sentinel — anomaly-service Dockerfile
# Multi-stage Python build, non-root, minimal image
# ─────────────────────────────────────────────────────────────────

FROM python:3.11-slim AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev && \
    rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./

# Install dependencies into /app/venv
RUN python -m venv /app/venv && \
    /app/venv/bin/pip install --upgrade pip && \
    /app/venv/bin/pip install -e ".[dev]" --no-cache-dir

COPY src/ ./src/
COPY tests/ ./tests/

# ── Production image ──────────────────────────────────────────────

FROM python:3.11-slim AS production

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 && \
    rm -rf /var/lib/apt/lists/* && \
    addgroup --gid 1001 zonforge && \
    adduser --uid 1001 --gid 1001 --no-create-home --disabled-password zonforge

WORKDIR /app

COPY --from=builder --chown=zonforge:zonforge /app/venv   ./venv
COPY --from=builder --chown=zonforge:zonforge /app/src     ./src
COPY --from=builder --chown=zonforge:zonforge /app/pyproject.toml ./

ENV PATH="/app/venv/bin:$PATH" \
    PYTHONPATH="/app" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

USER zonforge

EXPOSE 3004

HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=3 \
  CMD python -c "import httpx; httpx.get('http://localhost:3004/health').raise_for_status()"

CMD ["python", "-m", "src.main"]
