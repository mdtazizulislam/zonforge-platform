# ─────────────────────────────────────────────────────────────────
# ZonForge Sentinel — S3 Buckets Module
# events / exports / audit (WORM) buckets
# ─────────────────────────────────────────────────────────────────

variable "project"     { type = string }
variable "environment" { type = string }
variable "common_tags" { type = map(string) }

locals {
  buckets = {
    events  = "${var.project}-events-${var.environment}"
    exports = "${var.project}-exports-${var.environment}"
    audit   = "${var.project}-audit-${var.environment}"
  }
}

# ── KMS key for S3 ────────────────────────────────────────────────

resource "aws_kms_key" "s3" {
  description             = "${var.project}-${var.environment}-s3-key"
  deletion_window_in_days = 7
  enable_key_rotation     = true
  tags                    = var.common_tags
}

# ── Events Bucket (hot event archive) ────────────────────────────

resource "aws_s3_bucket" "events" {
  bucket        = local.buckets.events
  force_destroy = var.environment != "prod"
  tags          = merge(var.common_tags, { Name = local.buckets.events, Purpose = "event-archive" })
}

resource "aws_s3_bucket_versioning" "events" {
  bucket = aws_s3_bucket.events.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "events" {
  bucket = aws_s3_bucket.events.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.s3.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "events" {
  bucket = aws_s3_bucket.events.id

  rule {
    id     = "transition-to-cold"
    status = "Enabled"

    transition {
      days          = 90
      storage_class = "STANDARD_IA"
    }

    transition {
      days          = 180
      storage_class = "GLACIER_IR"
    }

    expiration {
      days = 400  # Enterprise max retention + buffer
    }
  }
}

resource "aws_s3_bucket_public_access_block" "events" {
  bucket                  = aws_s3_bucket.events.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ── Exports Bucket (reports / evidence exports) ───────────────────

resource "aws_s3_bucket" "exports" {
  bucket        = local.buckets.exports
  force_destroy = var.environment != "prod"
  tags          = merge(var.common_tags, { Name = local.buckets.exports, Purpose = "exports" })
}

resource "aws_s3_bucket_server_side_encryption_configuration" "exports" {
  bucket = aws_s3_bucket.exports.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.s3.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "exports" {
  bucket = aws_s3_bucket.exports.id
  rule {
    id     = "expire-exports"
    status = "Enabled"
    expiration { days = 90 }  # Exports expire after 90 days
  }
}

resource "aws_s3_bucket_public_access_block" "exports" {
  bucket                  = aws_s3_bucket.exports.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ── Audit Bucket (WORM — immutable audit logs) ───────────────────

resource "aws_s3_bucket" "audit" {
  bucket        = local.buckets.audit
  force_destroy = false  # Never force-destroy audit bucket
  tags          = merge(var.common_tags, { Name = local.buckets.audit, Purpose = "audit-worm" })
}

resource "aws_s3_bucket_versioning" "audit" {
  bucket = aws_s3_bucket.audit.id
  versioning_configuration { status = "Enabled" }
}

# WORM — Object Lock prevents deletion for 7 years
resource "aws_s3_bucket_object_lock_configuration" "audit" {
  bucket = aws_s3_bucket.audit.id

  rule {
    default_retention {
      mode  = "COMPLIANCE"
      years = 7
    }
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "audit" {
  bucket = aws_s3_bucket.audit.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.s3.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "audit" {
  bucket                  = aws_s3_bucket.audit.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ── Outputs ───────────────────────────────────────────────────────

output "events_bucket_name"  { value = aws_s3_bucket.events.id }
output "exports_bucket_name" { value = aws_s3_bucket.exports.id }
output "audit_bucket_name"   { value = aws_s3_bucket.audit.id }
output "s3_kms_key_arn"      { value = aws_kms_key.s3.arn }
