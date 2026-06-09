exports.handler = async function(event, context) {
  const openKey = process.env.OPENROUTER_API_KEY;
  
  if (!openKey) {
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: '[]' };
  }

  try {
    const today = new Date().toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
    
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openKey}`,
        'HTTP-Referer': 'https://tmk-analyze.netlify.app',
        'X-Title': 'Tennis Betting Analyzer'
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-3.3-70b-instruct:free',
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: `Today is ${today}. List 8-10 real ATP and WTA tennis matches scheduled today or currently live.
Return ONLY a valid JSON array with no markdown formatting:
[
  {
    "id": "1",
    "player1": "Player Full Name",
    "player2": "Player Full Name",
    "tournament": "Tournament Name",
    "surface": "Hard or Clay or Grass",
    "status": "live or upcoming",
    "score": "current score like 6-3 2-1 or start time like 14:00",
    "odds1": 1.75,
    "odds2": 2.20
  }
]
Only return the JSON array. No explanation.`
        }]
      })
    });

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '[]';
    const clean = text.replace(/```json|```/g, '').trim();
    
    // Find JSON array in response
    const start = clean.indexOf('[');
    const end = clean.lastIndexOf(']');
    if (start === -1 || end === -1) {
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: '[]' };
    }
    
    const jsonStr = clean.substring(start, end + 1);
    const parsed = JSON.parse(jsonStr);
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(parsed)
    };
  } catch (e) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ id:"err", player1:"Алдаа гарлаа", player2: e.message?.slice(0,30) || "error", tournament:"", surface:"", status:"upcoming", score:"", odds1:null, odds2:null }])
    };
  }
};
