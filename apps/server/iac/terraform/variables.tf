variable "aws_profile" {
  description = "Local AWS named profile for the provider. Defaults to 'matheus' for local runs; CI sets TF_VAR_aws_profile=\"\" so the provider uses the runner's env credentials instead."
  type        = string
  default     = "matheus"
}

variable "aws_region" {
  description = "Region the service is deployed to."
  type        = string
  default     = "us-east-1"
}

variable "service_version" {
  description = "Version of the service being deployed. Applied as a tag so the deployed commit is visible in the console; CI passes the short SHA."
  type        = string
  default     = "dev"
}

variable "db_enabled" {
  description = "Whether the deployed Lambda connects to Postgres on boot. Left false because no RDS/VPC is wired up yet — see AppModule's ConditionalModule."
  type        = bool
  default     = false
}

variable "lambda_memory_size" {
  description = "Memory in MB. Nest cold starts are CPU-bound and Lambda scales CPU with memory, so the module's 128MB default is raised here."
  type        = number
  default     = 512
}

variable "lambda_timeout" {
  description = "Execution timeout in seconds. The module default of 3s is not enough for a Nest cold start."
  type        = number
  default     = 15
}
