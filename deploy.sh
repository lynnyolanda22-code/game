#!/usr/bin/env bash
set -euo pipefail

# Usage:
# 1) Build image:   docker build -t mrbox:latest .
# 2) Run container: docker run -d --name mrbox -p 80:80 mrbox:latest

IMAGE_NAME=${IMAGE_NAME:-mrbox}
TAG=${TAG:-latest}
PORT=${PORT:-80}

echo "Building $IMAGE_NAME:$TAG ..."
docker build -t "$IMAGE_NAME:$TAG" .

if docker ps -a --format '{{.Names}}' | grep -q '^mrbox$'; then
  echo "Stopping/removing existing container 'mrbox'..."
  docker rm -f mrbox >/dev/null 2>&1 || true
fi

echo "Running container on port $PORT ..."
docker run -d --name mrbox -p "$PORT:80" "$IMAGE_NAME:$TAG"
docker ps --filter name=mrbox

