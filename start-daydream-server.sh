#!/bin/bash

# Daydream Stream Local Server Starter
# This script starts a local HTTP server to serve the Daydream Stream application
# and automatically opens it in your browser.

PORT=${1:-8000}  # Default port is 8000, but can be overridden

echo "🚀 Starting Daydream Stream Server..."
echo "📡 Server will run at http://localhost:$PORT"
echo "🎨 Opening Daydream Stream app..."
echo ""
echo "💡 Make sure to:"
echo "   1. Enter your Daydream API key in the interface" 
echo "   2. Allow camera permissions when prompted"
echo "   3. Wait for AI pipeline to initialize (30-60 seconds)"
echo ""

# Try Python 3 first, then Python 2, then Node.js
if command -v python3 &> /dev/null; then
    echo "Using Python 3..."
    python3 serve.py $PORT
elif command -v python &> /dev/null; then
    echo "Using Python..."
    python -m http.server $PORT
elif command -v node &> /dev/null; then
    echo "Using Node.js..."
    echo "Creating simple Node.js server..."
    
    # Create a temporary Node.js server
    cat > temp_server.js << 'EOF'
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const port = process.argv[2] || 8000;

const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json'
};

const server = http.createServer((req, res) => {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  let filePath = '.' + req.url;
  if (filePath === './') {
    filePath = './daydream-final-solution.html';
  }
  
  const extname = String(path.extname(filePath)).toLowerCase();
  const contentType = mimeTypes[extname] || 'application/octet-stream';
  
  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        res.writeHead(404);
        res.end('File not found');
      } else {
        res.writeHead(500);
        res.end('Server error: ' + error.code);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  
  // Try to open the browser
  const start = process.platform === 'darwin' ? 'open' : 
                process.platform === 'win32' ? 'start' : 'xdg-open';
  exec(`${start} http://localhost:${port}/daydream-final-solution.html`);
});
EOF
    
    node temp_server.js $PORT
    rm temp_server.js
else
    echo "❌ Error: No suitable server found. Please install Python 3 or Node.js"
    echo "   - Python 3: https://python.org"
    echo "   - Node.js: https://nodejs.org"
    exit 1
fi
