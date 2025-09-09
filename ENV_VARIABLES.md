# Environment Variables Setup

## Required Environment Variables

You need to set up the following environment variables for the Vercel functions to work:

### 1. LIVEPEER_API_KEY
- **Description**: Your Livepeer Studio API key
- **Get it from**: https://livepeer.studio/dashboard/developers
- **Usage**: Used for creating clips and fetching asset status

### 2. DAYDREAM_API_KEY
- **Description**: Your Daydream API key
- **Get it from**: https://app.daydream.live/beta/api-key
- **Usage**: Used for creating streams and updating prompts

## Local Development Setup

For local development with Vercel CLI:

1. Install Vercel CLI:
   ```bash
   npm i -g vercel
   ```

2. Create a `.env.local` file in your project root:
   ```bash
   # .env.local
   LIVEPEER_API_KEY=your_livepeer_api_key_here
   DAYDREAM_API_KEY=your_daydream_api_key_here
   ```

3. Run the development server:
   ```bash
   vercel dev
   ```

## Vercel Deployment Setup

For production deployment on Vercel:

1. **Via Vercel Dashboard:**
   - Go to your project in the Vercel dashboard
   - Navigate to Settings → Environment Variables
   - Add each variable with the appropriate value

2. **Via Vercel CLI:**
   ```bash
   vercel env add LIVEPEER_API_KEY
   vercel env add DAYDREAM_API_KEY
   ```

3. **Via vercel.json (already configured):**
   The `vercel.json` file is already set up to use these environment variables.

## Security Notes

- **Never commit API keys to version control**
- **Use environment variables for all sensitive data**
- **The Vercel functions handle CORS and keep your API keys secure on the server side**

## Testing Your Setup

Once deployed, you can test your API functions:

- **Test API Key**: `GET /api/test-api`
- **Create Clip**: `POST /api/create-clip`
- **Get Asset Status**: `GET /api/asset-status?assetId=your_asset_id`
- **Get Playback Info**: `GET /api/playback-info?playbackId=your_playback_id`
- **Create Stream**: `POST /api/create-stream`
- **Update Stream Prompts**: `POST /api/update-stream-prompts`
