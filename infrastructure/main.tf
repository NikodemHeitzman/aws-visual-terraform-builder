terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

data "aws_ami" "amazon_linux_2023" {
  most_recent = true
  owners      = ["137112412989"] # Amazon

  filter {
    name   = "name"
    values = ["al2023-ami-2023*-x86_64"]
  }
}

resource "aws_security_group" "web_sg" {
  name        = "aws-visual-builder-sg"
  description = "Allow HTTP/SSH access"

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_instance" "aws_visual_builder" {
  ami                    = data.aws_ami.amazon_linux_2023.id
  instance_type          = var.instance_type
  vpc_security_group_ids = [aws_security_group.web_sg.id]
  key_name               = var.key_name

  user_data = <<-EOF
    #!/bin/bash
    set -euxo pipefail
    dnf update -y
    dnf install -y docker git
    systemctl enable docker
    systemctl start docker
    usermod -aG docker ec2-user

    mkdir -p /opt/aws-visual-builder
    cd /opt/aws-visual-builder
    git clone ${var.repository_url} app
    cd app
    docker build -t aws-visual-terraform-builder .
    docker run -d --name aws-visual-builder -p 80:80 --restart unless-stopped aws-visual-terraform-builder
  EOF

  tags = {
    Name = "aws-visual-terraform-builder"
  }
}

output "app_url" {
  value = "http://${aws_instance.aws_visual_builder.public_ip}"
}

variable "aws_region" {
  type    = string
  default = "eu-central-1"
}

variable "instance_type" {
  type    = string
  default = "t3.micro"
}

variable "key_name" {
  type        = string
  default     = ""
  description = "Existing EC2 key pair name for SSH access (optional)"
}

variable "repository_url" {
  type        = string
  default     = "https://github.com/example/aws-visual-terraform-builder.git"
  description = "Git URL for the application repository"
}
