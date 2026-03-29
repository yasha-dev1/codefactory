#!/usr/bin/env bash
set -euo pipefail

echo "Installing CodeFactory Worker Agent..."

if ! command -v python3 &> /dev/null; then
    echo "Error: python3 is required" && exit 1
fi

pip install -e .

echo ""
echo "Worker agent installed! Configure with environment variables:"
echo "  WORKER_GATEWAY_URL=http://your-gateway:8585"
echo "  WORKER_REGISTRATION_SECRET=your-secret"
echo "  WORKER_CAPABILITIES=claude"
echo ""
echo "Run with: codefactory-worker"
