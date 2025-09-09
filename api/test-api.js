export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!process.env.LIVEPEER_API_KEY) {
      return res.status(500).json({ 
        error: 'LIVEPEER_API_KEY environment variable not set' 
      });
    }

    // Test the API key by making a simple request to Livepeer Studio
    const response = await fetch('https://livepeer.studio/api/asset', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.LIVEPEER_API_KEY}`
      }
    });

    const data = await response.json();
    
    if (!response.ok) {
      return res.status(response.status).json({
        error: data.message || 'API key test failed',
        details: data,
        status: 'invalid'
      });
    }

    res.status(200).json({
      message: 'API key is valid',
      status: 'valid',
      data: data
    });
  } catch (error) {
    console.error('API test error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message,
      status: 'error'
    });
  }
}
