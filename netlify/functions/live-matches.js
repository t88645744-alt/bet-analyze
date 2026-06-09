exports.handler = async function(event, context) {
  const rapidKey = process.env.RAPIDAPI_TENNIS_KEY;
  if (!rapidKey) return { statusCode: 500, body: JSON.stringify({ error: 'No API key' }) };

  try {
    // Live matches
    const liveRes = await fetch('https://tennis-api-atp-wta-itf.p.rapidapi.com/tennis/v2/live', {
      headers: {
        'x-rapidapi-host': 'tennis-api-atp-wta-itf.p.rapidapi.com',
        'x-rapidapi-key': rapidKey
      }
    });
    const liveData = await liveRes.json();

    // Today's pre-match
    const today = new Date().toISOString().split('T')[0];
    const preRes = await fetch(`https://tennis-api-atp-wta-itf.p.rapidapi.com/tennis/v2/matches/date/${today}`, {
      headers: {
        'x-rapidapi-host': 'tennis-api-atp-wta-itf.p.rapidapi.com',
        'x-rapidapi-key': rapidKey
      }
    });
    const preData = await preRes.json();

    const formatMatch = (m, status) => ({
      id: m.id || m.match_id || Math.random().toString(36).slice(2),
      player1: m.home?.name || m.player1?.name || m.homeTeam?.name || "?",
      player2: m.away?.name || m.player2?.name || m.awayTeam?.name || "?",
      tournament: m.tournament?.name || m.league?.name || m.competition?.name || "ATP/WTA",
      surface: m.tournament?.surface || m.surface || "",
      status: status,
      score: m.score ? `${m.score.home || 0}-${m.score.away || 0}` : (m.startTime || m.time || ""),
      odds1: m.odds?.home || m.homeOdds || null,
      odds2: m.odds?.away || m.awayOdds || null,
    });

    const live = (liveData?.data || liveData?.matches || liveData?.events || []).slice(0, 10).map(m => formatMatch(m, "live"));
    const pre = (preData?.data || preData?.matches || preData?.events || []).slice(0, 15).map(m => formatMatch(m, "upcoming"));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([...live, ...pre])
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
