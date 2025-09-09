#!/bin/bash

echo "🚀 Setting up local TURN server with Docker..."

# Generate a random secret
SECRET=$(openssl rand -hex 16)
echo "Generated secret: $SECRET"

# Run CoTURN in Docker
docker run -d \
  --name local-turn-server \
  --restart unless-stopped \
  -p 3478:3478 \
  -p 3478:3478/udp \
  -p 49152-65535:49152-65535/udp \
  coturn/coturn \
  -n \
  --log-file=stdout \
  --min-port=49152 \
  --max-port=65535 \
  --fingerprint \
  --lt-cred-mech \
  --use-auth-secret \
  --static-auth-secret="$SECRET" \
  --realm=localhost \
  --server-name=localhost

echo ""
echo "✅ TURN server started!"
echo ""
echo "📋 Configuration for your app:"
echo "   TURN Server: turn:localhost:3478"
echo "   Username: test"
echo "   Password: $SECRET"
echo ""
echo "🔍 Test with: docker logs local-turn-server"
echo "🛑 Stop with: docker stop local-turn-server && docker rm local-turn-server"
