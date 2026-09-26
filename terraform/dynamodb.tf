resource "aws_dynamodb_table" "inventory_table" {
  name         = "inventory-items"
  billing_mode = "PAY_PER_REQUEST" # Cost-effective: Scales down to $0 when idle

  # 1. Define the Primary Key
  hash_key = "id"

  # 2. Declare attributes used as keys
  # Note: In Terraform, you ONLY declare attributes required for indexes (PK/GSI).
  # Additional fields like "quantity" or "category" are inserted dynamically later by Lambda.
  attribute {
    name = "id"
    type = "S" # S = String (e.g., a UUID)
  }

  attribute {
    name = "name"
    type = "S" # S = String (for the search index)
  }

  # 3. Set up a Global Secondary Index (GSI) for name-based lookups
  global_secondary_index {
    name            = "NameIndex"
    hash_key        = "name"
    projection_type = "ALL" # Projects all attributes of the item into the index
  }

  # Production Best Practice: Protection against accidental deletion (optional)
  # deletion_protection_enabled = true

  tags = {
    Environment = "Production"
    Project     = "AWS-Inventory-App"
  }
}

