exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'API key тохируулаагүй байна' }) };
  }

  try {
    const body = JSON.parse(event.body);
    
    // OpenRouter format
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://tmk-analyze.netlify.app',
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-3.3-70b-instruct:free',
        messages: body.messages,
        max_tokens: 1000,
      }),
    });

    const data = await response.json();
    
    // Convert OpenRouter response to Anthropic format
    const text = data.choices?.[0]?.message?.content || '';
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: [{ type: 'text', text }]
      }),
    };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Алдаа гарлаа' }) };
  }
};
