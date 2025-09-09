#!/bin/bash

# Start local HTTP server for Daydream webcam stream
echo "🚀 Starting local HTTP server for Daydream.live Webcam Stream..."
echo "📁 Serving files from: $(pwd)"
echo "🌐 Open your browser to: http://localhost:8000/daydream-webcam-stream.html"
echo "⏹️  Press Ctrl+C to stop the server"
echo ""

# Start Python HTTP server on port 8000
python3 -m http.server 8000
