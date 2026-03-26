// api/highschool.js
// 高校野球スクレイピング - センバツ2026対応
// Sources: SpoNavi → NHK → 静的データ（フォールバック）

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=120');

  try {
    let games = [];

    // Source 1: SpoNavi (baseball.yahoo.co.jp)
    games = await trySpoNavi();
    if (games.length > 0) {
      return res.status(200).json({ games, source: 'sponavi', fetched: new Date().toISOString() });
    }

    // Source 2: NHK Sports JSON
    games = await tryNHK();
    if (games.length > 0) {
      return res.status(200).json({ games, source: 'nhk', fetched: new Date().toISOString() });
    }

    // Source 3: Static fallback - current tournament results
    games = getCurrentTournamentData();
    return res.status(200).json({ games, source: 'static', fetched: new Date().toISOString() });

  } catch (err) {
    const games = getCurrentTournamentData();
    return res.status(200).json({
      games,
      source: 'static_fallback',
      error: err.message,
      fetched: new Date().toISOString()
    });
  }
}

async function trySpoNavi() {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
    'Accept': 'text/html,application/xhtml+xml',
    'Accept-Language': 'ja-JP,ja;q=0.9',
  };
  const urls = [
    'https://baseball.yahoo.co.jp/hsb_spring/game/schedule',
    'https://baseball.yahoo.co.jp/hsb_spring/',
  ];
  for (const url of urls) {
    try {
      const r = await fetch(url, { headers, signal: AbortSignal.timeout(6000) });
      if (!r.ok) continue;
      const html = await r.text();

      // Try JSON embedded in page
      const patterns = [
        /__NEXT_DATA__\s*=\s*({[\s\S]+?})\s*<\/script>/,
        /window\.__INITIAL_STATE__\s*=\s*({[\s\S]+?});\s*<\/script>/,
      ];
      for (const p of patterns) {
        const m = html.match(p);
        if (m) {
          try {
            const data = JSON.parse(m[1]);
            const extracted = extractGamesFromJSON(data);
            if (extracted.length > 0) return extracted;
          } catch {}
        }
      }
    } catch {}
  }
  return [];
}

async function tryNHK() {
  try {
    const r = await fetch('https://www3.nhk.or.jp/sports/json/BK/news.json', {
      signal: AbortSignal.timeout(5000)
    });
    if (!r.ok) return [];
    const data = await r.json();
    return extractGamesFromJSON(data);
  } catch {}
  return [];
}

function extractGamesFromJSON(obj, depth = 0) {
  const games = [];
  if (depth > 8 || !obj || typeof obj !== 'object') return games;
  const keys = Object.keys(obj).map(k => k.toLowerCase());
  const hasTeams = keys.some(k => k.includes('team') || k.includes('home') || k.includes('away'));
  const hasScore = keys.some(k => k.includes('score') || k.includes('run'));
  if (hasTeams && hasScore) {
    const tA = obj.awayTeam || obj.away_team || obj.visitor || obj.teamA || '';
    const tB = obj.homeTeam || obj.home_team || obj.home || obj.teamB || '';
    const sA = parseInt(obj.awayScore ?? obj.away_score ?? obj.scoreA ?? 0);
    const sB = parseInt(obj.homeScore ?? obj.home_score ?? obj.scoreB ?? 0);
    if (tA && tB) {
      const status = (obj.status || obj.state || '').toString().toLowerCase();
      games.push({
        tA: String(tA), tB: String(tB), sA, sB,
        isLive: /live|in|playing|進行/.test(status),
        isFinal: /final|post|end|終了/.test(status),
        leagueName: obj.tournament || obj.league || '春のセンバツ 2026',
        leagueTag: '🏫 高校野球', sport: 'baseball',
      });
    }
  }
  if (Array.isArray(obj)) {
    obj.forEach(item => games.push(...extractGamesFromJSON(item, depth + 1)));
  } else {
    Object.values(obj).forEach(val => {
      if (val && typeof val === 'object') games.push(...extractGamesFromJSON(val, depth + 1));
    });
  }
  return games;
}

// センバツ2026 第98回 最新結果（静的フォールバック）
function getCurrentTournamentData() {
  return [
    // 準々決勝 3/27予定
    { tA: '神村学園', tB: '智辯学園', sA: 0, sB: 0, isLive: false, isFinal: false, leagueName: '春のセンバツ 2026 準々決勝', leagueTag: '🏫 高校野球', sport: 'baseball' },
    { tA: '大阪桐蔭', tB: '九州国際大付', sA: 0, sB: 0, isLive: false, isFinal: false, leagueName: '春のセンバツ 2026 準々決勝', leagueTag: '🏫 高校野球', sport: 'baseball' },
    { tA: '中京大中京', tB: '八戸学院光星', sA: 0, sB: 0, isLive: false, isFinal: false, leagueName: '春のセンバツ 2026 準々決勝', leagueTag: '🏫 高校野球', sport: 'baseball' },
    { tA: '花咲徳栄', tB: '大垣日大', sA: 0, sB: 0, isLive: false, isFinal: false, leagueName: '春のセンバツ 2026 準々決勝', leagueTag: '🏫 高校野球', sport: 'baseball' },
    // 2回戦 結果
    { tA: '帝京', tB: '中京大中京', sA: 4, sB: 9, isLive: false, isFinal: true, leagueName: '春のセンバツ 2026 2回戦', leagueTag: '🏫 高校野球', sport: 'baseball' },
    { tA: '熊本工', tB: '大阪桐蔭', sA: 0, sB: 4, isLive: false, isFinal: true, leagueName: '春のセンバツ 2026 2回戦', leagueTag: '🏫 高校野球', sport: 'baseball' },
    { tA: '八戸学院光星', tB: '滋賀学園', sA: 5, sB: 4, isLive: false, isFinal: true, leagueName: '春のセンバツ 2026 2回戦', leagueTag: '🏫 高校野球', sport: 'baseball' },
    { tA: '日本文理', tB: '花咲徳栄', sA: 1, sB: 17, isLive: false, isFinal: true, leagueName: '春のセンバツ 2026 2回戦', leagueTag: '🏫 高校野球', sport: 'baseball' },
    { tA: '神村学園', tB: '横浜', sA: 2, sB: 0, isLive: false, isFinal: true, leagueName: '春のセンバツ 2026 2回戦', leagueTag: '🏫 高校野球', sport: 'baseball' },
    { tA: '九州国際大付', tB: '神戸国際大付', sA: 2, sB: 1, isLive: false, isFinal: true, leagueName: '春のセンバツ 2026 1回戦 延長11回', leagueTag: '🏫 高校野球', sport: 'baseball' },
    { tA: '近江', tB: '大垣日大', sA: 1, sB: 2, isLive: false, isFinal: true, leagueName: '春のセンバツ 2026 1回戦 延長10回', leagueTag: '🏫 高校野球', sport: 'baseball' },
    // 1回戦 結果
    { tA: '沖縄尚学', tB: '帝京', sA: 3, sB: 7, isLive: false, isFinal: true, leagueName: '春のセンバツ 2026 1回戦', leagueTag: '🏫 高校野球', sport: 'baseball' },
    { tA: '長崎日大', tB: '山梨学院', sA: 3, sB: 5, isLive: false, isFinal: true, leagueName: '春のセンバツ 2026 1回戦', leagueTag: '🏫 高校野球', sport: 'baseball' },
  ];
}
