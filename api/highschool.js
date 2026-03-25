// api/highschool.js
// Vercel Serverless Function - 高校野球スクレイピング
// Sources: sports.yahoo.co.jp (SpoNavi) + nhk.or.jp as fallback

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=60');

  try {
    const games = await scrapeHighSchool();
    return res.status(200).json({
      games,
      fetched: new Date().toISOString(),
      source: 'sponavi',
    });
  } catch (err) {
    console.error('Scrape error:', err.message);
    // Return empty on error - frontend falls back to manual entry
    return res.status(200).json({
      games: [],
      error: err.message,
      fetched: new Date().toISOString(),
    });
  }
}

async function scrapeHighSchool() {
  const headers = {
    'User-Agent':
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    Accept: 'text/html,application/xhtml+xml',
    'Accept-Language': 'ja,en;q=0.9',
    Referer: 'https://sports.yahoo.co.jp/',
  };

  // Try SpoNavi high school baseball page
  const url = 'https://sports.yahoo.co.jp/baseball/highschool/';
  const response = await fetch(url, { headers });

  if (!response.ok) throw new Error(`SpoNavi returned ${response.status}`);
  const html = await response.text();

  const games = parseHighSchoolHTML(html);

  // If we got nothing, try alternative URL pattern for current tournament
  if (games.length === 0) {
    return await scrapeAlternative(headers);
  }

  return games;
}

function parseHighSchoolHTML(html) {
  const games = [];

  // Pattern 1: Match score rows like チーム名 X - Y チーム名
  // SpoNavi uses class patterns like "yjSt" for teams, scores in td
  const gameBlockPattern =
    /<div[^>]*class="[^"]*gameScore[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
  const teamPattern = /class="[^"]*team[^"]*"[^>]*>([^<]+)<\/[a-z]+>/gi;
  const scorePattern = /class="[^"]*score[^"]*"[^>]*>(\d+)<\/[a-z]+>/gi;

  // Pattern 2: Table-based layout (common in SpoNavi)
  // Look for rows with two team names and scores between them
  const rowPattern =
    /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;

  while ((rowMatch = rowPattern.exec(html)) !== null) {
    const row = rowMatch[1];
    // Look for patterns like: TeamA ... score ... score ... TeamB
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) =>
      m[1].replace(/<[^>]+>/g, '').trim()
    );

    // Find rows that look like game scores: text, number, number, text
    if (cells.length >= 4) {
      const scoreIndexes = cells.reduce((acc, cell, i) => {
        if (/^\d{1,2}$/.test(cell)) acc.push(i);
        return acc;
      }, []);

      if (scoreIndexes.length >= 2) {
        const si = scoreIndexes[0];
        const possibleTeamA = cells[si - 1];
        const possibleTeamB = cells[scoreIndexes[scoreIndexes.length - 1] + 1];
        const scoreA = parseInt(cells[si]);
        const scoreB = parseInt(cells[scoreIndexes[scoreIndexes.length - 1]]);

        if (
          possibleTeamA &&
          possibleTeamB &&
          possibleTeamA.length > 1 &&
          possibleTeamB.length > 1 &&
          !isNaN(scoreA) &&
          !isNaN(scoreB)
        ) {
          games.push({
            tA: possibleTeamA,
            tB: possibleTeamB,
            sA: scoreA,
            sB: scoreB,
            isLive: false,
            isFinal: true,
            leagueName: detectTournament(html),
            leagueTag: '🏫 高校野球',
            sport: 'baseball',
          });
        }
      }
    }
  }

  // Pattern 3: JSON-LD or embedded JSON data (modern SpoNavi)
  const jsonPattern = /window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});\s*<\/script>/i;
  const jsonMatch = html.match(jsonPattern);
  if (jsonMatch) {
    try {
      const state = JSON.parse(jsonMatch[1]);
      const extracted = extractFromState(state);
      if (extracted.length > 0) return extracted;
    } catch {}
  }

  return deduplicateGames(games);
}

async function scrapeAlternative(headers) {
  // Try the NHK sports page as alternative source
  const games = [];
  try {
    const nhkUrl = 'https://www3.nhk.or.jp/sports/json/BK/top.json';
    const r = await fetch(nhkUrl, { headers });
    if (r.ok) {
      const data = await r.json();
      // NHK sports JSON structure varies — extract what we can
      const items = data?.items || data?.contents || [];
      items.forEach((item) => {
        if (item?.sport === '高校野球' || item?.category === 'baseball') {
          // Extract match info if available
          if (item.homeTeam && item.awayTeam) {
            games.push({
              tA: item.awayTeam,
              tB: item.homeTeam,
              sA: parseInt(item.awayScore) || 0,
              sB: parseInt(item.homeScore) || 0,
              isLive: item.status === 'live',
              isFinal: item.status === 'final',
              leagueName: item.league || '高校野球',
              leagueTag: '🏫 高校野球',
              sport: 'baseball',
            });
          }
        }
      });
    }
  } catch {}

  // Last resort: scrape the JHBF (日本高校野球連盟) official page
  try {
    const jhbfUrl = 'https://www.jhbf.or.jp/game/';
    const r = await fetch(jhbfUrl, { headers });
    if (r.ok) {
      const html = await r.text();
      const extracted = parseJHBFHTML(html);
      games.push(...extracted);
    }
  } catch {}

  return games;
}

function parseJHBFHTML(html) {
  const games = [];
  // JHBF uses a table format for results
  const tablePattern = /<table[^>]*class="[^"]*result[^"]*"[^>]*>([\s\S]*?)<\/table>/gi;
  let tableMatch;

  while ((tableMatch = tablePattern.exec(html)) !== null) {
    const rows = [...tableMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
    rows.forEach((row) => {
      const tds = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) =>
        m[1].replace(/<[^>]+>/g, '').trim()
      );
      // JHBF format: [round, teamA, scoreA, scoreB, teamB, date]
      if (tds.length >= 5 && /^\d+$/.test(tds[2]) && /^\d+$/.test(tds[3])) {
        games.push({
          tA: tds[1],
          tB: tds[4],
          sA: parseInt(tds[2]),
          sB: parseInt(tds[3]),
          isLive: false,
          isFinal: true,
          leagueName: detectTournamentFromContext(tds[0] || ''),
          leagueTag: '🏫 高校野球',
          sport: 'baseball',
        });
      }
    });
  }
  return games;
}

function extractFromState(state) {
  const games = [];
  // Recursively look for game data in the state object
  function search(obj, depth = 0) {
    if (depth > 6 || !obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
      obj.forEach((item) => search(item, depth + 1));
      return;
    }
    // Look for objects that look like game data
    if (obj.homeTeam && obj.awayTeam && obj.homeScore !== undefined) {
      games.push({
        tA: String(obj.awayTeam || obj.away || ''),
        tB: String(obj.homeTeam || obj.home || ''),
        sA: parseInt(obj.awayScore || obj.awayRun || 0),
        sB: parseInt(obj.homeScore || obj.homeRun || 0),
        isLive: obj.status === 'live' || obj.state === 'in',
        isFinal: obj.status === 'final' || obj.state === 'post',
        leagueName: obj.tournament || obj.league || '高校野球',
        leagueTag: '🏫 高校野球',
        sport: 'baseball',
      });
    }
    Object.values(obj).forEach((val) => search(val, depth + 1));
  }
  search(state);
  return games;
}

function detectTournament(html) {
  if (/センバツ|選抜/.test(html)) return '春のセンバツ';
  if (/夏の甲子園|全国高校野球/.test(html)) return '夏の甲子園';
  if (/秋季/.test(html)) return '秋季大会';
  if (/春季/.test(html)) return '春季大会';
  return '高校野球';
}

function detectTournamentFromContext(context) {
  if (/準決勝|決勝|準々決勝|回戦/.test(context)) return '春のセンバツ';
  return '高校野球';
}

function deduplicateGames(games) {
  const seen = new Set();
  return games.filter((g) => {
    const key = `${g.tA}-${g.tB}-${g.sA}-${g.sB}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
