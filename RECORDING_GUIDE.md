# 🎬 AI Output Recording & Downloading Guide

This guide explains how to record and download content from your AI-generated video streams using the Daydream examples.

## 📋 Overview

The recording functionality provides two main options for capturing your AI output:

1. **Local Recording** - Captures video directly to your device
2. **Server Clipping** - Creates clips on Livepeer's servers using their API

## 🚀 Quick Start

### 1. Start Your Stream

1. Open the main application (`with-fluid-canvas` or any other example)
2. Enter your API key and pipeline ID
3. Click "Start" to begin streaming
4. Wait for the AI pipeline to initialize (30-60 seconds)

### 2. Access Recording Controls

Once your stream is active, you'll see the "Recording & Clipping" section in the right sidebar with these controls:

- **⏺ Start Recording** - Begin local recording
- **⏹ Stop Recording** - Stop and download the recording
- **📹 Create Clip** - Create a server-side clip (last 30 seconds)

## 🎥 Local Recording

### How It Works

Local recording uses the browser's `MediaRecorder` API to capture the AI output:

1. Creates a canvas element to capture video frames
2. Records at 30 FPS with VP9 codec for optimal quality
3. Automatically downloads the file when you stop recording
4. Files are saved as `.webm` format

### Features

- ✅ **High Quality**: 1280x720 resolution at 30 FPS
- ✅ **Automatic Download**: Files download immediately when recording stops
- ✅ **Real-time Duration**: Shows recording time with live counter
- ✅ **Visual Indicators**: Red recording indicator and status updates

### Limitations

- ⚠️ **CORS Restrictions**: Cannot directly capture iframe content due to browser security
- ⚠️ **Browser Dependent**: Requires modern browser with MediaRecorder support
- ⚠️ **File Size**: Longer recordings create larger files

## 📹 Server Clipping (Livepeer API)

### How It Works

Server clipping uses Livepeer's clipping API to create clips on their servers:

1. Sends a request to Livepeer's API with start/end times
2. Creates a clip of the last 30 seconds of your stream
3. Processes the clip on Livepeer's servers
4. Provides a playback ID for the completed clip

### Features

- ✅ **High Quality**: Server-side processing ensures optimal quality
- ✅ **No CORS Issues**: Works with any content in the iframe
- ✅ **Automatic Processing**: Handles encoding and optimization
- ✅ **Persistent Storage**: Clips are stored on Livepeer's CDN

### API Requirements

To use server clipping, you need:

1. **Livepeer API Key**: Get one from [Livepeer Studio](https://livepeer.studio)
2. **Active Stream**: Must have an active stream with playback ID
3. **Network Access**: Requires internet connection to Livepeer's API

### Usage

```javascript
// Example API call for creating a clip
const response = await fetch('https://livepeer.studio/api/clip', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${YOUR_API_KEY}`
  },
  body: JSON.stringify({
    startTime: Date.now() - 30000, // 30 seconds ago
    endTime: Date.now(),           // Now
    playbackId: 'your-playback-id',
    name: 'My AI Clip'
  })
});
```

## 🛠️ Technical Implementation

### Recording Manager

The recording functionality is implemented in `RecordingManager.tsx`:

```typescript
const {
  recordingState,
  startRecording,
  stopRecording,
  createClip,
  cleanup
} = useRecordingManager({
  playbackId,
  isStreaming,
  apiKey
});
```

### State Management

```typescript
interface RecordingState {
  isRecording: boolean;    // Whether currently recording
  isClipping: boolean;     // Whether creating a server clip
  duration: number;        // Recording duration in seconds
  status: string;          // Current status message
}
```

### File Naming

Recorded files are automatically named with timestamps:

```
ai-output-2024-01-15T10-30-45-123Z.webm
```

## 🎯 Best Practices

### For Local Recording

1. **Start Recording Early**: Begin recording before important content
2. **Monitor Duration**: Keep track of recording time to manage file sizes
3. **Check Browser Support**: Ensure your browser supports MediaRecorder
4. **Stable Connection**: Maintain stable internet for consistent quality

### For Server Clipping

1. **Use API Key**: Always provide a valid Livepeer API key
2. **Monitor Status**: Watch the status updates for clip processing
3. **Reasonable Duration**: Server clips work best for shorter segments
4. **Error Handling**: Check for API errors and network issues

## 🔧 Troubleshooting

### Common Issues

#### "Cannot start recording: No active stream"
- **Solution**: Ensure your stream is active and has a valid playback ID
- **Check**: Stream status should show "Streaming live!"

#### "Canvas context not available"
- **Solution**: Refresh the page and try again
- **Check**: Ensure you're using a modern browser

#### "API key required for clipping"
- **Solution**: Enter your Livepeer API key in the API Configuration section
- **Check**: Key should be the raw key without "Bearer" prefix

#### "Clip creation failed"
- **Solution**: Check your API key and network connection
- **Check**: Ensure the stream is active and accessible

### Browser Compatibility

| Feature | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| MediaRecorder | ✅ | ✅ | ✅ | ✅ |
| Canvas Recording | ✅ | ✅ | ✅ | ✅ |
| WebM Export | ✅ | ✅ | ⚠️ | ✅ |

*Safari may require additional codec support for WebM*

## 📚 API Reference

### Livepeer Clipping API

#### Create Clip
```http
POST https://livepeer.studio/api/clip
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json

{
  "startTime": 1642248000000,
  "endTime": 1642248030000,
  "playbackId": "your-playback-id",
  "name": "My Clip"
}
```

#### Check Clip Status
```http
GET https://livepeer.studio/api/asset/{assetId}
Authorization: Bearer YOUR_API_KEY
```

### Response Format

```json
{
  "task": {
    "id": "635cbcbb-30cb-4136-a7f0-ec5ea2ac39d0"
  },
  "asset": {
    "id": "e28c63c6-ffe8-4f0f-8ae0-4fbbe5c7b493",
    "playbackId": "e28crdyrtxjkx836",
    "status": {
      "phase": "waiting"
    },
    "name": "My Clip"
  }
}
```

## 🎨 Customization

### Recording Settings

You can customize recording parameters in the code:

```typescript
// Canvas resolution
canvas.width = 1280;
canvas.height = 720;

// Recording frame rate
const stream = canvas.captureStream(30); // 30 FPS

// Codec settings
const mediaRecorder = new MediaRecorder(stream, {
  mimeType: 'video/webm;codecs=vp9'
});
```

### UI Customization

The recording controls can be styled using Tailwind CSS classes:

```tsx
<button className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded">
  Start Recording
</button>
```

## 🔮 Future Enhancements

Planned improvements include:

- **Screen Recording**: Direct screen capture for better quality
- **Audio Recording**: Include audio tracks in recordings
- **Batch Processing**: Record multiple clips simultaneously
- **Cloud Storage**: Direct upload to cloud storage services
- **Advanced Editing**: Basic video editing capabilities

## 📞 Support

For issues or questions:

1. Check the troubleshooting section above
2. Review browser console for error messages
3. Ensure all requirements are met
4. Test with a simple stream first

## 📄 License

This recording functionality is part of the Daydream examples and follows the same licensing terms.
