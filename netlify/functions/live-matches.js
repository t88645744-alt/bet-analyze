exports.handler = async function(event, context) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return { statusCode: 500, body: JSON.stringify({ error: 'No API key' }) };

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://tmk-analyze.netlify.app',
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-3.3-70b-instruct:free',
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: `Search the web and find current live and upcoming tennis matches today from ATP and WTA tours.
Return ONLY a JSON array, no markdown, no explanation:
[
  {
    "id": "unique_id",
    "player1": "Full Name",
    "player2": "Full Name", 
    "tournament": "Tournament Name",
    "surface": "Hard/Clay/Grass",
    "status": "live" or "upcoming",
    "score": "current score or start time",
    "odds1": estimated decimal odds for player1,
    "odds2": estimated decimal odds for player2
  }
]
Return at least 5-8 matches. Only JSON array.`
        }],
        plugins: [{ id: "web" }]
      }),
    });

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '[]';
    const cleaned = text.replace(/```json|```/g, '').trim();
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: cleaned
    };
  } catch (e) {
    return { statusCode: 500, body: '[]' };
  }
};
