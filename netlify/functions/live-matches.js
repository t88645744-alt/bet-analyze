exports.handler = async function(event, context) {
  const rapidKey = process.env.RAPIDAPI_TENNIS_KEY;
  const openKey = process.env.OPENROUTER_API_KEY;
  const today = new Date().toISOString().split('T')[0];

  // Try Tennis API first
  if (rapidKey) {
    const endpoints = [
      `https://tennis-api-atp-wta-itf.p.rapidapi.com/tennis/v2/matches/date/${today}`,
      `https://tennis-api-atp-wta-itf.p.rapidapi.com/tennis/v2/scheduled-events/${today}`,
      `https://tennis-api-atp-wta-itf.p.rapidapi.com/tennis/v2/sport/scheduled-events/${today}`,
    ];

    for (const url of endpoints) {
      try {
        const res = await fetch(url, {
          headers: {
            'x-rapidapi-host': 'tennis-api-atp-wta-itf.p.rapidapi.com',
            'x-rapidapi-key': rapidKey,
            'Content-Type': 'application/json'
          }
        });
        const data = await res.json();
        const events = data?.events || data?.data || data?.matches || data?.results || [];
        
        if (Array.isArray(events) && events.length > 0) {
          const matches = events.slice(0, 20).map(m => ({
            id: m.id?.toString() || Math.random().toString(36).slice(2),
            player1: m.homeTeam?.name || m.home?.name || m.player1?.name || "Тоглогч 1",
            player2: m.awayTeam?.name || m.away?.name || m.player2?.name || "Тоглогч 2",
            tournament: m.tournament?.name || m.league?.name || m.category?.name || "ATP/WTA",
            surface: m.tournament?.groundType || m.surface || "",
            status: m.status?.type === "inprogress" ? "live" : "upcoming",
            score: m.homeScore?.current !== undefined ? `${m.homeScore.current}-${m.awayScore?.current || 0}` : (m.startTimestamp ? new Date(m.startTimestamp * 1000).toLocaleTimeString("mn-MN", {hour:"2-digit",minute:"2-digit"}) : ""),
            odds1: null, odds2: null
          }));
          return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(matches) };
        }
      } catch(e) { /* try next */ }
    }

    // Also try live endpoint
    try {
      const res = await fetch('https://tennis-api-atp-wta-itf.p.rapidapi.com/tennis/v2/sport/events/live', {
        headers: { 'x-rapidapi-host': 'tennis-api-atp-wta-itf.p.rapidapi.com', 'x-rapidapi-key': rapidKey }
      });
      const data = await res.json();
      const events = data?.events || data?.data || [];
      if (Array.isArray(events) && events.length > 0) {
        const matches = events.slice(0, 15).map(m => ({
          id: m.id?.toString() || Math.random().toString(36).slice(2),
          player1: m.homeTeam?.name || "Тоглогч 1",
          player2: m.awayTeam?.name || "Тоглогч 2",
          tournament: m.tournament?.name || "ATP/WTA",
          surface: m.tournament?.groundType || "",
          status: "live",
          score: m.homeScore?.current !== undefined ? `${m.homeScore.current}-${m.awayScore?.current || 0}` : "",
          odds1: null, odds2: null
        }));
        return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(matches) };
      }
    } catch(e) {}
  }

  // Fallback: OpenRouter web search
  if (openKey) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openKey}`, 'HTTP-Referer': 'https://tmk-analyze.netlify.app' },
        body: JSON.stringify({
          model: 'meta-llama/llama-3.3-70b-instruct:free',
          max_tokens: 1200,
          messages: [{ role: 'user', content: `Find today's ${new Date().toDateString()} ATP WTA tennis matches. Return ONLY JSON array:\n[{"id":"1","player1":"Name","player2":"Name","tournament":"Name","surface":"Hard/Clay/Grass","status":"live or upcoming","score":"score or HH:MM time","odds1":1.80,"odds2":2.10}]\nAt least 6 matches. Only JSON array, no markdown.` }]
        })
      });
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || '[]';
      const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(parsed) };
    } catch(e) {}
  }

  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: '[]' };
};
