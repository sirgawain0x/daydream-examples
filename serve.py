#!/usr/bin/env python3
"""
Simple HTTP server for serving the Daydream Stream application locally.
This helps avoid CORS issues with the Livepeer iframe player.

Usage:
    python3 serve.py [port]

Default port is 8000.
"""
import http.server
import socketserver
import sys
import os
import webbrowser
from pathlib import Path

def main():
    # Default port
    PORT = 8000
    
    # Check if port is specified as command line argument
    if len(sys.argv) > 1:
        try:
            PORT = int(sys.argv[1])
        except ValueError:
            print("Invalid port number. Using default port 8000.")
    
    # Change to the directory containing the HTML files
    os.chdir(Path(__file__).parent)
    
    # Create server
    Handler = http.server.SimpleHTTPRequestHandler
    
    # Add CORS headers to avoid issues
    class CORSRequestHandler(Handler):
        def end_headers(self):
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type')
            super().end_headers()
    
    with socketserver.TCPServer(("", PORT), CORSRequestHandler) as httpd:
        print(f"🚀 Daydream Stream Server starting...")
        print(f"📡 Server running at http://localhost:{PORT}")
        print(f"🎨 Open the Daydream Stream app at:")
        print(f"   http://localhost:{PORT}/daydream-final-solution.html")
        print()
        print("📋 Available endpoints:")
        print(f"   • Final Solution (Recommended): http://localhost:{PORT}/daydream-final-solution.html")
        print(f"   • Advanced UI: http://localhost:{PORT}/daydream-webcam-stream.html")
        print(f"   • Simple Version: http://localhost:{PORT}/daydream-stream-fix.html")
        print()
        print("💡 Make sure to:")
        print("   1. Enter your Daydream API key in the interface")
        print("   2. Allow camera permissions when prompted")
        print("   3. Wait for the AI pipeline to initialize (30-60 seconds)")
        print()
        print("Press Ctrl+C to stop the server")
        
        try:
            # Automatically open the browser to the main application
            webbrowser.open(f'http://localhost:{PORT}/daydream-final-solution.html')
        except:
            pass  # Browser opening is optional
            
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n🛑 Server stopped")

if __name__ == "__main__":
    main()
