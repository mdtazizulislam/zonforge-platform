# ─────────────────────────────────────────────────────────────────
# ZonForge Sentinel — RDS PostgreSQL Module
# Multi-AZ, encrypted, automated backups, enhanced monitoring
# ─────────────────────────────────────────────────────────────────

variable "project"                  { type = string }
variable "environment"              { type = string }
variable "vpc_id"                   { type = string }
variable "private_subnet_ids"       { type = list(string) }
variable "security_group_id"        { type = string }
variable "db_instance_class"        { type = string }
variable "db_allocated_storage"     { type = number }
variable "db_max_allocated_storage" { type = number }
variable "db_name"                  { type = string }
variable "db_username"              { type = string }
variable "common_tags"              { type = map(string) }

# ── KMS key for RDS encryption ────────────────────────────────────

resource "aws_kms_key" "rds" {
  description             = "${var.project}-${var.environment}-rds-key"
  deletion_window_in_days = 7
  enable_key_rotation     = true
  tags                    = var.common_tags
}

resource "aws_kms_alias" "rds" {
  name          = "alias/${var.project}-${var.environment}-rds"
  target_key_id = aws_kms_key.rds.key_id
}

# ── DB Subnet Group ───────────────────────────────────────────────

resource "aws_db_subnet_group" "main" {
  name       = "${var.project}-${var.environment}-db-subnet-group"
  subnet_ids = var.private_subnet_ids

  tags = merge(var.common_tags, {
    Name = "${var.project}-${var.environment}-db-subnet-group"
  })
}

# ── DB Parameter Group ────────────────────────────────────────────

resource "aws_db_parameter_group" "postgres16" {
  name   = "${var.project}-${var.environment}-postgres16"
  family = "postgres16"

  parameter {
    name  = "shared_preload_libraries"
    value = "pg_stat_statements"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = "1000"  # Log queries over 1 second
  }

  parameter {
    name  = "log_connections"
    value = "1"
  }

  parameter {
    name  = "log_disconnections"
    value = "1"
  }

  parameter {
    name  = "log_lock_waits"
    value = "1"
  }

  parameter {
    name  = "work_mem"
    value = "65536"  # 64MB
  }

  tags = var.common_tags
}

# ── RDS Password (Secrets Manager) ───────────────────────────────

resource "aws_secretsmanager_secret" "db_password" {
  name                    = "${var.project}/${var.environment}/db/password"
  description             = "PostgreSQL master password for ZonForge ${var.environment}"
  recovery_window_in_days = 7
  tags                    = var.common_tags
}

resource "aws_secretsmanager_secret_version" "db_password" {
  secret_id     = aws_secretsmanager_secret.db_password.id
  secret_string = jsonencode({
    username = var.db_username
    password = random_password.db.result
    host     = aws_db_instance.main.address
    port     = 5432
    dbname   = var.db_name
    url      = "postgresql://${var.db_username}:${random_password.db.result}@${aws_db_instance.main.address}:5432/${var.db_name}?sslmode=require"
  })
}

resource "random_password" "db" {
  length           = 32
  special          = true
  override_special = "!#$%^&*()-_=+[]{}:?"
}

# ── RDS Instance ──────────────────────────────────────────────────

resource "aws_db_instance" "main" {
  identifier = "${var.project}-${var.environment}-postgres"

  # Engine
  engine         = "postgres"
  engine_version = "16.2"
  instance_class = var.db_instance_class

  # Storage
  allocated_storage     = var.db_allocated_storage
  max_allocated_storage = var.db_max_allocated_storage
  storage_type          = "gp3"
  storage_encrypted     = true
  kms_key_id            = aws_kms_key.rds.arn

  # Database
  db_name  = var.db_name
  username = var.db_username
  password = random_password.db.result

  # Network
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [var.security_group_id]
  publicly_accessible    = false
  port                   = 5432

  # HA
  multi_az = var.environment == "prod" ? true : false

  # Backups
  backup_retention_period   = var.environment == "prod" ? 30 : 7
  backup_window             = "03:00-04:00"
  maintenance_window        = "Mon:04:00-Mon:05:00"
  delete_automated_backups  = false
  skip_final_snapshot       = var.environment != "prod"
  final_snapshot_identifier = var.environment == "prod" ? "${var.project}-${var.environment}-final" : null

  # Monitoring
  monitoring_interval          = 60
  monitoring_role_arn          = aws_iam_role.rds_monitoring.arn
  performance_insights_enabled = true
  performance_insights_kms_key_id = aws_kms_key.rds.arn

  # Parameters
  parameter_group_name = aws_db_parameter_group.postgres16.name

  # Misc
  auto_minor_version_upgrade = true
  copy_tags_to_snapshot      = true
  deletion_protection        = var.environment == "prod" ? true : false

  tags = merge(var.common_tags, {
    Name        = "${var.project}-${var.environment}-postgres"
    Environment = var.environment
  })
}

# ── IAM Role for Enhanced Monitoring ─────────────────────────────

resource "aws_iam_role" "rds_monitoring" {
  name = "${var.project}-${var.environment}-rds-monitoring"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "monitoring.rds.amazonaws.com" }
    }]
  })

  tags = var.common_tags
}

resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  role       = aws_iam_role.rds_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

# ── Outputs ───────────────────────────────────────────────────────

output "db_endpoint"          { value = aws_db_instance.main.address }
output "db_port"              { value = aws_db_instance.main.port }
output "db_name"              { value = aws_db_instance.main.db_name }
output "db_secret_arn"        { value = aws_secretsmanager_secret.db_password.arn }
output "db_kms_key_arn"       { value = aws_kms_key.rds.arn }
