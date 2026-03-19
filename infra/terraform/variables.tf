variable "project" {
  description = "Project name prefix for all resources"
  type        = string
  default     = "zonforge"
}

variable "environment" {
  description = "Deployment environment (dev / staging / prod)"
  type        = string
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be dev, staging, or prod."
  }
}

variable "aws_region" {
  description = "Primary AWS region"
  type        = string
  default     = "us-east-1"
}

variable "aws_region_eu" {
  description = "EU AWS region for data residency"
  type        = string
  default     = "eu-west-1"
}

# ── VPC ───────────────────────────────────────

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "AZs to use in the primary region"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b", "us-east-1c"]
}

variable "private_subnet_cidrs" {
  type    = list(string)
  default = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
}

variable "public_subnet_cidrs" {
  type    = list(string)
  default = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]
}

# ── RDS PostgreSQL ────────────────────────────

variable "db_instance_class" {
  type    = string
  default = "db.t3.medium"
}

variable "db_allocated_storage" {
  type    = number
  default = 100
}

variable "db_max_allocated_storage" {
  type    = number
  default = 1000
}

variable "db_name" {
  type    = string
  default = "zonforge"
}

variable "db_username" {
  type    = string
  default = "zonforge"
}

# ── ElastiCache Redis ─────────────────────────

variable "redis_node_type" {
  type    = string
  default = "cache.t3.medium"
}

variable "redis_num_cache_nodes" {
  type    = number
  default = 2
}

# ── EKS ──────────────────────────────────────

variable "eks_cluster_version" {
  type    = string
  default = "1.29"
}

variable "eks_node_instance_types" {
  type    = list(string)
  default = ["t3.large"]
}

variable "eks_node_min_size" {
  type    = number
  default = 2
}

variable "eks_node_max_size" {
  type    = number
  default = 10
}

variable "eks_node_desired_size" {
  type    = number
  default = 3
}

# ── ECR ──────────────────────────────────────

variable "ecr_services" {
  description = "List of service names that need ECR repos"
  type        = list(string)
  default = [
    "auth-service",
    "tenant-service",
    "ingestion-service",
    "normalization-worker",
    "detection-engine",
    "anomaly-service",
    "correlation-engine",
    "risk-scoring-engine",
    "alert-service",
    "threat-intel-service",
    "playbook-engine",
    "web-dashboard",
    "m365-collector",
    "aws-cloudtrail-collector",
    "google-workspace-collector",
  ]
}

# ── Tags ─────────────────────────────────────

variable "common_tags" {
  description = "Tags applied to all resources"
  type        = map(string)
  default = {
    Project     = "zonforge-sentinel"
    ManagedBy   = "terraform"
    Owner       = "platform-team"
  }
}
