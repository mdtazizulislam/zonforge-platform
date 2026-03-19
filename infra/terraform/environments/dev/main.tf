terraform {
  required_version = ">= 1.7.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.40"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Remote state in S3 (bootstrap manually before first apply)
  backend "s3" {
    bucket         = "zonforge-terraform-state-dev"
    key            = "dev/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "zonforge-terraform-locks"
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = merge(var.common_tags, {
      Environment = var.environment
    })
  }
}

# ─────────────────────────────────────────────────────────────────
# MODULE COMPOSITION
# ─────────────────────────────────────────────────────────────────

module "vpc" {
  source = "../../modules/vpc"

  project              = var.project
  environment          = var.environment
  vpc_cidr             = var.vpc_cidr
  availability_zones   = var.availability_zones
  private_subnet_cidrs = var.private_subnet_cidrs
  public_subnet_cidrs  = var.public_subnet_cidrs
  common_tags          = var.common_tags
}

module "rds" {
  source = "../../modules/rds"

  project                  = var.project
  environment              = var.environment
  vpc_id                   = module.vpc.vpc_id
  private_subnet_ids       = module.vpc.private_subnet_ids
  security_group_id        = module.vpc.rds_security_group_id
  db_instance_class        = var.db_instance_class
  db_allocated_storage     = var.db_allocated_storage
  db_max_allocated_storage = var.db_max_allocated_storage
  db_name                  = var.db_name
  db_username              = var.db_username
  common_tags              = var.common_tags
}

module "redis" {
  source = "../../modules/redis"

  project            = var.project
  environment        = var.environment
  private_subnet_ids = module.vpc.private_subnet_ids
  security_group_id  = module.vpc.redis_security_group_id
  node_type          = var.redis_node_type
  num_cache_nodes    = var.redis_num_cache_nodes
  common_tags        = var.common_tags
}

module "s3" {
  source = "../../modules/s3"

  project     = var.project
  environment = var.environment
  common_tags = var.common_tags
}

module "ecr" {
  source = "../../modules/ecr"

  project     = var.project
  environment = var.environment
  services    = var.ecr_services
  common_tags = var.common_tags
}

# ─────────────────────────────────────────────────────────────────
# OUTPUTS
# ─────────────────────────────────────────────────────────────────

output "vpc_id"               { value = module.vpc.vpc_id }
output "private_subnet_ids"   { value = module.vpc.private_subnet_ids }
output "db_endpoint"          { value = module.rds.db_endpoint }
output "db_secret_arn"        { value = module.rds.db_secret_arn }
output "redis_endpoint"       { value = module.redis.redis_endpoint }
output "redis_secret_arn"     { value = module.redis.redis_secret_arn }
output "events_bucket"        { value = module.s3.events_bucket_name }
output "audit_bucket"         { value = module.s3.audit_bucket_name }
output "ecr_repository_urls"  { value = module.ecr.repository_urls }
