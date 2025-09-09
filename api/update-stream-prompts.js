export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { streamId, prompts } = req.body;

    if (!streamId || !prompts) {
      return res.status(400).json({ 
        error: 'Missing required fields: streamId, prompts' 
      });
    }

    if (!process.env.DAYDREAM_API_KEY) {
      return res.status(500).json({ 
        error: 'DAYDREAM_API_KEY environment variable not set' 
      });
    }

    const response = await fetch(`https://api.daydream.live/beta/streams/${streamId}/prompts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.DAYDREAM_API_KEY}`
      },
      body: JSON.stringify(prompts)
    });

    const data = await response.json();
    
    if (!response.ok) {
      return res.status(response.status).json({
        error: data.message || 'Failed to update stream prompts',
        details: data
      });
    }

    res.status(response.status).json(data);
  } catch (error) {
    console.error('Update stream prompts error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}
