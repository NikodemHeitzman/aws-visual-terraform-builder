# ☁️ AWS Visual Terraform Builder (Self-Service IaC Portal)

A 100% client-side Platform Engineering tool for visually designing AWS architectures and generating Terraform-as-Code outputs.  
The application helps teams move from manual whiteboard diagrams to repeatable self-service IaC workflows with built-in DevOps and DevSecOps-friendly defaults.

## 💡 Project philosophy

I am a DevOps/Platform Engineer. I built this tool rapidly to solve a specific infrastructure bottleneck: visualizing architecture and auto-generating secure Terraform logic (IAM, glue code). Please evaluate this project as a **production-ready, self-hosted infrastructure utility** designed to empower developers, rather than a showcase of frontend UI mastery.

## Why this project

- Accelerates infrastructure design for developers and platform teams.
- Bridges architecture modeling with deployable IaC artifacts.
- Supports shift-left practices by pairing generated Terraform with CI/CD templates and security reminders.

## Core capabilities

- Drag-and-drop AWS architecture designer with validation rules.
- Smart relationship edges (including generated Terraform glue code).
- Reverse import from Terraform into a visual diagram.
- Auto-layout for grouped VPC architectures.
- Terraform file generation (`main.tf`, `variables.tf`, `outputs.tf`).
- ZIP export bundle with:
  - Terraform files
  - GitHub Actions pipeline template (`.github/workflows/deploy.yml`)
- DevSecOps reminder in code preview (scan with `tfsec`/`checkov` before production).

## Tech stack

- React + TypeScript + Vite
- Zustand (state management)
- React Flow (graph editor)
- Tailwind CSS
- Dagre (layouting)

## 🚀 Self-hosting & deployment

Built to be hosted internally on your organization's infrastructure.

### Option 1: Docker Compose (Quickstart)

Deploy the application instantly on any server:

```bash
docker compose up -d
```

Open `http://localhost:8080`.

### Option 2: Standalone Docker (Multi-stage)

The project includes a `Dockerfile` (Node build + Nginx runtime) and `nginx.conf` configured for SPA routing.

```bash
docker build -t aws-visual-terraform-builder .
docker run --rm -p 8080:80 aws-visual-terraform-builder
```

### Option 3: Kubernetes (Production)

For highly available deployments, apply the manifests from the `deploy/k8s/` directory (Deployment, Service, Ingress):

```bash
kubectl apply -f deploy/k8s/
```

For local testing with NGINX Ingress, map `aws-visual-builder.local` to your ingress IP (for example via `/etc/hosts`).

### Option 4: Terraform Inception (IaC deploying IaC)

Deploy this IaC builder using IaC. Check the `infrastructure/` directory for ready-to-use HCL to provision an AWS environment (e.g., EC2 or ECS Fargate) to host this tool securely.

Current sample provisions an EC2 host with Docker and runs the app container on port 80.

## Local development

### Requirements

- Node.js 20+
- npm 10+

### Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

### Build and lint

```bash
npm run build
npm run lint
```

## Generated IaC bundle

From the UI, generate Terraform and download a ZIP bundle containing:

- `main.tf`
- `variables.tf`
- `outputs.tf`
- `.github/workflows/deploy.yml` (basic Terraform pipeline scaffold)

## DevSecOps note

Generated Terraform should be scanned in CI/CD before promotion to production environments.

Recommended tools:

- `tfsec`
- `checkov`

## Project structure (high level)

```text
src/
  components/
  features/
    diagram/
    terraform/
deploy/
  k8s/
infrastructure/
```

## Roadmap ideas

- Environment templating (dev/stage/prod)
- Policy-as-Code checks (OPA/Conftest)
- Cost estimation integration
- Module registry support
