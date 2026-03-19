-- ─────────────────────────────────────────────────────────────────
-- ZonForge Sentinel — PostgreSQL Initialization
-- Runs once on first container startup
-- ─────────────────────────────────────────────────────────────────

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";     -- for text search
CREATE EXTENSION IF NOT EXISTS "btree_gin";   -- for array indexes

-- Ensure the zonforge user owns the database
ALTER DATABASE zonforge OWNER TO zonforge;

-- Create schema (default: public)
-- All ZonForge tables live in the public schema
-- For Enterprise single-tenant, a per-customer schema can be used

-- Optimize for security workloads
ALTER SYSTEM SET shared_preload_libraries = 'pg_stat_statements';
ALTER SYSTEM SET work_mem = '64MB';
ALTER SYSTEM SET maintenance_work_mem = '256MB';
ALTER SYSTEM SET effective_cache_size = '2GB';
ALTER SYSTEM SET random_page_cost = 1.1;           -- SSD-optimized
ALTER SYSTEM SET log_min_duration_statement = 1000; -- Log queries >1s
ALTER SYSTEM SET log_checkpoints = on;
ALTER SYSTEM SET log_connections = on;
ALTER SYSTEM SET log_disconnections = on;
ALTER SYSTEM SET log_lock_waits = on;

-- Row-Level Security note:
-- RLS is enforced at the application layer via WHERE tenant_id = $1
-- DB-level RLS as defense-in-depth is applied via migration 001

COMMENT ON DATABASE zonforge IS 'ZonForge Sentinel — Cyber Early Warning Platform';
