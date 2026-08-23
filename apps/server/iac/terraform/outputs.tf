output "function_name" {
  description = "Name of the deployed Lambda function."
  value       = module.api.function_name
}

output "function_url" {
  description = "Public HTTPS endpoint for the API. Health check lives at <url>health."
  value       = module.api.function_url
}

output "log_group_name" {
  description = "CloudWatch log group to tail when debugging a deploy."
  value       = module.api.log_group_name
}

output "aws_account_id" {
  description = "Account the service was deployed into."
  value       = data.aws_caller_identity.current.account_id
}
