#!/bin/bash

# Deploy script for Daydream StreamDiffusion application
echo "🚀 Deploying Daydream StreamDiffusion application to Vercel..."

# Build the camera input project
echo "📦 Building with-camera-input project..."
cd with-camera-input
npm install
npm run build
cd ..

# Deploy to Vercel
echo "🌐 Deploying to Vercel..."
vercel --prod

echo "✅ Deployment complete!"
echo "🔗 Your application should now be live at your Vercel URL"
echo "📝 Make sure to set your environment variables in Vercel dashboard:"
echo "   - LIVEPEER_API_KEY"
echo "   - DAYDREAM_API_KEY"
