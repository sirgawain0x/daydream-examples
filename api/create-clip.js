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
    const { startTime, endTime, playbackId, name } = req.body;

    if (!startTime || !endTime || !playbackId || !name) {
      return res.status(400).json({ 
        error: 'Missing required fields: startTime, endTime, playbackId, name' 
      });
    }

    if (!process.env.LIVEPEER_API_KEY) {
      return res.status(500).json({ 
        error: 'LIVEPEER_API_KEY environment variable not set' 
      });
    }

    const response = await fetch('https://livepeer.studio/api/clip', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.LIVEPEER_API_KEY}`
      },
      body: JSON.stringify({ startTime, endTime, playbackId, name })
    });

    const data = await response.json();
    
    if (!response.ok) {
      return res.status(response.status).json({
        error: data.message || 'Failed to create clip',
        details: data
      });
    }

    res.status(response.status).json(data);
  } catch (error) {
    console.error('Create clip error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}
