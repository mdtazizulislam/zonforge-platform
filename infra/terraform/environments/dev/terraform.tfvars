project     = "zonforge"
environment = "dev"
aws_region  = "us-east-1"

# VPC
vpc_cidr             = "10.0.0.0/16"
availability_zones   = ["us-east-1a", "us-east-1b", "us-east-1c"]
private_subnet_cidrs = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
public_subnet_cidrs  = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]

# RDS — smaller instance for dev
db_instance_class        = "db.t3.medium"
db_allocated_storage     = 50
db_max_allocated_storage = 200
db_name                  = "zonforge"
db_username              = "zonforge"

# Redis — single node for dev
redis_node_type       = "cache.t3.micro"
redis_num_cache_nodes = 1

# EKS
eks_cluster_version     = "1.29"
eks_node_instance_types = ["t3.large"]
eks_node_min_size       = 1
eks_node_max_size       = 5
eks_node_desired_size   = 2

common_tags = {
  Project   = "zonforge-sentinel"
  ManagedBy = "terraform"
  Owner     = "platform-team"
  CostCenter = "engineering"
}
