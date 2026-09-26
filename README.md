# Serverless Inventory App (Infrastructure as Code)

**Welcome to the repository of the Serverless Inventory Application!** This project demonstrates a fully automated, event-driven CRUD (Create, Read, Update, Delete) application built on Amazon Web Services (AWS). The entire infrastructure is provisioned programmatically using Infrastructure as Code (IaC) and deployed via an automated CI/CD pipeline.

You can launch and test the live frontend application here: **[Live Inventory App](https://sascha-friederichs.de)**

---

## 🛠️ Tech Stack & Architecture

This application decouples static frontend hosting from a highly scalable, zero-maintenance backend stack.

*   **Infrastructure as Code (IaC):** [Terraform](https://terraform.io) for modular, human-readable infrastructure definitions (HCL) and environment consistency.
*   **CI/CD Pipeline:** [GitHub Actions](https://github.com) for automated linting, Terraform planning/applying, and frontend asset synchronization.
*   **Frontend Hosting:** [Amazon S3](https://amazon.com) configured for static website hosting.
*   **API Gateway:** [Amazon API Gateway](https://amazon.com) acting as the secure HTTP entry point routing frontend requests.
*   **Compute (Backend Logic):** [AWS Lambda](https://amazon.com) handling serverless business logic, executing only on demand to reduce idle costs.
*   **Database:** [Amazon DynamoDB](https://amazon.com) utilizing a NoSQL key-value architecture with Pay-Per-Request billing.

---

## 🔄 Deployment & User Workflow

### 🚀 Automation Pipeline (Deployment Flow)
1. **Code Commit:** Code or infrastructure changes are pushed from the local workstation to GitHub.
2. **Pipeline Trigger:** GitHub Actions workflows catch the push event automatically.
3. **Infrastructure Provisioning:** The runner initializes Terraform, validates configurations, and executes `terraform apply` using a secure, encrypted **Amazon S3 Remote Backend** for state management.
4. **Asset Deployment:** Static frontend web files are synchronized directly into the public-facing Amazon S3 bucket.

### 👥 Application Execution (User Flow)
1. The user requests and fetches the UI layout natively from the **Amazon S3 static website endpoint**.
2. Actions performed in the browser send asynchronous HTTP requests to **Amazon API Gateway**.
3. API Gateway safely maps and routes the incoming payloads into the active **AWS Lambda Function**.
4. The Lambda function interacts transactionally with **Amazon DynamoDB** to retrieve or persist inventory items.

---

## 📐 Key Design Decisions

*   **Terraform over CloudFormation:** Chosen to ensure cloud-agnostic workflows, explicit dependency trees, and reusable resource modules.
*   **S3 State Locking:** Implemented a remote backend infrastructure to ensure safe, concurrent pipeline executions without state corruption risks.
*   **Serverless Pricing Efficiency:** Utilizing S3, API Gateway, Lambda, and DynamoDB (On-Demand) guarantees that the platform scales instantly to handle spikes while maintaining a true **\$0 operating cost when idle**.

