# ☁️ AWS Visual Terraform Builder (Self-Service IaC Portal)

A 100% client-side Platform Engineering tool for visually designing AWS architectures and generating Terraform-as-Code outputs.  
The application helps teams move from manual whiteboard diagrams to repeatable self-service IaC workflows with built-in DevOps and DevSecOps-friendly defaults.

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

## Docker (production-ready, multi-stage)

The project includes:

- `Dockerfile` (Node build stage + Nginx runtime stage)
- `nginx.conf` configured for SPA routing via:
  - `try_files $uri $uri/ /index.html;`
- `.dockerignore` to keep images clean and small

### Build image

```bash
docker build -t aws-visual-terraform-builder .
```

### Run container

```bash
docker run --rm -p 8080:80 aws-visual-terraform-builder
```

Open `http://localhost:8080`.

## Generated IaC bundle

From the UI, generate Terraform and download a ZIP bundle containing:

- `main.tf`
- `variables.tf`
- `outputs.tf`
- `.github/workflows/deploy.yml` (basic Terraform pipeline scaffold)

## DevSecOps note

Generated Terraform should be scanned in CI/CD before promotion to production environments.  
Recommended tools:

- [tfsec](https://github.com/aquasecurity/tfsec)
- [checkov](https://github.com/bridgecrewio/checkov)

## Project structure (high level)

```text
src/
  components/
  features/
    diagram/
    terraform/
```

## Roadmap ideas

- Environment templating (dev/stage/prod)
- Policy-as-Code checks (OPA/Conftest)
- Cost estimation integration
- Module registry support
