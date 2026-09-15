resource "aws_dynamodb_table" "inventory_table" {
    name         = "inventory-items"
    billing_mode = "PAY_PER_REQUEST" # Kosteneffizient: Skaliert auf 0 $, wenn ungenutzt

    # 1. Hauptschlüssel (Primary Key) definieren
    hash_key = "id"

    # 2. Attribute deklarieren, die als Keys genutzt werden
    # Hinweis: In Terraform deklarierst du NUR Attribute, die für Indizes (PK/GSI) benötigt werden.
    # Zusätzliche Felder wie "quantity" oder "category" werden später dynamisch von Lambda eingefügt.
    attribute {
        name = "id"
        type = "S" # S = String (z. B. eine UUID)
    }

    attribute {
        name = "name"
        type = "S" # S = String (für den Such-Index)
    }

    # 3. Such-Index (Global Secondary Index) für die Namenssuche einrichten
    global_secondary_index {
        name               = "NameIndex"
        hash_key           = "name"
        projection_type    = "ALL" # Überträgt alle Attribute des Items in den Index
    }

    # Best Practice für Produktion: Schutz vor versehentlichem Löschen (optional)
    # deletion_protection_enabled = true

    tags = {
        Environment = "Production"
        Project     = "Cloud-Resume-Challenge"
    }
}

