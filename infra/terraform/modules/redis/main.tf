# ─────────────────────────────────────────────────────────────────
# ZonForge Sentinel — ElastiCache Redis Module
# Cluster mode disabled (for simplicity), Multi-AZ with failover
# ─────────────────────────────────────────────────────────────────

variable "project"             { type = string }
variable "environment"         { type = string }
variable "private_subnet_ids"  { type = list(string) }
variable "security_group_id"   { type = string }
variable "node_type"           { type = string }
variable "num_cache_nodes"     { type = number }
variable "common_tags"         { type = map(string) }

# ── KMS key ───────────────────────────────────────────────────────

resource "aws_kms_key" "redis" {
  description             = "${var.project}-${var.environment}-redis-key"
  deletion_window_in_days = 7
  enable_key_rotation     = true
  tags                    = var.common_tags
}

# ── Auth token (stored in Secrets Manager) ────────────────────────

resource "random_password" "redis_auth" {
  length  = 32
  special = false
}

resource "aws_secretsmanager_secret" "redis_auth" {
  name                    = "${var.project}/${var.environment}/redis/auth-token"
  recovery_window_in_days = 7
  tags                    = var.common_tags
}

resource "aws_secretsmanager_secret_version" "redis_auth" {
  secret_id     = aws_secretsmanager_secret.redis_auth.id
  secret_string = jsonencode({
    host      = aws_elasticache_replication_group.main.primary_endpoint_address
    port      = 6379
    password  = random_password.redis_auth.result
    tls       = true
  })
}

# ── Subnet Group ──────────────────────────────────────────────────

resource "aws_elasticache_subnet_group" "main" {
  name       = "${var.project}-${var.environment}-redis-subnet"
  subnet_ids = var.private_subnet_ids
  tags       = var.common_tags
}

# ── Parameter Group ───────────────────────────────────────────────

resource "aws_elasticache_parameter_group" "redis7" {
  name   = "${var.project}-${var.environment}-redis7"
  family = "redis7"

  parameter {
    name  = "maxmemory-policy"
    value = "allkeys-lru"
  }

  parameter {
    name  = "notify-keyspace-events"
    value = "Ex"   # Expired key events (for TTL monitoring)
  }

  tags = var.common_tags
}

# ── Replication Group ─────────────────────────────────────────────

resource "aws_elasticache_replication_group" "main" {
  replication_group_id = "${var.project}-${var.environment}-redis"
  description          = "ZonForge Sentinel Redis — ${var.environment}"

  # Engine
  engine               = "redis"
  engine_version       = "7.1"
  node_type            = var.node_type
  num_cache_clusters   = var.environment == "prod" ? 2 : 1
  port                 = 6379

  # Network
  subnet_group_name  = aws_elasticache_subnet_group.main.name
  security_group_ids = [var.security_group_id]

  # Security
  at_rest_encryption_enabled  = true
  transit_encryption_enabled  = true
  auth_token                  = random_password.redis_auth.result
  kms_key_id                  = aws_kms_key.redis.arn

  # HA
  automatic_failover_enabled = var.environment == "prod" ? true : false
  multi_az_enabled           = var.environment == "prod" ? true : false

  # Backups
  snapshot_retention_limit   = var.environment == "prod" ? 7 : 1
  snapshot_window            = "05:00-06:00"
  maintenance_window         = "mon:06:00-mon:07:00"

  # Parameters
  parameter_group_name = aws_elasticache_parameter_group.redis7.name

  apply_immediately          = var.environment != "prod"
  auto_minor_version_upgrade = true

  tags = merge(var.common_tags, {
    Name = "${var.project}-${var.environment}-redis"
  })
}

# ── Outputs ───────────────────────────────────────────────────────

output "redis_endpoint"    { value = aws_elasticache_replication_group.main.primary_endpoint_address }
output "redis_port"        { value = 6379 }
output "redis_secret_arn"  { value = aws_secretsmanager_secret.redis_auth.arn }
