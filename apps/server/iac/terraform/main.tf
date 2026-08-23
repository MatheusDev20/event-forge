terraform {
  required_version = ">= 1.3"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
  # Local runs use a named profile (default "matheus" — see variables.tf).
  # CI sets TF_VAR_aws_profile="" so this resolves to null and the provider
  # falls back to the default credential chain (env vars on the runner).
  profile = var.aws_profile != "" ? var.aws_profile : null
}

##############################################
# ------------ AWS Current User ------------ #
##############################################
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  stage        = terraform.workspace == "default" ? "prod" : terraform.workspace
  service_name = "js_full_stack_template"
  lambda_name  = "${local.service_name}__${local.stage}"

  # esbuild writes exactly one file here (dist-lambda/index.js). The module runs
  # its own archive_file over this directory, so it must contain the bundle and
  # nothing else — never point this at a .zip.
  bundle_dir = "${path.module}/../../dist-lambda"

  tags = {
    Service   = local.service_name
    Stage     = local.stage
    Version   = var.service_version
    ManagedBy = "terraform"
  }
}

module "api" {
  source = "git::https://github.com/MatheusDev20/terraform-modules.git//lambda-wrapper?ref=v0.1.0"

  function_name = local.lambda_name
  description   = "NestJS API for ${local.service_name} (${local.stage})"

  source_dir = local.bundle_dir
  handler    = "index.handler"
  runtime    = "nodejs22.x"

  memory_size = var.lambda_memory_size
  timeout     = var.lambda_timeout

  environment_variables = {
    NODE_ENV   = "production"
    DB_ENABLED = tostring(var.db_enabled)
  }

  # Gives the function a public HTTPS endpoint without an API Gateway. The Nest
  # app sets its own CORS headers, so the function URL's CORS is left unset.
  create_function_url             = true
  function_url_authorization_type = "NONE"

  tags = local.tags
}
