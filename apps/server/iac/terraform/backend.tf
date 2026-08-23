###############################################################################
# State backend — S3
#
# This is a PARTIAL backend configuration on purpose: the bucket name is not
# committed, so this template can be cloned for a new project without editing
# Terraform. Everything that is the same for every consumer lives here; the
# bucket is supplied at `terraform init` time.
#
# The bucket must already exist (create it manually, or with the AWS CLI):
#
#   aws s3api create-bucket --bucket <your-bucket> --region us-east-1 --profile matheus
#   aws s3api put-bucket-versioning --bucket <your-bucket> \
#     --versioning-configuration Status=Enabled --profile matheus
#
# Local:  cp backend.hcl.example backend.hcl   # then fill in the bucket
#         terraform init -backend-config=backend.hcl
#         (deploy.sh does this for you)
# CI:     terraform init \
#           -backend-config="bucket=$TF_STATE_BUCKET" \
#           -backend-config="region=us-east-1"
#
# The AWS profile is deliberately not hardcoded so the same config works in CI:
#   - Local: backend.hcl carries `profile = "matheus"`.
#   - CI:    no profile; the runner's AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
#            are picked up by the default credential chain.
###############################################################################

terraform {
  backend "s3" {
    key                  = "terraform.tfstate"
    workspace_key_prefix = "env"
    region               = "us-east-1"

    # Native S3 state locking (Terraform >= 1.10) — no DynamoDB table needed.
    use_lockfile = true
  }
}
