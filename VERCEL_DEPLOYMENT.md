# 🚀 Vercel Deployment Guide

This guide will help you deploy your Daydream StreamDiffusion application to Vercel with proper CORS handling and API key security.

## 📋 Prerequisites

- [Vercel account](https://vercel.com) (free tier available)
- [Vercel CLI](https://vercel.com/cli) installed
- Your API keys ready:
  - **Livepeer Studio API Key**: Get from [Livepeer Studio Dashboard](https://livepeer.studio/dashboard/developers)
  - **Daydream API Key**: Get from [Daydream API Key Generator](https://app.daydream.live/beta/api-key)

## 🏗️ Project Structure

Your project now includes Vercel API functions in the `/api` directory:

```
daydream-examples/
├── api/                          # Vercel API Functions
│   ├── create-clip.js           # Livepeer clip creation
│   ├── asset-status.js          # Livepeer asset status
│   ├── playback-info.js         # Livepeer playback info
│   ├── test-api.js              # API key testing
│   ├── create-stream.js         # Daydream stream creation
│   ├── update-stream-prompts.js # Daydream prompt updates
│   └── stream-status.js         # Daydream stream status
├── vercel.json                  # Vercel configuration
├── ENV_VARIABLES.md             # Environment setup guide
└── [your frontend projects]/
```

## 🔧 Local Development Setup

### 1. Install Vercel CLI
```bash
npm i -g vercel
```

### 2. Create Environment File
Create a `.env.local` file in your project root:
```bash
# .env.local
LIVEPEER_API_KEY=your_livepeer_api_key_here
DAYDREAM_API_KEY=your_daydream_api_key_here
```

### 3. Run Development Server
```bash
vercel dev
```

This will start your application with the API functions running locally at `http://localhost:3000`.

## 🚀 Production Deployment

### Option 1: Deploy via Vercel CLI

1. **Login to Vercel**:
   ```bash
   vercel login
   ```

2. **Deploy your project**:
   ```bash
   vercel
   ```

3. **Set environment variables**:
   ```bash
   vercel env add LIVEPEER_API_KEY
   vercel env add DAYDREAM_API_KEY
   ```

4. **Redeploy with environment variables**:
   ```bash
   vercel --prod
   ```

### Option 2: Deploy via Vercel Dashboard

1. **Connect your repository**:
   - Go to [Vercel Dashboard](https://vercel.com/dashboard)
   - Click "New Project"
   - Import your GitHub repository

2. **Configure environment variables**:
   - Go to Project Settings → Environment Variables
   - Add `LIVEPEER_API_KEY` with your Livepeer API key
   - Add `DAYDREAM_API_KEY` with your Daydream API key

3. **Deploy**:
   - Click "Deploy" and wait for the build to complete

## 🔒 Security Features

### ✅ What's Secure Now:
- **API Keys**: Stored securely on Vercel servers, never exposed to browsers
- **CORS**: Properly handled by Vercel functions
- **Rate Limiting**: Vercel provides built-in rate limiting
- **HTTPS**: Automatic SSL certificates

### 🛡️ Security Best Practices:
- Never commit API keys to version control
- Use environment variables for all sensitive data
- API keys are only accessible server-side
- All API calls go through your secure Vercel functions

## 📡 API Endpoints

Your deployed application will have these API endpoints:

### Livepeer Studio Functions:
- `POST /api/create-clip` - Create video clips
- `GET /api/asset-status?assetId={id}` - Check asset processing status
- `GET /api/playback-info?playbackId={id}` - Get playback information
- `GET /api/test-api` - Test API key validity

### Daydream Functions:
- `POST /api/create-stream` - Create new streams
- `POST /api/update-stream-prompts` - Update stream parameters
- `GET /api/stream-status?streamId={id}` - Check stream status

## 🧪 Testing Your Deployment

### 1. Test API Key:
```bash
curl https://your-app.vercel.app/api/test-api
```

### 2. Test Stream Creation:
```bash
curl -X POST https://your-app.vercel.app/api/create-stream \
  -H "Content-Type: application/json" \
  -d '{"pipeline_id": "pip_qpUgXycjWF6YMeSL"}'
```

### 3. Test Clip Creation:
```bash
curl -X POST https://your-app.vercel.app/api/create-clip \
  -H "Content-Type: application/json" \
  -d '{
    "startTime": 1640995200000,
    "endTime": 1640995230000,
    "playbackId": "your_playback_id",
    "name": "Test Clip"
  }'
```

## 🔄 Frontend Integration

Your frontend code has been updated to use the Vercel functions:

### Before (CORS Issues):
```javascript
// ❌ This caused CORS errors
const response = await fetch('https://livepeer.studio/api/clip', {
  headers: { 'Authorization': `Bearer ${apiKey}` }
});
```

### After (CORS-Free):
```javascript
// ✅ This works perfectly
const response = await fetch('/api/create-clip', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ startTime, endTime, playbackId, name })
});
```

## 🎯 Usage Examples

### 1. StreamDiffusion Playground
- Navigate to your deployed URL
- Enter your API keys in the interface
- Start streaming and create clips without CORS issues

### 2. Fluid Canvas App
- Deploy the `with-fluid-canvas` project
- All recording and clipping functions work seamlessly
- No more CORS proxy dependencies

### 3. Camera Input App
- Deploy the `with-camera-input` project
- Full streaming functionality with secure API calls

## 🐛 Troubleshooting

### Common Issues:

1. **Environment Variables Not Set**:
   ```
   Error: LIVEPEER_API_KEY environment variable not set
   ```
   **Solution**: Add environment variables in Vercel dashboard or via CLI

2. **API Key Invalid**:
   ```
   Error: API key test failed
   ```
   **Solution**: Verify your API keys are correct and active

3. **Function Timeout**:
   ```
   Error: Function execution timeout
   ```
   **Solution**: Vercel functions have a 10-second timeout for hobby plans

### Debug Steps:

1. **Check Vercel Function Logs**:
   ```bash
   vercel logs
   ```

2. **Test Individual Functions**:
   Use the curl commands above to test each endpoint

3. **Verify Environment Variables**:
   ```bash
   vercel env ls
   ```

## 📊 Monitoring & Analytics

Vercel provides built-in monitoring:
- **Function Invocations**: Track API usage
- **Response Times**: Monitor performance
- **Error Rates**: Identify issues quickly
- **Bandwidth Usage**: Monitor data transfer

## 💰 Cost Considerations

### Vercel Pricing:
- **Hobby Plan**: Free tier with limitations
- **Pro Plan**: $20/month for higher limits
- **Enterprise**: Custom pricing for high-volume usage

### API Usage:
- **Livepeer Studio**: Check their pricing for clip creation
- **Daydream**: Check their pricing for stream processing

## 🎉 Success!

Once deployed, you'll have:
- ✅ **No CORS Issues**: All API calls work seamlessly
- ✅ **Secure API Keys**: Never exposed to browsers
- ✅ **Production Ready**: Scalable and reliable
- ✅ **Easy Updates**: Deploy changes with `vercel --prod`

## 📞 Support

If you encounter issues:
1. Check the [Vercel Documentation](https://vercel.com/docs)
2. Review the [Livepeer Studio API Docs](https://docs.livepeer.studio)
3. Check the [Daydream API Documentation](https://docs.daydream.live)

Your StreamDiffusion application is now production-ready with proper CORS handling and secure API key management! 🚀
