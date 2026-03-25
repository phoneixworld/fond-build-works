# Phoenix Builder — Azure Container Build Image
#
# Pre-built image with Node.js 20, npm, and Vite tooling.
# Deployed to Azure Container Registry (ACR).
#
# Build: docker build -t <registry>.azurecr.io/phoenix-builder:latest .
# Push:  docker push <registry>.azurecr.io/phoenix-builder:latest

FROM node:20-slim

WORKDIR /workspace

# Install build tools
RUN npm install -g typescript vite@5

# The container entrypoint script
COPY build-entrypoint.sh /usr/local/bin/build-entrypoint.sh
RUN chmod +x /usr/local/bin/build-entrypoint.sh

ENTRYPOINT ["build-entrypoint.sh"]
