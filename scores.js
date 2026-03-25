// api/scores.js
// Vercel Serverless Function - NPB / ESPN scores
// Deployed free on Vercel, called from the frontend

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');

  const { sport = 'baseball', league = 'mlb' } = req.query;

  const ALLOWED = {
    baseball: ['mlb', 'college-baseball', 'npb'],
    soccer: ['jpn.1', 'jpn.2', 'fifa.world', 'afc.champions', 'concacaf.champions', 'eng.1'],
  };

  if (!ALLOWED[sport]?.includes(league)) {
    return res.status(400).json({ error: 'Invalid sport/league' });
  }

  try {
    const url = `https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/scoreboard`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SportsBot/1.0)',
        Accept: 'application/json',
      },
    });

    if (!response.ok) throw new Error(`ESPN returned ${response.status}`);
    const data = await response.json();

    // Normalize to our format
    const games = (data.events || []).map((ev) => {
      const comp = ev.competitions?.[0];
      const home = comp?.competitors?.find((c) => c.homeAway === 'home') || comp?.competitors?.[0];
      const away = comp?.competitors?.find((c) => c.homeAway === 'away') || comp?.competitors?.[1];
      const state = ev.status?.type?.state || '';
      const linescores = comp?.linescores || [];

      return {
        id: ev.id,
        tA: away?.team?.shortDisplayName || away?.team?.displayName || '?',
        tB: home?.team?.shortDisplayName || home?.team?.displayName || '?',
        tA_full: away?.team?.displayName || '?',
        tB_full: home?.team?.displayName || '?',
        sA: parseInt(away?.score) || 0,
        sB: parseInt(home?.score) || 0,
        isLive: state === 'in',
        isFinal: state === 'post',
        status: ev.status?.type?.description || '',
        date: ev.date?.slice(0, 10) || '',
        venue: comp?.venue?.fullName || '',
        league: data.leagues?.[0]?.name || league,
        leagueTag: getTag(sport, league),
        sport: sport,
        // Inning-by-inning or period scores
        periods: linescores.map((s) => s.value || 0),
      };
    });

    return res.status(200).json({
      games,
      fetched: new Date().toISOString(),
      source: 'espn',
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

function getTag(sport, league) {
  const tags = {
    'baseball:mlb': '⚾ MLB',
    'baseball:college-baseball': '⚾ 大学野球',
    'baseball:npb': '⚾ NPB',
    'soccer:jpn.1': '⚽ J1',
    'soccer:jpn.2': '⚽ J2',
    'soccer:fifa.world': '⚽ W杯',
    'soccer:afc.champions': '⚽ AFC',
    'soccer:concacaf.champions': '⚽ CONCACAF',
    'soccer:eng.1': '⚽ Premier League',
  };
  return tags[`${sport}:${league}`] || '⚾';
}
