#!/usr/bin/env bash
set -euo pipefail

IMAGE_NAME="${IMAGE_NAME:-integra}"
TAG="${TAG:-latest}"

echo "Building Docker image ${IMAGE_NAME}:${TAG} ..."
docker build --progress=plain --secret id=NPM_ARTIFACT_REPO_AUTH_CONFIG,env=NPM_ARTIFACT_REPO_AUTH_CONFIG -t "${IMAGE_NAME}:${TAG}" .
echo "Done. Run with: docker run -p 8080:8080 ${IMAGE_NAME}:${TAG}"
