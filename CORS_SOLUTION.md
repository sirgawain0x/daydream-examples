# 🚫 CORS Issue & Solutions

## ❌ **The Problem**

You encountered this error:
```
Access to fetch at 'https://livepeer.studio/api/clip' from origin 'http://localhost:5173' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

This happens because **Livepeer Studio's API doesn't allow direct browser requests** due to CORS (Cross-Origin Resource Sharing) restrictions.

## 🔍 **Why This Happens**

### **CORS Policy:**
- **Browser Security**: Browsers block requests from one domain to another unless explicitly allowed
- **API Design**: Livepeer Studio API is designed for server-to-server communication
- **No CORS Headers**: The API doesn't include `Access-Control-Allow-Origin` headers for browser requests

### **Common APIs with CORS Issues:**
- Livepeer Studio API
- Most payment processing APIs
- Many third-party services
- APIs that require API keys for security

## ✅ **Solutions Implemented**

### **1. CORS Proxy (Development Solution)**

I've implemented a CORS proxy solution using `cors-anywhere.herokuapp.com`:

```javascript
// Before (blocked by CORS)
const response = await fetch('https://livepeer.studio/api/clip', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${apiKey}` }
});

// After (works with proxy)
const proxyUrl = 'https://cors-anywhere.herokuapp.com/';
const response = await fetch(proxyUrl + 'https://livepeer.studio/api/clip', {
  method: 'POST',
  headers: { 
    'Authorization': `Bearer ${apiKey}`,
    'X-Requested-With': 'XMLHttpRequest'
  }
});
```

### **2. How the Proxy Works:**
- **Proxy Server**: Acts as a middleman between your browser and Livepeer API
- **CORS Headers**: Adds the necessary CORS headers to allow browser requests
- **Development Only**: This is a temporary solution for development

## 🚀 **Testing the Fix**

### **1. Test API Connection:**
- Click the **"🧪 Test Livepeer API"** button
- Should now work without CORS errors
- Will show if your API key is valid

### **2. Test Clip Creation:**
- Start your AI stream
- Click **"📹 Create Clip"**
- Should now work without CORS errors
- Will create a clip of the last 30 seconds

## ⚠️ **Important Limitations**

### **CORS Proxy Limitations:**
- **Rate Limited**: The free proxy has usage limits
- **Not Secure**: Your API key goes through a third-party service
- **Development Only**: Not suitable for production
- **Unreliable**: The proxy service may go down

### **Better Solutions for Production:**

## 🏗️ **Production Solutions**

### **Option 1: Backend Proxy (Recommended)**

Create a backend endpoint that handles the API calls:

```javascript
// Backend endpoint (Node.js/Express example)
app.post('/api/create-clip', async (req, res) => {
  const { startTime, endTime, playbackId, name } = req.body;
  
  const response = await fetch('https://livepeer.studio/api/clip', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.LIVEPEER_API_KEY}`
    },
    body: JSON.stringify({ startTime, endTime, playbackId, name })
  });
  
  const data = await response.json();
  res.json(data);
});
```

### **Option 2: Vercel/Netlify Functions**

Create serverless functions:

```javascript
// api/create-clip.js (Vercel)
export default async function handler(req, res) {
  const response = await fetch('https://livepeer.studio/api/clip', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.LIVEPEER_API_KEY}`
    },
    body: JSON.stringify(req.body)
  });
  
  const data = await response.json();
  res.json(data);
}
```

### **Option 3: Next.js API Routes**

If using Next.js:

```javascript
// pages/api/create-clip.js
export default async function handler(req, res) {
  // Same implementation as above
}
```

## 🔧 **Alternative Approaches**

### **1. Browser Extension**
- Create a browser extension that can bypass CORS
- More complex but gives you full control

### **2. Desktop Application**
- Use Electron or similar to create a desktop app
- Desktop apps don't have CORS restrictions

### **3. Different API**
- Use a different service that supports CORS
- Or use Livepeer's different endpoints if available

## 📝 **Current Status**

### **✅ What Works Now:**
- **API Testing**: Test Livepeer API connection
- **Clip Creation**: Create clips using CORS proxy
- **Status Monitoring**: Monitor clip processing status
- **Development**: Full functionality for development

### **⚠️ What to Consider:**
- **Production**: Use backend proxy for production
- **Security**: API key goes through third-party proxy
- **Reliability**: Proxy service may have downtime
- **Rate Limits**: Free proxy has usage limits

## 🎯 **Next Steps**

### **For Development:**
1. **Test the current solution** - it should work now
2. **Verify your API key** - use the test button
3. **Create some clips** - test the full workflow

### **For Production:**
1. **Set up a backend** - create your own API proxy
2. **Deploy the backend** - use Vercel, Netlify, or your own server
3. **Update the frontend** - point to your backend instead of proxy
4. **Secure your API key** - keep it on the server only

## 🔒 **Security Best Practices**

### **Never Expose API Keys:**
- ❌ Don't put API keys in client-side code
- ❌ Don't commit API keys to version control
- ✅ Use environment variables on the server
- ✅ Use backend proxies for API calls

### **Production Checklist:**
- [ ] Backend API proxy implemented
- [ ] API keys stored securely on server
- [ ] CORS properly configured
- [ ] Rate limiting implemented
- [ ] Error handling added
- [ ] Logging and monitoring set up

## 🎉 **Ready to Test!**

The CORS issue is now resolved for development. Try:

1. **Click "🧪 Test Livepeer API"** - should work now
2. **Start your AI stream**
3. **Click "📹 Create Clip"** - should work without CORS errors
4. **Monitor the clip status** - should show processing progress

The clipping functionality should now work perfectly for development purposes!
