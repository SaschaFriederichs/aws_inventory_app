# 1. Define AWS Provider
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
  }

  # S3 BACKEND CONFIGURATION:
  backend "s3" {
    bucket  = "saschas-terraform-state-bucket"
    key     = "inventory-app/terraform.tfstate"
    region  = "eu-central-1"
    encrypt = true
  }
}

provider "aws" {
  region = "eu-central-1" # Frankfurt
}

# 2. DynamoDB Table for the Inventory
# Defined in dynamodb.tf

# 3. IAM Role for the Lambda Function
resource "aws_iam_role" "lambda_role" {
  name = "inventory-lambda-role-v2"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "://amazonaws.com"
      }
    }]
  })
}

# 4. Policies for the IAM Role (Logs & DynamoDB)
resource "aws_iam_role_policy_attachment" "lambda_logs" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_policy" "lambda_dynamodb" {
  name = "inventory-lambda-dynamodb-policy"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = ["dynamodb:PutItem", "dynamodb:GetItem", "dynamodb:Scan", "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:Query"]
      Resource = [
        aws_dynamodb_table.inventory_table.arn,
        "${aws_dynamodb_table.inventory_table.arn}/index/*" # 🚀 FIX: Allows Lambda to access the search index
      ]
    }]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_dynamodb_attach" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = aws_iam_policy.lambda_dynamodb.arn
}

# 5. DATA RESOURCE: Automated Zipping
data "archive_file" "lambda_zip" {
  type        = "zip"
  source_file = "index.js"
  output_path = "${path.module}/lambda_function.zip"
}

# 6. The Lambda Function
resource "aws_lambda_function" "inventory_api" {
  filename         = data.archive_file.lambda_zip.output_path
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256

  function_name = "inventory-api-handler"
  role          = aws_iam_role.lambda_role.arn
  handler       = "index.handler"
  runtime       = "nodejs18.x"

  environment {
    variables = {
      TABLE_NAME = aws_dynamodb_table.inventory_table.name # 🚀 FIX: References inventory_table
    }
  }

  depends_on = [data.archive_file.lambda_zip]
}

# 7. Create HTTP API Gateway (CORS extended with OPTIONS)
resource "aws_apigatewayv2_api" "http_api" {
  name          = "inventory-http-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["GET", "POST", "DELETE", "OPTIONS"] # 🚀 OPTIONS explicitly allowed
    allow_headers = ["content-type"]
  }
}

# 8. Integration between API Gateway and Lambda (Format set to 2.0)
resource "aws_apigatewayv2_integration" "lambda_integration" {
  api_id           = aws_apigatewayv2_api.http_api.id
  integration_type = "AWS_PROXY"
  integration_uri  = aws_lambda_function.inventory_api.arn

  payload_format_version = "2.0" # 🚀 CRITICAL: Forces AWS to use the modern event format v2
}

# 9. Define Routes
resource "aws_apigatewayv2_route" "get_items" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "GET /items"
  target    = "integrations/${aws_apigatewayv2_integration.lambda_integration.id}"
}

resource "aws_apigatewayv2_route" "post_items" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "POST /items"
  target    = "integrations/${aws_apigatewayv2_integration.lambda_integration.id}"
}

# 🚀 NEW: Intercepts CORS preflight requests directly at the Gateway level
resource "aws_apigatewayv2_route" "options_items" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "OPTIONS /items"
  target    = "integrations/${aws_apigatewayv2_integration.lambda_integration.id}"
}

resource "aws_apigatewayv2_route" "delete_items" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "DELETE /items"
  target    = "integrations/${aws_apigatewayv2_integration.lambda_integration.id}"
}

# 10. Deploy the API Live (Stage)
resource "aws_apigatewayv2_stage" "api_stage" {
  api_id      = aws_apigatewayv2_api.http_api.id
  name        = "$default"
  auto_deploy = true
}

# 11. Grant API Gateway permission to invoke the Lambda function
resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.inventory_api.function_name
  principal     = "://amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http_api.execution_arn}/*/*"
}

# Prints the API URL directly in the terminal after running "apply"
output "api_url" {
  value       = aws_apigatewayv2_stage.api_stage.invoke_url
  description = "The base URL for your frontend"
}

# 12. Random ID generator for a unique bucket name
resource "random_id" "bucket_suffix" {
  byte_length = 4
}

# 13. S3 Bucket for the static frontend
resource "aws_s3_bucket" "frontend" {
  bucket        = "my-inventory-frontend-${random_id.bucket_suffix.hex}"
  force_destroy = true
}

# 14. Enable static website configuration for the bucket
resource "aws_s3_bucket_website_configuration" "frontend_site" {
  bucket = aws_s3_bucket.frontend.id

  index_document {
    suffix = "index.html"
  }
}

# 15. Configure public access settings (required for static websites)
resource "aws_s3_bucket_public_access_block" "frontend_public" {
  bucket = aws_s3_bucket.frontend.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

# 16. Bucket Policy: Grants read access to website files for everyone
resource "aws_s3_bucket_policy" "allow_public_access" {
  bucket     = aws_s3_bucket.frontend.id
  depends_on = [aws_s3_bucket_public_access_block.frontend_public]

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "PublicReadGetObject"
      Effect    = "Allow"
      Principal = "*"
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.frontend.arn}/*"
    }]
  })
}

# Prints the web address for your frontend in the terminal
output "frontend_url" {
  value       = aws_s3_bucket_website_configuration.frontend_site.website_endpoint
  description = "The URL of your inventory website"
}

output "frontend_bucket_name" {
  value       = aws_s3_bucket.frontend.id
  description = "The exact name of the S3 bucket for pipeline synchronization"
}

