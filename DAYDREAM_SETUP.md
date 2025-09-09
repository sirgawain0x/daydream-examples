# 🎨 Daydream Stream Studio - Setup Guide

A complete web application for real-time AI video transformation using Daydream.live API with WebRTC streaming and live parameter controls.

## ✨ Features

- **🎥 WebRTC Streaming**: Direct webcam to AI pipeline streaming
- **🤖 Real-time AI Processing**: StreamDiffusion with live parameter updates
- **📊 Advanced Monitoring**: Connection status, stats, and error handling  
- **🎛️ Live Controls**: Adjust prompts and ControlNet parameters in real-time
- **📈 Analytics**: Integrated OpenReplay session recording and monitoring
- **🔄 Robust Error Handling**: Automatic reconnection and retry mechanisms

## 🚀 Quick Start

### 1. Get Your API Key
- Visit the [Daydream.live Key Generator](https://app.daydream.live/beta/api-key)
- Use the passcode from Discord to generate your API key
- Keep your API key secure!

### 2. Start the Local Server
Choose one of these methods to serve the app locally (required to avoid CORS issues):

#### Option A: Python Server (Recommended)
```bash
python3 serve.py
```

#### Option B: Bash Script (Auto-detects Python/Node.js)
```bash
./start-daydream-server.sh
```

#### Option C: Manual Python Server
```bash
python3 -m http.server 8000
```

#### Option D: Custom Port
```bash
python3 serve.py 9000
./start-daydream-server.sh 9000
```

### 3. Open the Application
The server will automatically open your browser to:
`http://localhost:8000/daydream-final-solution.html`

## 🎯 Available Versions

| File | Description | Best For |
|------|-------------|----------|
| `daydream-final-solution.html` | **Recommended** - Full-featured with robust error handling | Production use |
| `daydream-webcam-stream.html` | Advanced UI with detailed ControlNet controls | Fine-tuning parameters |
| `daydream-stream-fix.html` | Minimal implementation | Testing/debugging |

## 🔧 Usage Instructions

### Step 1: Configure Your Session
1. **API Key**: Paste your Daydream API key in the "API Key" field
2. **User ID (Optional)**: Enter your email or username for session tracking
   - Click "👤 Set User ID" to save it
   - Sessions will be searchable by this ID in OpenReplay
   - Your ID is saved locally for future sessions

### Step 2: Start Streaming
1. Click "🚀 Start Stream" 
2. Allow camera permissions when prompted
3. Wait for the AI pipeline to initialize (30-60 seconds)
4. The output video will appear in the right panel

### Step 3: Customize Parameters
- **Prompt**: Describe the visual transformation you want
- **Negative Prompt**: Specify what to avoid in the output
- **ControlNets**: Fine-tune how different aspects are processed:
  - **Pose Detection**: Preserve human poses
  - **Edge Detection**: Maintain image edges  
  - **Depth Maps**: Preserve 3D structure
  - **Color Preservation**: Keep original colors

### Step 4: Monitor Performance
- Check connection status indicators
- Review real-time statistics
- Monitor the log output for debugging

## 🎛️ Advanced Parameters

### StreamDiffusion Parameters
- **Inference Steps**: Higher = better quality, lower = faster processing
- **Seed**: Controls randomization (same seed = reproducible results)
- **ControlNet Scales**: Adjust influence of different control methods

### Network Configuration
- **ICE Transport Policy**: 
  - "All" (STUN + TURN) - Best for most networks
  - "Force TURN Relay" - For restrictive firewalls

## 📊 Analytics & Monitoring

The application includes OpenReplay session recording with user identification:

### User Identification
- **Set User ID**: Identify sessions with your email or username
- **Search & Filter**: Find your sessions easily in OpenReplay dashboard
- **Persistent ID**: Your ID is remembered across sessions

### Automatic Tracking
- **User Sessions**: Track user interactions and flows  
- **Stream Events**: Monitor stream creation, connections, and AI processing
- **Error Monitoring**: Automatic error capture and reporting
- **Performance Tracking**: Monitor WebRTC connection quality
- **Custom Events**: Application-specific events for debugging

### Tracked Events
- `daydream_app_initialized` - App startup
- `user_identified` - When user ID is set
- `stream_created` - Stream creation success
- `whip_connected` - WebRTC connection established
- `prompt_sent` - AI prompt submission
- `daydream_log` - All application logs

## 🔧 Troubleshooting

### Common Issues

#### "Stream not ready" errors
- **Solution**: Wait longer for AI pipeline initialization (up to 60 seconds)
- **Alternative**: Try clicking "Retry Player Setup"

#### WebRTC connection fails
- **Solution**: Try switching ICE policy to "Force TURN Relay"
- **Check**: Firewall settings and network restrictions

#### Camera access denied
- **Solution**: Check browser permissions in settings
- **Alternative**: Try HTTPS if available

#### No output video visible
- **Solution**: Wait for stream to become active, then click "Load Player Now"
- **Check**: Verify stream is properly created in the logs

### Connection States
- **🟢 Connected**: Everything working properly
- **🟡 Connecting**: Establishing connection
- **🔴 Disconnected**: Connection failed or lost

## 🏗️ Technical Architecture

### Frontend
- **WebRTC**: Direct browser-to-server video streaming via WHIP protocol
- **Player**: Livepeer iframe player with WebRTC support
- **UI**: Responsive design with real-time controls

### Backend Integration  
- **Daydream API**: RESTful API for stream management
- **Livepeer**: Video infrastructure for playback
- **StreamDiffusion**: Real-time AI video processing pipeline

### Analytics
- **OpenReplay**: Session recording and user experience monitoring
- **Custom Events**: Application-specific tracking

## 🔐 Security Notes

- API keys are stored locally in browser only
- No sensitive data is transmitted to analytics
- CORS headers configured for local development only
- Production deployment should use HTTPS

## 🆘 Support

If you encounter issues:
1. Check the browser console for detailed error messages
2. Review the application logs in the status panel
3. Try the troubleshooting steps above
4. Contact support with your session logs

---

**Built with ❤️ for the Daydream.live community**
