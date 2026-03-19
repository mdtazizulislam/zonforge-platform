# ─────────────────────────────────────────────────────────────────
# ZonForge Sentinel — ECR Repositories Module
# One repo per service, image scanning + lifecycle policy
# ─────────────────────────────────────────────────────────────────

variable "project"     { type = string }
variable "environment" { type = string }
variable "services"    { type = list(string) }
variable "common_tags" { type = map(string) }

resource "aws_ecr_repository" "services" {
  for_each             = toset(var.services)
  name                 = "${var.project}/${each.value}"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true  # Trivy-compatible CVE scanning
  }

  encryption_configuration {
    encryption_type = "KMS"
  }

  tags = merge(var.common_tags, { Service = each.value })
}

# ── Lifecycle policy — keep last 10 images, expire untagged ──────

resource "aws_ecr_lifecycle_policy" "services" {
  for_each   = aws_ecr_repository.services
  repository = each.value.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 10 tagged images"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["v", "sha-"]
          countType     = "imageCountMoreThan"
          countNumber   = 10
        }
        action = { type = "expire" }
      },
      {
        rulePriority = 2
        description  = "Expire untagged images after 7 days"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 7
        }
        action = { type = "expire" }
      }
    ]
  })
}

# ── Outputs ───────────────────────────────────────────────────────

output "repository_urls" {
  value = {
    for k, v in aws_ecr_repository.services : k => v.repository_url
  }
}

output "registry_id" {
  value = values(aws_ecr_repository.services)[0].registry_id
}
