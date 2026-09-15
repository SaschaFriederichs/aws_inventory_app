# 1. AWS Provider definieren
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

    # HIER WIRD DAS S3 BACKEND HINZUGEFÜGT:
    backend "s3" {
        bucket         = "saschas-terraform-state-bucket" 
        key            = "inventory-app/terraform.tfstate" 
        region         = "eu-central-1"                    
        encrypt        = true                              
    }
}

provider "aws" {
    region = "eu-central-1" # Frankfurt
}

# 2. DynamoDB Tabelle für das Inventar
# Defined in dynamodb.tf

# 3. IAM-Rolle für die Lambda-Funktion
resource "aws_iam_role" "lambda_role" {
    name = "inventory-lambda-role-v2" 

    assume_role_policy = jsonencode({
        Version = "2012-10-17"
        Statement = [{
            Action    = "sts:AssumeRole"
            Effect    = "Allow"
            Principal = { 
                Service = "lambda.amazonaws.com"
            }
        }]
    })
}

# 4. Richtlinien für die IAM-Rolle (Logs & DynamoDB)
resource "aws_iam_role_policy_attachment" "lambda_logs" {
    role       = aws_iam_role.lambda_role.name
    policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_policy" "lambda_dynamodb" {
    name = "inventory-lambda-dynamodb-policy"
    policy = jsonencode({
        Version = "2012-10-17"
        Statement = [{
            Effect   = "Allow"
            Action   = ["dynamodb:PutItem", "dynamodb:GetItem", "dynamodb:Scan", "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:Query"]
            Resource = [
                aws_dynamodb_table.inventory_table.arn,
                "${aws_dynamodb_table.inventory_table.arn}/index/*" # 🚀 KORREKTUR: Erlaubt Lambda den Zugriff auf den Such-Index
            ]
        }]
    })
}

resource "aws_iam_role_policy_attachment" "lambda_dynamodb_attach" {
    role       = aws_iam_role.lambda_role.name
    policy_arn = aws_iam_policy.lambda_dynamodb.arn
}

# 5. DATA RESOURCE: Das automatische Zippen
data "archive_file" "lambda_zip" {
    type        = "zip"
    source_file = "index.js"
    output_path = "${path.module}/lambda_function.zip"
}

# 6. Die Lambda-Funktion selbst
resource "aws_lambda_function" "inventory_api" {
    filename         = data.archive_file.lambda_zip.output_path
    source_code_hash = data.archive_file.lambda_zip.output_base64sha256
  
    function_name    = "inventory-api-handler"
    role             = aws_iam_role.lambda_role.arn
    handler          = "index.handler"
    runtime          = "nodejs18.x"

    environment {
        variables = {
            TABLE_NAME = aws_dynamodb_table.inventory_table.name # 🚀 KORREKTUR: Verweist auf inventory_table
        }
    }

    depends_on = [data.archive_file.lambda_zip]
}

# 7. Das HTTP API Gateway erstellen
resource "aws_apigatewayv2_api" "http_api" {
    name          = "inventory-http-api"
    protocol_type = "HTTP"
  
    cors_configuration {
        allow_origins = ["*"] 
        allow_methods = ["GET", "POST", "DELETE", "OPTIONS"]
        allow_headers = ["content-type"]
    }
}

# 8. Die Verbindung (Integration) zwischen API Gateway und Lambda
resource "aws_apigatewayv2_integration" "lambda_integration" {
    api_id           = aws_apigatewayv2_api.http_api.id
    integration_type = "AWS_PROXY"
    integration_uri  = aws_lambda_function.inventory_api.arn
}

# 9. Routen definieren (Wohin gehen GET, POST, DELETE?)
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

resource "aws_apigatewayv2_route" "delete_items" {
    api_id    = aws_apigatewayv2_api.http_api.id
    route_key = "DELETE /items"
    target    = "integrations/${aws_apigatewayv2_integration.lambda_integration.id}"
}

# 10. Die API live schalten (Stage)
resource "aws_apigatewayv2_stage" "api_stage" {
    api_id      = aws_apigatewayv2_api.http_api.id
    name        = "$default"
    auto_deploy = true
}

# 11. Erlaubnis für API Gateway, die Lambda-Funktion überhaupt aufzurufen
resource "aws_lambda_permission" "api_gateway" {
    statement_id  = "AllowExecutionFromAPIGateway"
    action        = "lambda:InvokeFunction"
    function_name = aws_lambda_function.inventory_api.function_name
    principal     = "apigateway.amazonaws.com"
    source_arn    = "${aws_apigatewayv2_api.http_api.execution_arn}/*/*"
}

# Gibt Ihnen die API-URL direkt nach dem "apply" im Terminal aus!
output "api_url" {
    value       = aws_apigatewayv2_stage.api_stage.invoke_url
    description = "Die Basis-URL für Ihr Frontend"
}

# 12. Zufallsgenerator für einen einzigartigen Bucket-Namen
resource "random_id" "bucket_suffix" {
    byte_length = 4
}

# 13. S3 Bucket für das statische Frontend
resource "aws_s3_bucket" "frontend" {
    bucket        = "my-inventory-frontend-${random_id.bucket_suffix.hex}"
    force_destroy = true 
}

# 14. Website-Konfiguration für den Bucket aktivieren
resource "aws_s3_bucket_website_configuration" "frontend_site" {
    bucket = aws_s3_bucket.frontend.id

    index_document {
        suffix = "index.html"
    }
}

# 15. Öffentlichen Zugriff erlauben (für statische Websites nötig)
resource "aws_s3_bucket_public_access_block" "frontend_public" {
    bucket = aws_s3_bucket.frontend.id

    block_public_acls       = false
    block_public_policy     = false
    ignore_public_acls      = false
    restrict_public_buckets = false
}

# 16. Bucket-Richtlinie: Jeder darf die Website-Dateien lesen
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

# Gibt Ihnen die Web-Adresse für Ihr Frontend im Terminal aus!
output "frontend_url" {
    value       = aws_s3_bucket_website_configuration.frontend_site.website_endpoint
    description = "Die URL Ihrer Inventory-Website"
}

output "frontend_bucket_name" {
    value       = aws_s3_bucket.frontend.id
    description = "Der exakte Name des S3-Buckets fuer die Pipeline"
}

