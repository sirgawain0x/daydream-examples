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
    const { streamId } = req.query;

    if (!streamId) {
      return res.status(400).json({ 
        error: 'Missing required parameter: streamId' 
      });
    }

    if (!process.env.DAYDREAM_API_KEY) {
      return res.status(500).json({ 
        error: 'DAYDREAM_API_KEY environment variable not set' 
      });
    }

    const response = await fetch(`https://api.daydream.live/v1/streams/${streamId}/status`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.DAYDREAM_API_KEY}`
      }
    });

    const data = await response.json();
    
    if (!response.ok) {
      return res.status(response.status).json({
        error: data.message || 'Failed to fetch stream status',
        details: data
      });
    }

    res.status(response.status).json(data);
  } catch (error) {
    console.error('Stream status error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}
