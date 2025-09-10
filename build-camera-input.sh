#!/bin/bash
set -e

echo "Building with-camera-input project..."
cd with-camera-input
pnpm install
pnpm run build
echo "Build completed successfully!"
