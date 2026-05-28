import { useState, useEffect, useCallback, useRef } from "react";

// ═══ SUPABASE CONFIG ══════════════════════════════════════════
const SB_URL = "https://fffivnmdcpwqfjdnmlad.supabase.co";
const SB_REST_URL = `${SB_URL}/rest/v1`;
const SB_AUTH_URL = `${SB_URL}/auth/v1`;
const SB_KEY = "sb_publishable_OJmbrnv_kqhMg5qcRNri-w_5QRSaw2L";

const sbFetch = async (path, opts = {}, token = null, scope = "rest") => {
  const base = scope === "auth" ? SB_AUTH_URL : SB_REST_URL;
  const res = await fetch(`${base}${path}`, {
    ...opts,
    headers: {
      'apikey': SB_KEY,
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {})
    }
  });
  return res;
};

const supabase = {
  signUp: async (email, password, username) => {
    const r = await sbFetch('/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, data: { username } })
    }, null, "auth");
    return r.json();
  },
  signIn: async (email, password) => {
    const r = await sbFetch('/token?grant_type=password', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    }, null, "auth");
    return r.json();
  },
  signOut: async (token) => {
    await sbFetch('/logout', { method: 'POST' }, token, "auth");
  },
  getUser: async (token) => {
    const r = await sbFetch('/user', {}, token, "auth");
    return r.json();
  },
  getProfile: async (token, userId) => {
    const r = await sbFetch(`/profiles?id=eq.${userId}&select=*`, {}, token);
    const data = await r.json();
    return Array.isArray(data) ? data[0] : null;
  },
  upsertProfile: async (token, profile) => {
    const r = await sbFetch('/profiles', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(profile)
    }, token);
    const data = await r.json();
    return Array.isArray(data) ? data[0] : data;
  },
  updateProfile: async (token, userId, updates) => {
    const r = await sbFetch(`/profiles?id=eq.${userId}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(updates)
    }, token);
    const data = await r.json();
    return Array.isArray(data) ? data[0] : data;
  },
  insertMatch: async (token, match) => {
    const r = await sbFetch('/matches', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(match)
    }, token);
    return r.ok;
  },
  getMatches: async (token, userId) => {
    const r = await sbFetch(`/matches?user_id=eq.${userId}&order=created_at.desc&limit=20`, {}, token);
    return r.json();
  },
  getLeaderboard: async (token) => {
    const r = await sbFetch('/profiles?select=username,wins,losses,xp,rank_tier&order=xp.desc&limit=20', {}, token);
    return r.json();
  }
};

// ═══ GAME ENGINE ══════════════════════════════════════════════
const DEFAULT_ROWS = 6, DEFAULT_COLS = 7, P = "P", A = "A";
const makeBoard = (rows = DEFAULT_ROWS, cols = DEFAULT_COLS) =>
  Array.from({ length: rows }, () => Array(cols).fill(null));

function dropPiece(board, col, who) {
  const rows = board.length;
  for (let r = rows - 1; r >= 0; r--) {
    if (!board[r][col]) {
      const nb = board.map(row => [...row]);
      nb[r][col] = who;
      return { board: nb, row: r };
    }
  }
  return null;
}

function findWin(board, who) {
  const rows = board.length;
  const cols = board[0]?.length ?? 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c <= cols - 4; c++)
    if ([0, 1, 2, 3].every(i => board[r][c + i] === who)) return [[r, c], [r, c + 1], [r, c + 2], [r, c + 3]];
  for (let r = 0; r <= rows - 4; r++) for (let c = 0; c < cols; c++)
    if ([0, 1, 2, 3].every(i => board[r + i][c] === who)) return [[r, c], [r + 1, c], [r + 2, c], [r + 3, c]];
  for (let r = 3; r < rows; r++) for (let c = 0; c <= cols - 4; c++)
    if ([0, 1, 2, 3].every(i => board[r - i][c + i] === who)) return [[r, c], [r - 1, c + 1], [r - 2, c + 2], [r - 3, c + 3]];
  for (let r = 0; r <= rows - 4; r++) for (let c = 0; c <= cols - 4; c++)
    if ([0, 1, 2, 3].every(i => board[r + i][c + i] === who)) return [[r, c], [r + 1, c + 1], [r + 2, c + 2], [r + 3, c + 3]];
  return null;
}

function isFull(board) { return board[0].every(Boolean); }

function scoreBoard(board, who) {
  const rows = board.length;
  const cols = board[0]?.length ?? 0;
  const opp = who === A ? P : A; let s = 0;
  const mid = Math.floor(cols / 2);
  s += board.map(r => r[mid]).filter(c => c === who).length * 3;
  const win = (w) => {
    const m = w.filter(c => c === who).length, e = w.filter(c => !c).length, t = w.filter(c => c === opp).length;
    if (m === 4) return 100; if (m === 3 && e === 1) return 5; if (m === 2 && e === 2) return 2;
    if (t === 3 && e === 1) return -4; return 0;
  };
  for (let r = 0; r < rows; r++) for (let c = 0; c <= cols - 4; c++) s += win([0, 1, 2, 3].map(i => board[r][c + i]));
  for (let r = 0; r <= rows - 4; r++) for (let c = 0; c < cols; c++) s += win([0, 1, 2, 3].map(i => board[r + i][c]));
  for (let r = 3; r < rows; r++) for (let c = 0; c <= cols - 4; c++) s += win([0, 1, 2, 3].map(i => board[r - i][c + i]));
  for (let r = 0; r <= rows - 4; r++) for (let c = 0; c <= cols - 4; c++) s += win([0, 1, 2, 3].map(i => board[r + i][c + i]));
  return s;
}

function validCols(board) {
  const cols = board[0]?.length ?? 0;
  return Array.from({ length: cols }, (_, i) => i).filter(c => !board[0][c]);
}

function minimax(board, depth, alpha, beta, maxing) {
  const wp = findWin(board, P), wa = findWin(board, A);
  if (wp) return [null, -100000 - depth]; if (wa) return [null, 100000 + depth];
  if (isFull(board) || depth === 0) return [null, scoreBoard(board, A)];
  const valid = validCols(board);
  if (maxing) {
    let best = -Infinity, col = valid[0];
    for (const c of valid) { const res = dropPiece(board, c, A); if (!res) continue; const [, s] = minimax(res.board, depth - 1, alpha, beta, false); if (s > best) { best = s; col = c; } alpha = Math.max(alpha, best); if (alpha >= beta) break; }
    return [col, best];
  } else {
    let best = Infinity, col = valid[0];
    for (const c of valid) { const res = dropPiece(board, c, P); if (!res) continue; const [, s] = minimax(res.board, depth - 1, alpha, beta, true); if (s < best) { best = s; col = c; } beta = Math.min(beta, best); if (alpha >= beta) break; }
    return [col, best];
  }
}

const DIFF_DEPTH = { easy: 2, medium: 5, hard: 8 };

// ═══ MODE & MUTATOR REGISTRY ═════════════════════════════════
const MAIN_GAME_MODES = [
  { id: "classic-arena", nav: "game", label: "CLASSIC ARENA", icon: "⬡", desc: "Pure 7x6 competitive board with standard gravity and no power-ups.", color: "#00e5ff" },
  { id: "nexus-lab", nav: "game", label: "NEXUS LAB (SANDBOX)", icon: "🧪", desc: "Developer sandbox with custom board sizes (5x4 to 15x15) and mutator testing.", color: "#7c3aed" },
  { id: "cyber-ranked", nav: "ranked", label: "CYBER RANKED", icon: "◈", desc: "High-precision ladder with strict timers and competitive matchmaking.", color: "#f59e0b" },
  { id: "sector-casual", nav: "game", label: "SECTOR CASUAL", icon: "☕", desc: "Fast non-ranked queue with light mutator pools for approachable matches.", color: "#22c55e" },
  { id: "ai-academy", nav: "game", label: "AI ACADEMY", icon: "🤖", desc: "Practice against Minimax AI with tunable alpha-beta depth tiers.", color: "#bf00ff" },
  { id: "ghost-matrix", nav: "game", label: "GHOST MATRIX", icon: "👻", desc: "Tactical simulations versus behavior-cloned opponents.", color: "#60a5fa" },
  { id: "grid-bracket", nav: "tournaments", label: "GRID BRACKET", icon: "🏆", desc: "Massive tournament structures up to 512 players (Swiss/single elimination).", color: "#ffd700" },
  { id: "data-node-puzzle", nav: "game", label: "DATA NODE PUZZLE", icon: "🧩", desc: "Daily mid-game scenarios with strict turn limits and forced wins.", color: "#06b6d4" },
  { id: "tactical-hub", nav: "game", label: "TACTICAL HUB", icon: "🎯", desc: "Puzzle academy with alternative objectives like Connect 5/6 and geometric patterns.", color: "#ef4444" },
  { id: "discovery-mode", nav: "game", label: "DISCOVERY MODE", icon: "📘", desc: "Educational mode with assistance, threat highlighting, and beginner guidance.", color: "#10b981" }
];

const STACKABLE_MUTATORS = [
  // Space & Time
  "Gravity Shift",
  "Wormhole Portals",
  "Tectonic Earthquake",
  "Matrix Tetris",
  "Singularity Black Hole",
  // Stealth
  "Fog of War",
  "Mirage Tokens",
  "Chameleon",
  "Blind Sniper",
  // Aggression
  "Minefield",
  "Gobblet Overdrive",
  "Infection Mode",
  "Laser Beam",
  // Chaos
  "Blitz Panic",
  "Pinball Bounce",
  "Quantum Drop"
];

const MODE_SETTINGS = {
  "classic-arena": { rows: 6, cols: 7, turnMs: null, aiDepth: "medium", forcedMutators: [] },
  "nexus-lab": { rows: 8, cols: 8, turnMs: null, aiDepth: "medium", forcedMutators: [] },
  "cyber-ranked": { rows: 6, cols: 7, turnMs: 15000, aiDepth: "hard", forcedMutators: [] },
  "sector-casual": { rows: 6, cols: 7, turnMs: null, aiDepth: "easy", forcedMutators: ["Fog of War"] },
  "ai-academy": { rows: 6, cols: 7, turnMs: null, aiDepth: "easy", forcedMutators: [] },
  "ghost-matrix": { rows: 6, cols: 7, turnMs: null, aiDepth: "hard", forcedMutators: ["Chameleon"] },
  "grid-bracket": { rows: 6, cols: 7, turnMs: 15000, aiDepth: "hard", forcedMutators: [] },
  "data-node-puzzle": { rows: 6, cols: 7, turnMs: 12000, aiDepth: "hard", forcedMutators: ["Blitz Panic"] },
  "tactical-hub": { rows: 7, cols: 8, turnMs: null, aiDepth: "medium", forcedMutators: ["Quantum Drop"] },
  "discovery-mode": { rows: 6, cols: 7, turnMs: null, aiDepth: "easy", forcedMutators: [] }
};

const THEME_PRESETS = {
  dark: {
    id: "dark",
    name: "Dark Nexus",
    appBg: "#05050f",
    grid: "rgba(0,229,255,.04)",
    navBg: "rgba(5,5,15,.92)",
    panelBg: "rgba(10,16,40,.6)"
  },
  light: {
    id: "light",
    name: "Light Grid",
    appBg: "#eef4ff",
    grid: "rgba(14,116,144,.12)",
    navBg: "rgba(238,244,255,.95)",
    panelBg: "rgba(255,255,255,.78)"
  },
  neon: {
    id: "neon",
    name: "Neon Pulse",
    appBg: "#060012",
    grid: "rgba(191,0,255,.09)",
    navBg: "rgba(8,0,22,.92)",
    panelBg: "rgba(28,8,56,.62)"
  },
  sunset: {
    id: "sunset",
    name: "Sunset Core",
    appBg: "#1b1020",
    grid: "rgba(249,115,22,.09)",
    navBg: "rgba(27,16,32,.92)",
    panelBg: "rgba(60,26,42,.58)"
  }
};

// ═══ RANK LOGIC ═══════════════════════════════════════════════
function getRankFromXP(xp) {
  if (xp >= 5000) return { tier: "NEXUS LEGEND", color: "#00fff5", icon: "◈" };
  if (xp >= 3000) return { tier: "GRANDMASTER", color: "#f59e0b", icon: "⬟" };
  if (xp >= 2000) return { tier: "MASTER", color: "#9333ea", icon: "⬡" };
  if (xp >= 1200) return { tier: "DIAMOND", color: "#60a5fa", icon: "◇" };
  if (xp >= 700) return { tier: "PLATINUM", color: "#00e5ff", icon: "○" };
  if (xp >= 350) return { tier: "GOLD", color: "#ffd700", icon: "△" };
  if (xp >= 150) return { tier: "SILVER", color: "#a8a9ad", icon: "□" };
  return { tier: "BRONZE", color: "#cd7f32", icon: "×" };
}

// ═══ CSS ══════════════════════════════════════════════════════
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;900&family=Rajdhani:wght@400;500;600;700&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}html,body{background:#05050f;overflow-x:hidden;scrollbar-width:thin;scrollbar-color:#1a2540 #05050f;}
.nx{font-family:'Rajdhani',sans-serif;min-height:100vh;background:#05050f;color:#b0bfee;}
.orb{font-family:'Orbitron',sans-serif;}
input,textarea{font-family:'Rajdhani',sans-serif;background:#0a1028;border:1px solid #1a2540;color:#b0bfee;padding:10px 14px;border-radius:6px;width:100%;font-size:14px;outline:none;transition:border-color .2s;}
input:focus,textarea:focus{border-color:#00e5ff;}
@keyframes dropPiece{from{transform:translateY(-440px);opacity:.5;}to{transform:translateY(0);opacity:1;}}
@keyframes winPulse{0%,100%{transform:scale(1);filter:brightness(1);}50%{transform:scale(1.15);filter:brightness(2);}}
@keyframes floatY{0%,100%{transform:translateY(0);}50%{transform:translateY(-7px);}}
@keyframes shimmerBg{0%{background-position:-200% 0;}100%{background-position:200% 0;}}
@keyframes fadeUp{from{opacity:0;transform:translateY(20px);}to{opacity:1;transform:translateY(0);}}
@keyframes thinkDot{0%,100%{opacity:.2;transform:scale(.7);}50%{opacity:1;transform:scale(1);}}
@keyframes blink{0%,100%{opacity:1;}50%{opacity:.25;}}
@keyframes scanH{0%{transform:translateY(-100%);}100%{transform:translateY(5000px);}}
@keyframes slideIn{from{opacity:0;transform:translateX(-10px);}to{opacity:1;transform:translateX(0);}}
@keyframes popIn{from{opacity:0;transform:scale(.9);}to{opacity:1;transform:scale(1);}}
@keyframes spin{from{transform:rotate(0deg);}to{transform:rotate(360deg);}}
.drop-anim{animation:dropPiece .38s cubic-bezier(.22,1,.36,1) forwards;}
.win-anim{animation:winPulse .9s ease-in-out infinite;}
.float-anim{animation:floatY 3.5s ease-in-out infinite;}
.fade-up{animation:fadeUp .45s ease forwards;}
.think-dot{animation:thinkDot .7s ease-in-out infinite;display:inline-block;width:5px;height:5px;border-radius:50%;background:#bf00ff;}
.think-dot:nth-child(2){animation-delay:.18s;}.think-dot:nth-child(3){animation-delay:.36s;}
.blink{animation:blink 1.2s ease infinite;}
.slide-in{animation:slideIn .3s ease forwards;}
.pop-in{animation:popIn .3s cubic-bezier(.34,1.56,.64,1) forwards;}
.scan-line{animation:scanH 8s linear infinite;pointer-events:none;}
.shimmer{background:linear-gradient(90deg,#00e5ff,#bf00ff,#ffd700,#00e5ff);background-size:200%;-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;animation:shimmerBg 3s linear infinite;}
.grid-bg{background-image:linear-gradient(rgba(0,229,255,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(0,229,255,.04) 1px,transparent 1px);background-size:38px 38px;}
.neon-c{box-shadow:0 0 14px rgba(0,229,255,.3),inset 0 0 14px rgba(0,229,255,.04);}
.card{background:rgba(10,16,40,.6);border:1px solid #1a2540;border-radius:10px;padding:20px;transition:border-color .2s;}
.card:hover{border-color:#2a3a6a;}
.nb{background:transparent;border:none;cursor:pointer;font-family:'Rajdhani',sans-serif;color:#b0bfee;}
.btn{cursor:pointer;font-family:'Orbitron',sans-serif;font-size:11px;font-weight:700;letter-spacing:2px;padding:10px 24px;border-radius:5px;border:1px solid;transition:all .2s;}
.btn:hover{transform:translateY(-1px);}
.btn:disabled{opacity:.5;cursor:not-allowed;transform:none;}
.btn-cyan{background:rgba(0,229,255,.1);border-color:#00e5ff;color:#00e5ff;}
.btn-cyan:hover{background:rgba(0,229,255,.2);}
.btn-ghost{background:transparent;border-color:#1a2540;color:#4a5a8a;}
.btn-ghost:hover{border-color:#2a3a6a;color:#6a7aaa;}
.btn-purple{background:rgba(191,0,255,.1);border-color:#bf00ff;color:#bf00ff;}
.btn-purple:hover{background:rgba(191,0,255,.2);}
.btn-green{background:rgba(16,185,129,.1);border-color:#10b981;color:#10b981;}
.nav-item{padding:8px 14px;border-radius:5px;cursor:pointer;font-size:11px;font-weight:700;letter-spacing:1.5px;transition:all .2s;border:1px solid transparent;}
.nav-item.active{background:rgba(0,229,255,.1);border-color:rgba(0,229,255,.3);color:#00e5ff;}
.nav-item:not(.active){color:#4a5a8a;}
.nav-item:not(.active):hover{color:#8090c0;background:rgba(255,255,255,.03);}
.xp-bar{height:5px;background:#1a2540;border-radius:3px;overflow:hidden;}
.xp-fill{height:100%;background:linear-gradient(90deg,#00e5ff,#bf00ff);border-radius:3px;transition:width .6s ease;}
.tag{font-size:9px;font-family:'Orbitron',sans-serif;letter-spacing:2px;padding:3px 8px;border-radius:3px;font-weight:700;}
.spinner{display:inline-block;width:14px;height:14px;border:2px solid #1a2540;border-top-color:#00e5ff;border-radius:50%;animation:spin .7s linear infinite;}
.sql-block{font-family:monospace;font-size:11px;background:#02040e;border:1px solid #0d1a3a;border-radius:6px;padding:12px;color:#4a8a6a;line-height:1.7;overflow-x:auto;white-space:pre;}
`;

// ═══ ROOT APP ═════════════════════════════════════════════════
export default function NexusApp() {
  const [page, setPage] = useState("landing");
  const [selectedModeId, setSelectedModeId] = useState("classic-arena");
  const [user, setUser] = useState(null);         // { id, email, username, token }
  const [profile, setProfile] = useState(null);   // Supabase profiles row
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [sessionStats, setSessionStats] = useState({ wins: 0, losses: 0, draws: 0, streak: 0, bestStreak: 0, moves: 0, gamesPlayed: 0 });
  const [scores, setScores] = useState({ p: 0, ai: 0 });
  const [showSetup, setShowSetup] = useState(false);
  const [themeId, setThemeId] = useState(() => localStorage.getItem("nx_theme") || "dark");
  const [textSettings, setTextSettings] = useState(() => {
    try {
      const raw = localStorage.getItem("nx_text_settings");
      if (!raw) return { fontScale: 100, fontFamily: "rajdhani", playerText: "PLAYER 1", opponentText: "PLAYER 2", playNowText: "PLAY NOW" };
      return JSON.parse(raw);
    } catch {
      return { fontScale: 100, fontFamily: "rajdhani", playerText: "PLAYER 1", opponentText: "PLAYER 2", playNowText: "PLAY NOW" };
    }
  });

  useEffect(() => {
    const s = document.createElement("style");
    s.textContent = CSS;
    document.head.appendChild(s);
    return () => document.head.removeChild(s);
  }, []);

  useEffect(() => {
    localStorage.setItem("nx_theme", themeId);
  }, [themeId]);

  useEffect(() => {
    localStorage.setItem("nx_text_settings", JSON.stringify(textSettings));
  }, [textSettings]);

  // Restore session from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("nx_session");
    if (saved) {
      try {
        const sess = JSON.parse(saved);
        if (sess.token && sess.id) {
          // Verify token is still valid
          supabase.getUser(sess.token).then(u => {
            if (u.id) {
              setUser({ id: u.id, email: u.email, username: sess.username, token: sess.token });
              loadProfile(sess.token, u.id);
            } else {
              localStorage.removeItem("nx_session");
            }
          }).catch(() => localStorage.removeItem("nx_session"));
        }
      } catch { localStorage.removeItem("nx_session"); }
    }
  }, []);

  const loadProfile = async (token, userId) => {
    try {
      const p = await supabase.getProfile(token, userId);
      if (p) setProfile(p);
      else {
        const fallbackName = user?.username || "nexus_player";
        const created = await supabase.upsertProfile(token, {
          id: userId,
          username: fallbackName,
          rank_tier: "BRONZE",
          xp: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          games_played: 0,
          moves_total: 0,
          best_streak: 0
        });
        if (created) setProfile(created);
        else setShowSetup(true);
      }
    } catch { setShowSetup(true); }
  };

  const handleAuthSuccess = async (userData) => {
    setUser(userData);
    setShowAuth(false);
    localStorage.setItem("nx_session", JSON.stringify({ token: userData.token, id: userData.id, username: userData.username }));
    await loadProfile(userData.token, userData.id);
  };

  const handleLogout = async () => {
    if (user?.token) await supabase.signOut(user.token).catch(() => {});
    setUser(null); setProfile(null);
    localStorage.removeItem("nx_session");
    setPage("landing");
  };

  const handleMatchSaved = async (result, difficulty, moves) => {
    if (!user?.token) return;
    const xpGain = result === 'win' ? 120 : result === 'draw' ? 40 : 20;
    const wins = result === 'win' ? 1 : 0;
    const losses = result === 'loss' ? 1 : 0;
    const draws = result === 'draw' ? 1 : 0;
    try {
      await supabase.insertMatch(user.token, {
        user_id: user.id, result, difficulty, moves, created_at: new Date().toISOString()
      });
      const newProfile = profile ? {
        id: user.id,
        username: user.username,
        xp: (profile.xp || 0) + xpGain,
        wins: (profile.wins || 0) + wins,
        losses: (profile.losses || 0) + losses,
        draws: (profile.draws || 0) + draws,
        games_played: (profile.games_played || 0) + 1,
        moves_total: (profile.moves_total || 0) + moves,
        best_streak: Math.max(profile.best_streak || 0, sessionStats.bestStreak),
        rank_tier: getRankFromXP((profile.xp || 0) + xpGain).tier,
        updated_at: new Date().toISOString()
      } : null;
      if (newProfile) {
        const updated = await supabase.updateProfile(user.token, user.id, newProfile);
        if (updated) setProfile(updated);
      }
    } catch { /* DB not set up yet — silent fail */ }
  };

  const nav = (pg) => {
    setPage(pg);
  };

  const rank = profile ? getRankFromXP(profile.xp || 0) : null;
  const currentTheme = THEME_PRESETS[themeId] || THEME_PRESETS.dark;

  const NAV_ITEMS = [
    { id: "landing", label: "HOME" },
    { id: "game", label: "PLAY" },
    { id: "ranked", label: "RANKED" },
    { id: "tournaments", label: "TOURNAMENTS" },
    { id: "battlepass", label: "BATTLE PASS" },
    { id: "store", label: "STORE" },
    { id: "settings", label: "SETTINGS" },
    { id: "dashboard", label: "PROFILE" },
  ];

  return (
    <div
      className="nx grid-bg"
      style={{
        minHeight: "100vh",
        fontSize: `${Math.max(85, Math.min(130, Number(textSettings.fontScale) || 100))}%`,
        fontFamily: textSettings.fontFamily === "orbitron" ? "'Orbitron',sans-serif" : "'Rajdhani',sans-serif",
        backgroundColor: currentTheme.appBg,
        backgroundImage: `linear-gradient(${currentTheme.grid} 1px,transparent 1px),linear-gradient(90deg,${currentTheme.grid} 1px,transparent 1px)`,
        backgroundSize: "38px 38px"
      }}
    >
      <div className="scan-line" style={{ position: "fixed", top: 0, left: 0, right: 0, height: "2px", background: "rgba(0,229,255,.05)", zIndex: 1 }} />

      {/* NAV */}
      <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 24px", borderBottom: "1px solid #0d1a3a", background: currentTheme.navBg, backdropFilter: "blur(12px)", position: "sticky", top: 0, zIndex: 50, gap: 8 }}>
        <button className="nb orb shimmer" style={{ fontSize: 16, fontWeight: 900, letterSpacing: 3, whiteSpace: "nowrap" }} onClick={() => setPage("landing")}>C4: NEXUS</button>
        <div style={{ display: "flex", gap: 4, overflowX: "auto", flexShrink: 1 }}>
          {NAV_ITEMS.map(n => (
            <button key={n.id} className={`nb orb nav-item${page === n.id ? " active" : ""}`} onClick={() => nav(n.id)}>{n.label}</button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          {user ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ textAlign: "right" }}>
                <div className="orb" style={{ fontSize: 11, fontWeight: 700, color: "#00e5ff" }}>{user.username}</div>
                <div style={{ fontSize: 9, color: rank ? rank.color : "#4a5a8a" }}>{rank ? rank.tier : "LOADING..."}</div>
              </div>
              <div
                style={{ width: 34, height: 34, borderRadius: "50%", border: "2px solid #00e5ff", background: "#0a1428", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "#00e5ff", cursor: "pointer" }}
                onClick={handleLogout}
                title="Sign out"
              >◈</div>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => { setAuthMode("login"); setShowAuth(true); }}>LOGIN</button>
              <button className="btn btn-cyan" onClick={() => { setAuthMode("register"); setShowAuth(true); }}>REGISTER</button>
              <span className="tag" style={{ background: "rgba(0,229,255,.1)", color: "#00e5ff" }}>GUEST</span>
            </div>
          )}
        </div>
      </nav>

      {/* PAGES */}
      {page === "landing" && (
        <LandingPage
          onPlay={() => setPage("game")}
          onNav={nav}
          user={user}
          selectedModeId={selectedModeId}
          onSelectMode={setSelectedModeId}
          textSettings={textSettings}
        />
      )}
      {page === "game" && (
        <GamePage
          sessionStats={sessionStats}
          setSessionStats={setSessionStats}
          scores={scores}
          setScores={setScores}
          user={user}
          onMatchSaved={handleMatchSaved}
          selectedModeId={selectedModeId}
          textSettings={textSettings}
        />
      )}
      {page === "ranked" && <RankedPage user={user} profile={profile} rank={rank} />}
      {page === "tournaments" && <TournamentsPage />}
      {page === "battlepass" && <BattlePassPage user={user} profile={profile} sessionStats={sessionStats} />}
      {page === "store" && <StorePage />}
      {page === "settings" && <SettingsPage themeId={themeId} setThemeId={setThemeId} theme={currentTheme} textSettings={textSettings} setTextSettings={setTextSettings} />}
      {page === "dashboard" && <DashboardPage user={user} profile={profile} sessionStats={sessionStats} scores={scores} rank={rank} onNav={nav} />}

      {/* AUTH MODAL */}
      {showAuth && <AuthModal mode={authMode} setMode={setAuthMode} onClose={() => setShowAuth(false)} onSuccess={handleAuthSuccess} />}

      {/* DB SETUP GUIDE */}
      {showSetup && <SetupGuide onClose={() => setShowSetup(false)} />}
    </div>
  );
}

// ═══ AUTH MODAL (real Supabase) ═══════════════════════════════
function AuthModal({ mode, setMode, onClose, onSuccess }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async () => {
    setError(""); setSuccess(""); setLoading(true);
    if (!email || !password) { setError("Please fill all required fields."); setLoading(false); return; }
    if (password.length < 6) { setError("Password must be 6+ characters."); setLoading(false); return; }

    try {
      if (mode === "register") {
        const uname = username || email.split("@")[0];
        const data = await supabase.signUp(email, password, uname);
        if (data.error?.message || data.msg) {
          setError(data.error?.message || data.msg);
          setLoading(false); return;
        }
        if (data.access_token && data.user?.id) {
          onSuccess({ id: data.user.id, email: data.user.email, username: uname, token: data.access_token });
        } else {
          setSuccess("Account created. Please sign in.");
          setMode("login");
        }
      } else {
        const data = await supabase.signIn(email, password);
        if (data.error?.message || data.error_description) {
          setError(data.error_description || data.error?.message || "Invalid credentials.");
          setLoading(false); return;
        }
        if (data.access_token) {
          const uname = data.user?.user_metadata?.username || email.split("@")[0];
          onSuccess({ id: data.user.id, email: data.user.email, username: uname, token: data.access_token });
        } else {
          setError("Login failed. Check your credentials.");
        }
      }
    } catch (e) {
      setError("Network error. Please try again.");
    }
    setLoading(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, backdropFilter: "blur(6px)" }} onClick={onClose}>
      <div className="pop-in" style={{ background: "#080816", border: "1px solid #1a2540", borderRadius: 14, padding: 36, width: 390, maxWidth: "90vw" }} onClick={e => e.stopPropagation()}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div className="orb shimmer" style={{ fontSize: 20, fontWeight: 900, letterSpacing: 4, marginBottom: 8 }}>CONNECT4: NEXUS</div>
          <div className="orb" style={{ fontSize: 11, letterSpacing: 3, color: "#4a5a8a" }}>{mode === "login" ? "WELCOME BACK" : "JOIN THE BATTLE"}</div>
        </div>

        <div style={{ display: "flex", marginBottom: 24, background: "#0a1028", borderRadius: 6, padding: 3 }}>
          {["login", "register"].map(m => (
            <button key={m} className="nb orb" style={{ flex: 1, padding: "8px", fontSize: 10, fontWeight: 700, letterSpacing: 2, borderRadius: 4, background: mode === m ? "rgba(0,229,255,.15)" : "transparent", color: mode === m ? "#00e5ff" : "#4a5a8a", border: mode === m ? "1px solid rgba(0,229,255,.4)" : "1px solid transparent", transition: "all .2s" }} onClick={() => { setMode(m); setError(""); setSuccess(""); }}>
              {m.toUpperCase()}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {mode === "register" && (
            <div>
              <label style={{ fontSize: 11, color: "#4a5a8a", letterSpacing: 1, display: "block", marginBottom: 5 }}>USERNAME</label>
              <input value={username} onChange={e => setUsername(e.target.value)} placeholder="nexus_player" />
            </div>
          )}
          <div>
            <label style={{ fontSize: 11, color: "#4a5a8a", letterSpacing: 1, display: "block", marginBottom: 5 }}>EMAIL</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "#4a5a8a", letterSpacing: 1, display: "block", marginBottom: 5 }}>PASSWORD</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" onKeyDown={e => e.key === "Enter" && handleSubmit()} />
          </div>
        </div>

        {error && <div style={{ marginTop: 12, padding: "8px 12px", background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.3)", borderRadius: 5, fontSize: 12, color: "#ef4444" }}>{error}</div>}
        {success && <div style={{ marginTop: 12, padding: "8px 12px", background: "rgba(16,185,129,.1)", border: "1px solid rgba(16,185,129,.3)", borderRadius: 5, fontSize: 12, color: "#10b981" }}>{success}</div>}

        <button className="btn btn-cyan" onClick={handleSubmit} disabled={loading} style={{ width: "100%", marginTop: 20, fontSize: 12, padding: "13px" }}>
          {loading ? <><span className="spinner" style={{ marginRight: 8 }} />CONNECTING...</> : mode === "login" ? "▶ LOGIN" : "▶ CREATE ACCOUNT"}
        </button>

        <div style={{ marginTop: 12, padding: "10px 12px", background: "rgba(0,229,255,.03)", border: "1px solid #0d1a3a", borderRadius: 6 }}>
          <div style={{ fontSize: 10, color: "#2a4a6a", letterSpacing: 1 }}>
            Powered by <span style={{ color: "#00e5ff" }}>Supabase</span> · {SB_URL.split("//")[1].split(".")[0]}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══ SETUP GUIDE ══════════════════════════════════════════════
function SetupGuide({ onClose }) {
  const [copied, setCopied] = useState(false);
  const SQL = `-- Run this in Supabase SQL Editor (once)
create table if not exists profiles (
  id uuid references auth.users primary key,
  username text,
  rank_tier text default 'BRONZE',
  xp integer default 0,
  wins integer default 0,
  losses integer default 0,
  draws integer default 0,
  games_played integer default 0,
  moves_total integer default 0,
  best_streak integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create table if not exists matches (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users,
  result text,
  difficulty text,
  moves integer,
  created_at timestamptz default now()
);
alter table profiles enable row level security;
alter table matches enable row level security;
create policy "read profiles" on profiles for select using (true);
create policy "write own profile" on profiles for all using (auth.uid()=id);
create policy "write own matches" on matches for all using (auth.uid()=user_id);`;

  const copy = () => { navigator.clipboard.writeText(SQL); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, backdropFilter: "blur(6px)" }} onClick={onClose}>
      <div className="pop-in" style={{ background: "#080816", border: "1px solid #ffd70044", borderRadius: 14, padding: 28, width: 580, maxWidth: "95vw", maxHeight: "85vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div className="orb" style={{ fontSize: 13, fontWeight: 700, color: "#ffd700", letterSpacing: 2 }}>⚙ DATABASE SETUP REQUIRED</div>
            <div style={{ fontSize: 12, color: "#4a5a8a", marginTop: 4 }}>Run this SQL in your Supabase dashboard once to enable stats & leaderboards.</div>
          </div>
          <button className="nb" style={{ fontSize: 18, color: "#4a5a8a", padding: 4 }} onClick={onClose}>✕</button>
        </div>
        <pre className="sql-block">{SQL}</pre>
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <button className="btn btn-ghost" onClick={copy} style={{ fontSize: 10 }}>{copied ? "✓ COPIED" : "COPY SQL"}</button>
          <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
            <button className="btn btn-cyan" style={{ fontSize: 10 }}>OPEN SUPABASE DASHBOARD ↗</button>
          </a>
          <button className="btn btn-ghost" onClick={onClose} style={{ fontSize: 10, marginLeft: "auto" }}>DISMISS</button>
        </div>
      </div>
    </div>
  );
}

// ═══ LANDING PAGE ═════════════════════════════════════════════
function LandingPage({ onPlay, onNav, user, selectedModeId, onSelectMode, textSettings }) {
  const MODES = MAIN_GAME_MODES;
  const FEATURES = [
    { icon: "🤖", title: "Ghost AI", desc: "Train against a clone of your own play style built from your move history." },
    { icon: "🏆", title: "Tournaments", desc: "512-player brackets, Swiss system, live bracketing and match broadcasting." },
    { icon: "⚙", title: "Mod System", desc: "Stack up to 8 simultaneous mutators for unique chaotic game modes." },
    { icon: "📊", title: "AI Coach", desc: "Post-match analysis highlights blunders and missed win conditions." },
  ];

  return (
    <div style={{ overflowY: "auto" }}>
      {/* HERO */}
      <div style={{ textAlign: "center", padding: "90px 24px 60px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% -10%, rgba(0,229,255,.07) 0%, transparent 60%)", pointerEvents: "none" }} />
        <div className="orb fade-up" style={{ fontSize: 10, letterSpacing: 5, color: "#00e5ff", marginBottom: 14, opacity: .7 }}>STRATEGY HAS EVOLVED</div>
        <h1 className="orb float-anim" style={{ fontSize: "clamp(42px,8vw,100px)", fontWeight: 900, lineHeight: .95, marginBottom: 24, color: "#fff" }}>
          <span style={{ color: "#00e5ff" }}>CONNECT</span><span>4</span><br />
          <span className="shimmer">NEXUS</span>
        </h1>
        <p style={{ fontSize: 17, maxWidth: 480, margin: "0 auto 40px", color: "#6070a0", lineHeight: 1.65 }}>
          Battle adaptive AI. Warp gravity. Survive chaos.<br />Every match plays differently.
        </p>
        <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
          <button className="btn btn-cyan" style={{ fontSize: 13, padding: "15px 44px" }} onClick={onPlay}>▶ {textSettings.playNowText || "PLAY NOW"}</button>
          <button className="btn btn-ghost" style={{ fontSize: 13, padding: "15px 32px" }} onClick={() => onNav("ranked")}>◈ RANKED QUEUE</button>
        </div>
      </div>

      {/* GAME MODES */}
      <div style={{ padding: "48px 24px", borderTop: "1px solid #0d1a3a" }}>
        <div className="orb" style={{ textAlign: "center", fontSize: 9, letterSpacing: 4, color: "#00e5ff", marginBottom: 6 }}>BATTLE MODES</div>
        <h2 className="orb" style={{ textAlign: "center", fontSize: 28, fontWeight: 700, color: "#fff", marginBottom: 36 }}>CHOOSE YOUR CHAOS</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 14, maxWidth: 920, margin: "0 auto" }}>
          {MODES.map((m, i) => (
            <button key={i} className="nb" style={{ textAlign: "left", padding: "22px", background: "rgba(10,16,40,.5)", border: "1px solid #1a2540", borderRadius: 10, cursor: "pointer", transition: "all .25s" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = m.color; e.currentTarget.style.transform = "translateY(-2px)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "#1a2540"; e.currentTarget.style.transform = "translateY(0)"; }}
              onClick={() => {
                onSelectMode(m.id);
                onNav(m.nav);
              }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 24 }}>{m.icon}</span>
                <span className="orb" style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: m.color }}>{m.label}</span>
              </div>
              <p style={{ fontSize: 12, color: "#6070a0", lineHeight: 1.5 }}>{m.desc}</p>
              {selectedModeId === m.id && (
                <div style={{ marginTop: 10 }}>
                  <span className="tag" style={{ background: `${m.color}22`, color: m.color }}>SELECTED</span>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* FEATURES */}
      <div style={{ padding: "48px 24px", borderTop: "1px solid #0d1a3a", background: "rgba(0,0,0,.2)" }}>
        <div className="orb" style={{ textAlign: "center", fontSize: 9, letterSpacing: 4, color: "#bf00ff", marginBottom: 6 }}>PLATFORM FEATURES</div>
        <h2 className="orb" style={{ textAlign: "center", fontSize: 28, fontWeight: 700, color: "#fff", marginBottom: 36 }}>BUILT FOR COMPETITORS</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 16, maxWidth: 920, margin: "0 auto" }}>
          {FEATURES.map((f, i) => (
            <div key={i} className="card">
              <div style={{ fontSize: 28, marginBottom: 12 }}>{f.icon}</div>
              <div className="orb" style={{ fontSize: 12, fontWeight: 700, color: "#fff", marginBottom: 8, letterSpacing: 1 }}>{f.title}</div>
              <p style={{ fontSize: 13, color: "#6070a0", lineHeight: 1.55 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* RANKS */}
      <div style={{ padding: "48px 24px", borderTop: "1px solid #0d1a3a" }}>
        <div className="orb" style={{ textAlign: "center", fontSize: 9, letterSpacing: 4, color: "#ffd700", marginBottom: 6 }}>RANKED SYSTEM</div>
        <h2 className="orb" style={{ textAlign: "center", fontSize: 28, fontWeight: 700, color: "#fff", marginBottom: 36 }}>CLIMB THE LADDER</h2>
        <div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap", maxWidth: 800, margin: "0 auto" }}>
          {[["BRONZE", "#cd7f32"], ["SILVER", "#a8a9ad"], ["GOLD", "#ffd700"], ["PLATINUM", "#00e5ff"], ["DIAMOND", "#60a5fa"], ["MASTER", "#9333ea"], ["GRANDMASTER", "#f59e0b"], ["NEXUS LEGEND", "#00fff5"]].map(([r, c]) => (
            <div key={r} style={{ padding: "8px 18px", border: `1px solid ${c}44`, borderRadius: 4, background: `${c}11` }}>
              <div className="orb" style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: c }}>{r}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ borderTop: "1px solid #0d1a3a", padding: "20px 24px", display: "flex", justifyContent: "space-between", opacity: .4 }}>
        <div className="orb" style={{ fontSize: 10, letterSpacing: 2, color: "#4a5a8a" }}>CONNECT4: NEXUS © 2025</div>
        <div style={{ fontSize: 10, color: "#4a5a8a" }}>CHAOS ENGINE v2.0</div>
      </div>
    </div>
  );
}

// ═══ GAME PAGE ════════════════════════════════════════════════
function GamePage({ sessionStats, setSessionStats, scores, setScores, user, onMatchSaved, selectedModeId, textSettings }) {
  const modeConfig = MODE_SETTINGS[selectedModeId] || MODE_SETTINGS["classic-arena"];
  const [labSize, setLabSize] = useState({ rows: 8, cols: 8 });
  const boardRows = selectedModeId === "nexus-lab" ? labSize.rows : modeConfig.rows;
  const boardCols = selectedModeId === "nexus-lab" ? labSize.cols : modeConfig.cols;
  const [board, setBoard] = useState(makeBoard(boardRows, boardCols));
  const [turn, setTurn] = useState(P);
  const [winCells, setWinCells] = useState(null);
  const [isDraw, setIsDraw] = useState(false);
  const [hoverCol, setHoverCol] = useState(null);
  const [thinking, setThinking] = useState(false);
  const [difficulty, setDifficulty] = useState(modeConfig.aiDepth);
  const [moveLog, setMoveLog] = useState([]);
  const [lastDropped, setLastDropped] = useState(null);
  const [activeMods, setActiveMods] = useState(modeConfig.forcedMutators);
  const [showModPanel, setShowModPanel] = useState(false);
  const [savingMatch, setSavingMatch] = useState(false);
  const [turnTimeLeftMs, setTurnTimeLeftMs] = useState(modeConfig.turnMs || null);
  const [matchMode, setMatchMode] = useState("ai"); // ai | local | online
  const [roomCode, setRoomCode] = useState("room-1");
  const [wsUrl, setWsUrl] = useState("ws://localhost:4000/ws");
  const [onlineStatus, setOnlineStatus] = useState("offline");
  const wsRef = useRef(null);
  const boardRef = useRef(board);
  const turnRef = useRef(turn);
  const gameOverRef = useRef(false);
  const savedRef = useRef(false);

  const gameOver = winCells || isDraw;
  const pWon = !!findWin(board, P);
  const aWon = !!findWin(board, A);
  const playerWon = winCells && pWon;

  useEffect(() => { boardRef.current = board; }, [board]);
  useEffect(() => { turnRef.current = turn; }, [turn]);
  useEffect(() => { gameOverRef.current = gameOver; }, [gameOver]);

  const reset = useCallback(() => {
    setBoard(makeBoard(boardRows, boardCols)); setTurn(P); setWinCells(null); setIsDraw(false);
    setHoverCol(null); setThinking(false); setMoveLog([]); setLastDropped(null);
    setTurnTimeLeftMs(modeConfig.turnMs || null);
    savedRef.current = false;
  }, [boardRows, boardCols, modeConfig.turnMs]);

  useEffect(() => {
    setDifficulty(modeConfig.aiDepth);
    setActiveMods(modeConfig.forcedMutators);
    reset();
  }, [selectedModeId, modeConfig.aiDepth, modeConfig.forcedMutators, reset]);

  // Save match when game ends
  useEffect(() => {
    if (!gameOver || savedRef.current || !user || matchMode !== "ai") return;
    savedRef.current = true;
    const result = isDraw ? 'draw' : playerWon ? 'win' : 'loss';
    setSavingMatch(true);
    onMatchSaved(result, difficulty, moveLog.length).finally(() => setSavingMatch(false));
  }, [gameOver]);

  const handleDrop = useCallback((col, forcedWho = turn) => {
    const mustBePlayerTurn = matchMode === "ai" || matchMode === "online";
    if (gameOver || thinking || board[0][col]) return;
    if (mustBePlayerTurn && turn !== P) return;
    const res = dropPiece(board, col, forcedWho);
    if (!res) return;
    setLastDropped({ row: res.row, col });
    setBoard(res.board);
    setMoveLog(prev => [...prev, { who: forcedWho, col, n: prev.length + 1 }]);
    setSessionStats(s => ({ ...s, moves: s.moves + 1 }));
    const w = findWin(res.board, forcedWho);
    if (w) {
      setWinCells(w);
      if (matchMode !== "local" && forcedWho === P) {
        setScores(s => ({ ...s, p: s.p + 1 }));
        setSessionStats(s => ({ ...s, wins: s.wins + 1, streak: s.streak + 1, bestStreak: Math.max(s.bestStreak, s.streak + 1), gamesPlayed: s.gamesPlayed + 1 }));
      } else if (matchMode !== "local" && forcedWho === A) {
        setScores(s => ({ ...s, ai: s.ai + 1 }));
        setSessionStats(s => ({ ...s, losses: s.losses + 1, streak: 0, gamesPlayed: s.gamesPlayed + 1 }));
      } else if (matchMode === "local") {
        setScores(s => (forcedWho === P ? { ...s, p: s.p + 1 } : { ...s, ai: s.ai + 1 }));
        setSessionStats(s => ({ ...s, gamesPlayed: s.gamesPlayed + 1 }));
      }
    } else if (isFull(res.board)) {
      setIsDraw(true); setSessionStats(s => ({ ...s, draws: s.draws + 1, streak: 0, gamesPlayed: s.gamesPlayed + 1 }));
    } else { setTurn(forcedWho === P ? A : P); }
    if (matchMode === "online" && forcedWho === P && wsRef.current?.readyState === 1) {
      wsRef.current.send(JSON.stringify({ type: "move", room: roomCode, col, rows: boardRows, cols: boardCols }));
    }
    if (modeConfig.turnMs) setTurnTimeLeftMs(modeConfig.turnMs);
  }, [board, gameOver, turn, thinking, modeConfig.turnMs, matchMode, roomCode, boardRows, boardCols]);

  useEffect(() => {
    if (matchMode !== "ai" || turn !== A || gameOver) return;
    setThinking(true);
    const delay = difficulty === "easy" ? 350 : difficulty === "medium" ? 700 : 1000;
    const t = setTimeout(() => {
      const [col] = minimax(board, DIFF_DEPTH[difficulty], -Infinity, Infinity, true);
      if (col == null) { setThinking(false); return; }
      const res = dropPiece(board, col, A);
      if (!res) { setThinking(false); return; }
      setLastDropped({ row: res.row, col });
      setBoard(res.board);
      setMoveLog(prev => [...prev, { who: A, col, n: prev.length + 1 }]);
      const w = findWin(res.board, A);
      if (w) {
        setWinCells(w); setScores(s => ({ ...s, ai: s.ai + 1 }));
        setSessionStats(s => ({ ...s, losses: s.losses + 1, streak: 0, gamesPlayed: s.gamesPlayed + 1 }));
      } else if (isFull(res.board)) {
        setIsDraw(true); setSessionStats(s => ({ ...s, draws: s.draws + 1, streak: 0, gamesPlayed: s.gamesPlayed + 1 }));
      } else { setTurn(P); }
      if (modeConfig.turnMs) setTurnTimeLeftMs(modeConfig.turnMs);
      setThinking(false);
    }, delay);
    return () => clearTimeout(t);
  }, [turn, board, gameOver, difficulty, modeConfig.turnMs, matchMode]);

  useEffect(() => {
    if (matchMode !== "online") return;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    setOnlineStatus("connecting");
    ws.onopen = () => {
      setOnlineStatus("connected");
      ws.send(JSON.stringify({ type: "join", room: roomCode }));
    };
    ws.onclose = () => setOnlineStatus("offline");
    ws.onerror = () => setOnlineStatus("error");
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "move" && typeof msg.col === "number" && turnRef.current === A && !gameOverRef.current) {
          const res = dropPiece(boardRef.current, msg.col, A);
          if (!res) return;
          setLastDropped({ row: res.row, col: msg.col });
          setBoard(res.board);
          setMoveLog(prev => [...prev, { who: A, col: msg.col, n: prev.length + 1 }]);
          const w = findWin(res.board, A);
          if (w) {
            setWinCells(w);
            setScores(s => ({ ...s, ai: s.ai + 1 }));
          } else if (isFull(res.board)) {
            setIsDraw(true);
          } else {
            setTurn(P);
          }
        }
      } catch {
        // ignore malformed messages
      }
    };
    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [matchMode, wsUrl, roomCode]);

  useEffect(() => {
    if (!modeConfig.turnMs || gameOver) return;
    setTurnTimeLeftMs(modeConfig.turnMs);
  }, [turn, modeConfig.turnMs, gameOver]);

  useEffect(() => {
    if (!modeConfig.turnMs || gameOver || turnTimeLeftMs == null) return;
    const tick = setInterval(() => {
      setTurnTimeLeftMs(prev => {
        if (prev == null) return prev;
        const next = prev - 250;
        if (next <= 0) {
          if (turn === P) {
            const valid = validCols(board);
            if (valid.length > 0) {
              const forcedCol = valid[Math.floor(Math.random() * valid.length)];
              handleDrop(forcedCol, P);
            }
          }
          return modeConfig.turnMs;
        }
        return next;
      });
    }, 250);
    return () => clearInterval(tick);
  }, [modeConfig.turnMs, gameOver, turn, turnTimeLeftMs, board, handleDrop]);

  const MODS_LIST = STACKABLE_MUTATORS;
  const POWERS = [{ name: "BOMB", icon: "💣", cd: "3T", c: "#ef4444" }, { name: "FREEZE", icon: "❄", cd: "4T", c: "#60a5fa" }, { name: "SHIELD", icon: "🛡", cd: "5T", c: "#10b981" }, { name: "WARP", icon: "⚡", cd: "6T", c: "#ffd700" }];

  return (
    <div style={{ display: "flex", height: "calc(100vh - 53px)", overflow: "hidden" }}>
      {/* LEFT PANEL */}
      <div style={{ width: 192, borderRight: "1px solid #0d1a3a", padding: 14, display: "flex", flexDirection: "column", gap: 14, background: "rgba(6,6,18,.7)", overflowY: "auto" }}>
        <SideCard label={matchMode === "local" ? (textSettings.playerText || "PLAYER 1") : "YOU"} color="#00e5ff" avatar="◈" score={scores.p} subtitle={matchMode === "local" ? "LOCAL" : "SESSION"} active={turn === P && !gameOver} />
        <div style={{ borderTop: "1px solid #0d1a3a", paddingTop: 12 }}>
          <div className="orb" style={{ fontSize: 8, letterSpacing: 3, color: "#4a5a8a", marginBottom: 8 }}>POWER-UPS</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {POWERS.map(pw => (
              <button key={pw.name} title={pw.name} className="nb" style={{ padding: "8px 4px", background: "rgba(10,20,50,.5)", border: "1px solid #1a2540", borderRadius: 5, textAlign: "center", transition: "border-color .2s" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = pw.c} onMouseLeave={e => e.currentTarget.style.borderColor = "#1a2540"}>
                <div style={{ fontSize: 18 }}>{pw.icon}</div>
                <div className="orb" style={{ fontSize: 7, color: "#4a5a8a", letterSpacing: 1 }}>{pw.cd}</div>
              </button>
            ))}
          </div>
        </div>
        <div style={{ borderTop: "1px solid #0d1a3a", paddingTop: 12 }}>
          <div className="orb" style={{ fontSize: 8, letterSpacing: 3, color: "#4a5a8a", marginBottom: 8 }}>SESSION</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, textAlign: "center" }}>
            {[["W", scores.p, "#00e5ff"], ["D", sessionStats.draws, "#ffd700"], ["L", scores.ai, "#ef4444"]].map(([l, v, c]) => (
              <div key={l} style={{ padding: "6px 2px", background: "rgba(10,20,50,.5)", borderRadius: 4 }}>
                <div className="orb" style={{ fontSize: 14, fontWeight: 900, color: c }}>{v}</div>
                <div style={{ fontSize: 8, color: "#4a5a8a" }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ borderTop: "1px solid #0d1a3a", paddingTop: 12, flex: 1, overflow: "hidden" }}>
          <div className="orb" style={{ fontSize: 8, letterSpacing: 3, color: "#4a5a8a", marginBottom: 8 }}>MOVE LOG</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 200, overflowY: "auto" }}>
            {[...moveLog].reverse().slice(0, 14).map((m, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, padding: "2px 6px", borderRadius: 3, background: "rgba(10,20,50,.4)" }}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: m.who === P ? "#00e5ff" : "#bf00ff", flexShrink: 0 }} />
                <span style={{ fontSize: 9, color: "#4a5a8a" }}>#{m.n}</span>
                <span style={{ fontSize: 9, color: m.who === P ? "#00e5ff" : "#bf00ff" }}>C{m.col + 1}</span>
              </div>
            ))}
          </div>
        </div>
        {!user && <div style={{ padding: "8px", background: "rgba(0,229,255,.04)", border: "1px solid rgba(0,229,255,.1)", borderRadius: 5, fontSize: 10, color: "#3a5a7a", lineHeight: 1.5 }}>Sign in to save your match history & stats.</div>}
      </div>

      {/* BOARD CENTER */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20, gap: 14 }}>
        <div style={{ textAlign: "center", minHeight: 44 }}>
          <div className="orb" style={{ fontSize: 9, letterSpacing: 2, color: "#4a5a8a", marginBottom: 4 }}>
            MODE: {(MAIN_GAME_MODES.find(m => m.id === selectedModeId)?.label || "CLASSIC ARENA")}
          </div>
          <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 8 }}>
            {[
              { id: "ai", label: "AI" },
              { id: "local", label: "LOCAL 1V1" },
              { id: "online", label: "ONLINE BETA" }
            ].map((m) => (
              <button
                key={m.id}
                className="btn"
                onClick={() => setMatchMode(m.id)}
                style={{
                  fontSize: 9,
                  padding: "6px 12px",
                  borderColor: matchMode === m.id ? "#00e5ff" : "#1a2540",
                  background: matchMode === m.id ? "rgba(0,229,255,.14)" : "rgba(10,16,40,.5)",
                  color: matchMode === m.id ? "#00e5ff" : "#6a7aaa"
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
          {matchMode === "online" && (
            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 8, flexWrap: "wrap" }}>
              <input
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value)}
                placeholder="room code"
                style={{ width: 120, fontSize: 11, padding: "6px 8px" }}
              />
              <input
                value={wsUrl}
                onChange={(e) => setWsUrl(e.target.value)}
                placeholder="ws://localhost:4000/ws"
                style={{ width: 210, fontSize: 11, padding: "6px 8px" }}
              />
              <span className="tag" style={{ background: "rgba(255,215,0,.12)", color: "#ffd700" }}>
                WS: {onlineStatus.toUpperCase()}
              </span>
            </div>
          )}
          {gameOver ? (
            <div className="fade-up">
              <div className="orb" style={{ fontSize: 28, fontWeight: 900, color: playerWon ? "#00e5ff" : isDraw ? "#ffd700" : "#bf00ff", textShadow: `0 0 30px ${playerWon ? "#00e5ff" : isDraw ? "#ffd700" : "#bf00ff"}` }}>
                {pWon ? (matchMode === "local" ? "P1 WINS" : "YOU WIN") : isDraw ? "DRAW" : matchMode === "local" ? "P2 WINS" : matchMode === "online" ? "FRIEND WINS" : "AI WINS"}
              </div>
              {sessionStats.streak > 1 && playerWon && <div className="orb" style={{ fontSize: 10, color: "#ffd700", letterSpacing: 3 }}>🔥 {sessionStats.streak} WIN STREAK</div>}
              {savingMatch && <div style={{ fontSize: 10, color: "#4a5a8a", marginTop: 4 }}><span className="spinner" style={{ marginRight: 6 }} />Saving match...</div>}
              {!savingMatch && user && <div style={{ fontSize: 10, color: "#10b981", marginTop: 4 }}>✓ Match saved</div>}
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: turn === P ? "#00e5ff" : "#bf00ff", boxShadow: `0 0 10px ${turn === P ? "#00e5ff" : "#bf00ff"}` }} className="blink" />
              {thinking ? (
                <span className="orb" style={{ fontSize: 10, color: "#bf00ff", letterSpacing: 2, display: "flex", alignItems: "center", gap: 6 }}>
                  NEXUS AI <span className="think-dot" /><span className="think-dot" /><span className="think-dot" />
                </span>
              ) : (
                <span className="orb" style={{ fontSize: 10, letterSpacing: 2, color: turn === P ? "#00e5ff" : "#bf00ff" }}>
                  {turn === P ? (matchMode === "local" ? "P1 TURN" : "YOUR TURN") : (matchMode === "local" ? "P2 TURN" : matchMode === "online" ? "FRIEND TURN" : "AI TURN")}
                </span>
              )}
            </div>
          )}
        </div>

        <div>
          {selectedModeId === "nexus-lab" && (
            <div style={{ display: "flex", gap: 8, marginBottom: 10, justifyContent: "center", alignItems: "center" }}>
              <span className="orb" style={{ fontSize: 9, color: "#7c3aed", letterSpacing: 2 }}>LAB SIZE</span>
              <select
                value={`${labSize.rows}x${labSize.cols}`}
                onChange={(e) => {
                  const [r, c] = e.target.value.split("x").map(Number);
                  setLabSize({ rows: r, cols: c });
                }}
                style={{ background: "#0a1028", color: "#b0bfee", border: "1px solid #1a2540", borderRadius: 4, padding: "6px 8px" }}
              >
                {["5x4", "6x7", "8x8", "10x10", "12x12", "15x15"].map(sz => <option key={sz} value={sz}>{sz}</option>)}
              </select>
            </div>
          )}
          <div style={{ display: "flex", gap: 6, marginBottom: 5 }}>
            {Array.from({ length: boardCols }, (_, c) => (
              <div key={c} style={{ width: 58, height: 16, display: "flex", justifyContent: "center", alignItems: "flex-end" }}>
                {hoverCol === c && turn === P && !gameOver && !board[0][c] && (
                  <div style={{ width: 12, height: 12, borderRadius: "50%", background: "rgba(0,229,255,.4)", border: "1px solid #00e5ff" }} />
                )}
              </div>
            ))}
          </div>
          <div style={{ background: "#060d20", borderRadius: 12, padding: 10, border: "1px solid #1a2a5a", boxShadow: "0 0 50px rgba(0,229,255,.07),0 20px 60px rgba(0,0,0,.6)" }}>
            {board.map((row, r) => (
              <div key={r} style={{ display: "flex", gap: 6 }}>
                {row.map((cell, c) => {
                  const isWin = winCells?.some(([wr, wc]) => wr === r && wc === c);
                  const isLast = lastDropped?.row === r && lastDropped?.col === c;
                  const maskedByFog = activeMods.includes("Fog of War") && cell === A;
                  const displayCell = activeMods.includes("Chameleon") && cell ? (turn === P ? A : P) : cell;
                  const visualCell = maskedByFog ? null : displayCell;
                  const cc = visualCell === P ? "#00e5ff" : visualCell === A ? "#bf00ff" : null;
                  const hover = hoverCol === c && turn === P && !gameOver && !board[0][c];
                  return (
                    <button key={c} className={`nb${isWin ? " win-anim" : ""}${isLast && cell ? " drop-anim" : ""}`}
                      onClick={() => handleDrop(c)} onMouseEnter={() => setHoverCol(c)} onMouseLeave={() => setHoverCol(null)}
                      style={{ width: 58, height: 58, borderRadius: "50%", background: visualCell ? cc : hover ? "rgba(0,229,255,.1)" : "#0c1530", boxShadow: isWin ? `0 0 24px ${cc},0 0 50px ${cc}` : visualCell ? `0 0 10px ${cc}55` : hover ? "0 0 14px rgba(0,229,255,.2)" : "none", transition: "box-shadow .18s,background .18s", position: "relative", overflow: "hidden", flexShrink: 0 }}>
                      {visualCell && <div style={{ position: "absolute", top: "20%", left: "18%", width: "55%", height: "28%", borderRadius: "50%", background: "rgba(255,255,255,.22)", transform: "rotate(-30deg)" }} />}
                      {!cell && <div style={{ position: "absolute", inset: 5, borderRadius: "50%", border: "1px solid #1a2a5a" }} />}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            {Array.from({ length: boardCols }, (_, c) => (
              <div key={c} style={{ width: 58, textAlign: "center" }}>
                <span className="orb" style={{ fontSize: 8, color: hoverCol === c ? "#00e5ff" : "#2a3a6a", letterSpacing: 1 }}>{c + 1}</span>
              </div>
            ))}
          </div>
        </div>

        {gameOver && (
          <div className="fade-up" style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-cyan" onClick={reset}>↺ REMATCH</button>
            <button className="btn btn-ghost">⌂ LOBBY</button>
          </div>
        )}
      </div>

      {/* RIGHT PANEL */}
      <div style={{ width: 192, borderLeft: "1px solid #0d1a3a", padding: 14, display: "flex", flexDirection: "column", gap: 14, background: "rgba(6,6,18,.7)", overflowY: "auto" }}>
        <SideCard label={matchMode === "local" ? (textSettings.opponentText || "PLAYER 2") : matchMode === "online" ? "FRIEND" : "NEXUS AI"} color="#bf00ff" avatar="◉" score={scores.ai} subtitle={matchMode === "local" ? "LOCAL" : difficulty.toUpperCase() + " MODE"} active={turn === A && !gameOver} thinking={thinking} />
        <div style={{ borderTop: "1px solid #0d1a3a", paddingTop: 12 }}>
          <div className="orb" style={{ fontSize: 8, letterSpacing: 3, color: "#4a5a8a", marginBottom: 8 }}>DIFFICULTY</div>
          {["easy", "medium", "hard"].map(d => (
            <button key={d} className="nb orb" style={{ width: "100%", padding: "7px 10px", fontSize: 9, fontWeight: 700, letterSpacing: 2, background: difficulty === d ? "rgba(191,0,255,.18)" : "rgba(10,20,50,.4)", border: `1px solid ${difficulty === d ? "#bf00ff" : "#1a2540"}`, color: difficulty === d ? "#bf00ff" : "#4a5a8a", borderRadius: 4, textAlign: "left", marginBottom: 4, transition: "all .2s" }} onClick={() => setDifficulty(d)}>
              {difficulty === d ? "▶ " : ""}{d.toUpperCase()}
            </button>
          ))}
          {modeConfig.turnMs && (
            <div style={{ marginTop: 8 }}>
              <div className="orb" style={{ fontSize: 8, letterSpacing: 2, color: "#ffd700" }}>TURN TIMER</div>
              <div style={{ fontSize: 12, color: "#ffd700", marginTop: 4 }}>
                {Math.ceil((turnTimeLeftMs || 0) / 1000)}s {activeMods.includes("Blitz Panic") ? "· Blitz auto-drop" : ""}
              </div>
            </div>
          )}
        </div>
        {activeMods.length > 0 && (
          <div style={{ borderTop: "1px solid #0d1a3a", paddingTop: 12 }}>
            <div className="orb" style={{ fontSize: 8, letterSpacing: 3, color: "#bf00ff", marginBottom: 8 }}>ACTIVE MODS ({activeMods.length})</div>
            {activeMods.map(m => (
              <div key={m} style={{ padding: "3px 8px", borderRadius: 3, background: "rgba(191,0,255,.1)", border: "1px solid #bf00ff44", marginBottom: 4, fontSize: 10, color: "#bf00ff" }}>{m}</div>
            ))}
          </div>
        )}
        <div style={{ borderTop: "1px solid #0d1a3a", paddingTop: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 10px", background: "rgba(10,20,50,.5)", borderRadius: 6 }}>
            <div style={{ textAlign: "center" }}><div className="orb" style={{ fontSize: 24, fontWeight: 900, color: "#00e5ff" }}>{scores.p}</div><div style={{ fontSize: 8, color: "#4a5a8a" }}>{matchMode === "local" ? "P1" : "YOU"}</div></div>
            <div className="orb" style={{ fontSize: 10, color: "#4a5a8a" }}>VS</div>
            <div style={{ textAlign: "center" }}><div className="orb" style={{ fontSize: 24, fontWeight: 900, color: "#bf00ff" }}>{scores.ai}</div><div style={{ fontSize: 8, color: "#4a5a8a" }}>{matchMode === "local" ? "P2" : matchMode === "online" ? "FRIEND" : "AI"}</div></div>
          </div>
        </div>
        <button className="btn btn-purple" style={{ fontSize: 9, padding: "8px" }} onClick={() => setShowModPanel(true)}>⚙ MUTATORS {activeMods.length > 0 ? `(${activeMods.length})` : ""}</button>

        {showModPanel && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={() => setShowModPanel(false)}>
            <div style={{ background: "#080818", border: "1px solid #bf00ff44", borderRadius: 12, padding: 28, maxWidth: 440, width: "90%" }} onClick={e => e.stopPropagation()}>
              <div className="orb" style={{ fontSize: 12, fontWeight: 700, letterSpacing: 3, color: "#bf00ff", marginBottom: 4 }}>MUTATOR SYSTEM</div>
              <p style={{ fontSize: 12, color: "#4a5a8a", marginBottom: 20 }}>Stack modifiers. New rules activate next game.</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {MODS_LIST.map(m => (
                  <button key={m} className="nb" style={{ padding: "9px 12px", background: activeMods.includes(m) ? "rgba(191,0,255,.18)" : "rgba(10,20,50,.5)", border: `1px solid ${activeMods.includes(m) ? "#bf00ff" : "#1a2540"}`, borderRadius: 6, color: activeMods.includes(m) ? "#bf00ff" : "#6070a0", fontSize: 11, fontWeight: 600, textAlign: "left", transition: "all .18s" }}
                    onClick={() => {
                      if (modeConfig.forcedMutators.includes(m)) return;
                      setActiveMods(p => p.includes(m) ? p.filter(x => x !== m) : [...p, m]);
                    }}>
                    {activeMods.includes(m) ? "✓ " : ""}{m}
                  </button>
                ))}
              </div>
              <button className="btn btn-cyan" style={{ width: "100%", marginTop: 18 }} onClick={() => setShowModPanel(false)}>APPLY & CLOSE</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══ SIDE CARD ════════════════════════════════════════════════
function SideCard({ label, color, avatar, score, subtitle, active, thinking }) {
  return (
    <div style={{ padding: "12px", background: "rgba(10,20,50,.4)", borderRadius: 8, border: `1px solid ${active ? color : "#1a2540"}`, transition: "border-color .3s", boxShadow: active ? `0 0 14px ${color}22` : "none" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: `${color}22`, border: `2px solid ${color}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, color, flexShrink: 0, boxShadow: active ? `0 0 14px ${color}55` : "none" }}>{avatar}</div>
        <div>
          <div className="orb" style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color }}>{label}</div>
          <div style={{ fontSize: 8, color: "#4a5a8a" }}>{subtitle}</div>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div><div className="orb" style={{ fontSize: 22, fontWeight: 900, color }}>{score}</div><div style={{ fontSize: 8, color: "#4a5a8a" }}>WINS</div></div>
        {active && <div style={{ padding: "3px 8px", background: `${color}22`, border: `1px solid ${color}55`, borderRadius: 3 }}><span className={`orb${thinking ? "" : " blink"}`} style={{ fontSize: 7, letterSpacing: 2, color }}>{thinking ? "COMPUTING" : "ACTIVE"}</span></div>}
      </div>
    </div>
  );
}

// ═══ RANKED PAGE ══════════════════════════════════════════════
function RankedPage({ user, profile, rank }) {
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user?.token) return;
    setLoading(true);
    supabase.getLeaderboard(user.token)
      .then(d => { if (Array.isArray(d)) setLeaderboard(d); })
      .catch(() => { })
      .finally(() => setLoading(false));
  }, [user]);

  const TIERS = [
    { rank: "NEXUS LEGEND", color: "#00fff5", icon: "◈", mmr: "5000+" },
    { rank: "GRANDMASTER", color: "#f59e0b", icon: "⬟", mmr: "3000+" },
    { rank: "MASTER", color: "#9333ea", icon: "⬡", mmr: "2000+" },
    { rank: "DIAMOND", color: "#60a5fa", icon: "◇", mmr: "1200+" },
    { rank: "PLATINUM", color: "#00e5ff", icon: "○", mmr: "700+" },
    { rank: "GOLD", color: "#ffd700", icon: "△", mmr: "350+" },
    { rank: "SILVER", color: "#a8a9ad", icon: "□", mmr: "150+" },
    { rank: "BRONZE", color: "#cd7f32", icon: "×", mmr: "0+" },
  ];

  return (
    <div style={{ padding: "32px 24px", maxWidth: 960, margin: "0 auto" }}>
      <div className="orb" style={{ fontSize: 9, letterSpacing: 4, color: "#00e5ff", marginBottom: 6 }}>COMPETITIVE</div>
      <h1 className="orb" style={{ fontSize: 30, fontWeight: 900, color: "#fff", marginBottom: 6 }}>RANKED MODE</h1>
      <p style={{ fontSize: 14, color: "#6070a0", marginBottom: 32 }}>Earn XP by playing. Every win, draw, and loss counts toward your rank.</p>

      {/* Current rank */}
      <div style={{ background: "rgba(0,229,255,.05)", border: "1px solid rgba(0,229,255,.2)", borderRadius: 12, padding: 24, marginBottom: 28, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ fontSize: 11, color: "#4a5a8a", marginBottom: 4 }}>{user ? "YOUR CURRENT RANK" : "LOG IN TO SEE YOUR RANK"}</div>
          {user && profile ? (
            <>
              <div className="orb" style={{ fontSize: 24, fontWeight: 900, color: rank?.color || "#00e5ff" }}>{rank?.tier || "BRONZE"}</div>
              <div style={{ fontSize: 13, color: "#6070a0", marginTop: 4 }}>{profile.xp || 0} XP · {profile.wins || 0}W / {profile.losses || 0}L / {profile.draws || 0}D</div>
            </>
          ) : (
            <>
              <div className="orb" style={{ fontSize: 24, fontWeight: 900, color: "#00e5ff" }}>—</div>
              <div style={{ fontSize: 13, color: "#6070a0", marginTop: 4 }}>Play matches to earn XP and climb the ranks.</div>
            </>
          )}
        </div>
        <button className="btn btn-cyan" style={{ fontSize: 12, padding: "13px 36px" }}>▶ FIND MATCH</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        {/* Division table */}
        <div>
          <div className="orb" style={{ fontSize: 9, letterSpacing: 3, color: "#4a5a8a", marginBottom: 12 }}>DIVISION BREAKDOWN</div>
          <div style={{ border: "1px solid #0d1a3a", borderRadius: 10, overflow: "hidden" }}>
            {TIERS.map((t, i) => (
              <div key={t.rank} style={{ display: "flex", alignItems: "center", padding: "12px 16px", borderBottom: i < TIERS.length - 1 ? "1px solid #0d1a3a" : "none", background: rank?.tier === t.rank ? `${t.color}0a` : i % 2 === 0 ? "rgba(10,16,40,.3)" : "transparent", gap: 12 }}>
                <div style={{ width: 26, height: 26, borderRadius: "50%", background: `${t.color}22`, border: `1px solid ${t.color}55`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: t.color, flexShrink: 0 }}>{t.icon}</div>
                <div style={{ flex: 1 }}><div className="orb" style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: t.color }}>{t.rank}</div></div>
                <div style={{ textAlign: "right", fontSize: 10, color: "#4a5a8a" }}>{t.mmr} XP</div>
                {rank?.tier === t.rank && <div className="tag" style={{ background: `${t.color}22`, color: t.color }}>YOU</div>}
              </div>
            ))}
          </div>
        </div>

        {/* Leaderboard */}
        <div>
          <div className="orb" style={{ fontSize: 9, letterSpacing: 3, color: "#4a5a8a", marginBottom: 12 }}>TOP PLAYERS</div>
          {!user ? (
            <div style={{ padding: 20, background: "rgba(10,16,40,.4)", border: "1px solid #0d1a3a", borderRadius: 10, fontSize: 12, color: "#4a5a8a" }}>Sign in to view the leaderboard.</div>
          ) : loading ? (
            <div style={{ display: "flex", gap: 10, alignItems: "center", padding: 20, color: "#4a5a8a" }}><span className="spinner" />Loading leaderboard...</div>
          ) : leaderboard.length === 0 ? (
            <div style={{ padding: 20, background: "rgba(10,16,40,.4)", border: "1px solid #0d1a3a", borderRadius: 10, fontSize: 12, color: "#4a5a8a" }}>No players yet. Be the first! Play some matches to appear here.</div>
          ) : (
            <div style={{ border: "1px solid #0d1a3a", borderRadius: 10, overflow: "hidden" }}>
              {leaderboard.map((p, i) => {
                const pr = getRankFromXP(p.xp || 0);
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", padding: "10px 14px", borderBottom: i < leaderboard.length - 1 ? "1px solid #0d1a3a" : "none", background: p.username === user.username ? "rgba(0,229,255,.05)" : i % 2 === 0 ? "rgba(10,16,40,.3)" : "transparent", gap: 10 }}>
                    <div className="orb" style={{ fontSize: 10, color: i < 3 ? "#ffd700" : "#4a5a8a", width: 20, textAlign: "center" }}>#{i + 1}</div>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: pr.color, flexShrink: 0 }} />
                    <div style={{ flex: 1, fontSize: 12, color: "#b0bfee", fontWeight: 600 }}>{p.username}</div>
                    <div className="orb" style={{ fontSize: 9, color: pr.color }}>{p.xp || 0} XP</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══ TOURNAMENTS PAGE ════════════════════════════════════════
function TournamentsPage() {
  const UPCOMING = [
    { name: "Season 1 Open", date: "Coming Soon", type: "SINGLE ELIM", size: "128", prize: "—", status: "registration" },
    { name: "Weekend Blitz Cup", date: "Coming Soon", type: "BLITZ MODE", size: "64", prize: "—", status: "registration" },
    { name: "Nexus Championship", date: "Coming Soon", type: "SWISS", size: "512", prize: "—", status: "soon" },
  ];
  return (
    <div style={{ padding: "32px 24px", maxWidth: 900, margin: "0 auto" }}>
      <div className="orb" style={{ fontSize: 9, letterSpacing: 4, color: "#ffd700", marginBottom: 6 }}>ESPORTS</div>
      <h1 className="orb" style={{ fontSize: 30, fontWeight: 900, color: "#fff", marginBottom: 6 }}>TOURNAMENTS</h1>
      <p style={{ fontSize: 14, color: "#6070a0", marginBottom: 32 }}>512-player brackets, Swiss system, double elimination. Live broadcasting coming in Season 2.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {UPCOMING.map((t, i) => (
          <div key={i} className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ width: 44, height: 44, borderRadius: 8, background: "rgba(255,215,0,.1)", border: "1px solid rgba(255,215,0,.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🏆</div>
              <div>
                <div className="orb" style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 3 }}>{t.name}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span className="tag" style={{ background: "rgba(0,229,255,.1)", color: "#00e5ff" }}>{t.type}</span>
                  <span className="tag" style={{ background: "rgba(255,215,0,.1)", color: "#ffd700" }}>{t.size} PLAYERS</span>
                  <span className="tag" style={{ background: t.status === "registration" ? "rgba(16,185,129,.1)" : "rgba(255,255,255,.05)", color: t.status === "registration" ? "#10b981" : "#4a5a8a" }}>
                    {t.status === "registration" ? "OPEN" : "COMING SOON"}
                  </span>
                </div>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: "#4a5a8a", marginBottom: 6 }}>Prize Pool: {t.prize}</div>
              <button className="btn btn-ghost" style={{ fontSize: 9, padding: "6px 16px" }}>VIEW BRACKET</button>
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 24, padding: "18px", background: "rgba(0,229,255,.04)", border: "1px solid rgba(0,229,255,.1)", borderRadius: 8, fontSize: 12, color: "#4a5a8a", lineHeight: 1.6 }}>
        Tournament scheduling, bracket generation, and live match data require Socket.IO + Supabase integration. Realtime multiplayer is on the Season 1 roadmap.
      </div>
    </div>
  );
}

// ═══ BATTLE PASS ══════════════════════════════════════════════
function BattlePassPage({ user, profile, sessionStats }) {
  // Use real profile XP if available, else session XP
  const xp = profile ? (profile.xp || 0) : ((sessionStats.wins * 120) + (sessionStats.draws * 40) + (sessionStats.losses * 20) + (sessionStats.moves * 2));
  const level = Math.floor(xp / 200) + 1;
  const levelXp = xp % 200;
  const pct = Math.min((levelXp / 200) * 100, 100);

  const REWARDS = [
    { lvl: 1, type: "board", name: "Neon Grid Board", icon: "◧", color: "#00e5ff", free: true },
    { lvl: 3, type: "token", name: "Cyan Disc Token", icon: "●", color: "#00e5ff", free: true },
    { lvl: 5, type: "effect", name: "Glow Trail FX", icon: "✦", color: "#bf00ff", free: false },
    { lvl: 8, type: "board", name: "Cyberpunk Board", icon: "◩", color: "#ffd700", free: false },
    { lvl: 12, type: "token", name: "Pizza Token Pack", icon: "🍕", color: "#f97316", free: true },
    { lvl: 15, type: "effect", name: "Lightning Strike FX", icon: "⚡", color: "#ffd700", free: false },
    { lvl: 20, type: "board", name: "Space Station Board", icon: "🚀", color: "#60a5fa", free: false },
    { lvl: 25, type: "title", name: "\"QUANTUM SURVIVOR\"", icon: "⚛", color: "#00fff5", free: false },
    { lvl: 30, type: "token", name: "Planet Token Pack", icon: "🪐", color: "#9333ea", free: false },
    { lvl: 50, type: "title", name: "\"NEXUS LEGEND\"", icon: "◈", color: "#ffd700", free: false },
  ];

  return (
    <div style={{ padding: "32px 24px", maxWidth: 900, margin: "0 auto" }}>
      <div className="orb" style={{ fontSize: 9, letterSpacing: 4, color: "#bf00ff", marginBottom: 6 }}>SEASON 1</div>
      <h1 className="orb" style={{ fontSize: 30, fontWeight: 900, color: "#fff", marginBottom: 4 }}>BATTLE PASS</h1>
      <p style={{ fontSize: 14, color: "#6070a0", marginBottom: 28 }}>Earn XP by playing. Every game counts — wins, losses, and draws all grant progress.</p>

      <div style={{ background: "rgba(10,16,40,.6)", border: "1px solid #1a2a5a", borderRadius: 12, padding: 22, marginBottom: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
          <div>
            <div className="orb" style={{ fontSize: 28, fontWeight: 900, color: "#fff" }}>LEVEL <span style={{ color: "#00e5ff" }}>{level}</span></div>
            <div style={{ fontSize: 12, color: "#4a5a8a" }}>
              {levelXp} / 200 XP to next level · {xp} total XP
              {user && profile ? " (synced)" : !user ? " (session only — sign in to save)" : ""}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="tag" style={{ background: "rgba(191,0,255,.1)", color: "#bf00ff" }}>FREE PASS</div>
            <div style={{ fontSize: 10, color: "#4a5a8a", marginTop: 4 }}>Season ends: TBD</div>
          </div>
        </div>
        <div className="xp-bar"><div className="xp-fill" style={{ width: `${pct}%` }} /></div>
        <div style={{ display: "flex", gap: 20, marginTop: 14, flexWrap: "wrap" }}>
          {[["Games", profile?.games_played ?? sessionStats.gamesPlayed], ["Wins", profile?.wins ?? sessionStats.wins], ["Streak", (profile?.best_streak ?? sessionStats.bestStreak) + "🔥"], ["Total XP", xp]].map(([l, v]) => (
            <div key={l}><div className="orb" style={{ fontSize: 16, fontWeight: 700, color: "#b0bfee" }}>{v}</div><div style={{ fontSize: 10, color: "#4a5a8a" }}>{l}</div></div>
          ))}
        </div>
      </div>

      <div className="orb" style={{ fontSize: 9, letterSpacing: 3, color: "#4a5a8a", marginBottom: 12 }}>REWARD TRACK</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 10 }}>
        {REWARDS.map(r => {
          const unlocked = level >= r.lvl;
          return (
            <div key={r.lvl} style={{ padding: "14px", background: unlocked ? "rgba(10,20,50,.7)" : "rgba(6,8,20,.5)", border: `1px solid ${unlocked ? r.color + "55" : "#1a2540"}`, borderRadius: 8, opacity: unlocked ? 1 : .6, position: "relative" }}>
              {unlocked && <div className="tag" style={{ position: "absolute", top: 8, right: 8, background: "rgba(16,185,129,.15)", color: "#10b981" }}>✓</div>}
              <div style={{ fontSize: 28, marginBottom: 8, color: r.color }}>{r.icon}</div>
              <div className="orb" style={{ fontSize: 9, letterSpacing: 2, color: r.color, marginBottom: 3 }}>LVL {r.lvl}</div>
              <div style={{ fontSize: 11, color: "#b0bfee", fontWeight: 600 }}>{r.name}</div>
              <div style={{ marginTop: 4 }}><span className="tag" style={{ background: r.free ? "rgba(16,185,129,.1)" : "rgba(191,0,255,.1)", color: r.free ? "#10b981" : "#bf00ff" }}>{r.free ? "FREE" : "PREMIUM"}</span></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══ STORE PAGE ═══════════════════════════════════════════════
function StorePage() {
  const [activeTab, setActiveTab] = useState("boards");
  const TABS = ["boards", "tokens", "effects", "sounds"];
  const COIN_PACKS = [
    { coins: 100, price: "$0.99" },
    { coins: 550, price: "$4.99" },
    { coins: 1200, price: "$9.99" },
    { coins: 2500, price: "$19.99" },
    { coins: 7000, price: "$49.99" }
  ];
  const ITEMS = {
    boards: [
      { name: "Cyberpunk Grid", icon: "◧", price: "FREE", color: "#00e5ff", owned: true },
      { name: "Space Station", icon: "🚀", price: "400 NC", color: "#60a5fa", owned: false },
      { name: "Lava World", icon: "🌋", price: "600 NC", color: "#ef4444", owned: false },
      { name: "Holographic Grid", icon: "◩", price: "800 NC", color: "#bf00ff", owned: false },
      { name: "Medieval Castle", icon: "🏰", price: "500 NC", color: "#ffd700", owned: false },
      { name: "Arcade Neon", icon: "🕹", price: "350 NC", color: "#f472b6", owned: false },
    ],
    tokens: [
      { name: "Classic Disc", icon: "●", price: "FREE", color: "#00e5ff", owned: true },
      { name: "Pizza Pack", icon: "🍕", price: "200 NC", color: "#f97316", owned: false },
      { name: "Planet Pack", icon: "🪐", price: "300 NC", color: "#9333ea", owned: false },
      { name: "Ninja Star", icon: "✦", price: "250 NC", color: "#ffd700", owned: false },
      { name: "Emoji Faces", icon: "😎", price: "150 NC", color: "#f472b6", owned: false },
      { name: "Crypto Coins", icon: "🪙", price: "200 NC", color: "#ffd700", owned: false },
    ],
    effects: [
      { name: "Glow Trail", icon: "✦", price: "300 NC", color: "#00e5ff", owned: false },
      { name: "Lightning Strike", icon: "⚡", price: "400 NC", color: "#ffd700", owned: false },
      { name: "Fire Trail", icon: "🔥", price: "350 NC", color: "#ef4444", owned: false },
      { name: "Confetti Burst", icon: "🎊", price: "200 NC", color: "#f472b6", owned: false },
    ],
    sounds: [
      { name: "Retro Arcade", icon: "🕹", price: "150 NC", color: "#ffd700", owned: false },
      { name: "Sci-Fi Pro", icon: "🛸", price: "200 NC", color: "#00e5ff", owned: false },
      { name: "Mechanical Keys", icon: "⌨", price: "150 NC", color: "#60a5fa", owned: false },
    ],
  };
  return (
    <div style={{ padding: "32px 24px", maxWidth: 900, margin: "0 auto" }}>
      <div className="orb" style={{ fontSize: 9, letterSpacing: 4, color: "#ffd700", marginBottom: 6 }}>COSMETICS</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
        <h1 className="orb" style={{ fontSize: 30, fontWeight: 900, color: "#fff" }}>STORE</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div className="orb" style={{ fontSize: 12, color: "#ffd700" }}>NC 0</div>
          <button className="btn btn-ghost" style={{ fontSize: 9, padding: "6px 14px" }}>+ BUY NEXUS COINS</button>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 24 }}>
        {TABS.map(t => (
          <button key={t} className={`btn${activeTab === t ? " btn-cyan" : " btn-ghost"}`} style={{ fontSize: 9, padding: "7px 16px", textTransform: "uppercase" }} onClick={() => setActiveTab(t)}>{t}</button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(155px,1fr))", gap: 12 }}>
        {(ITEMS[activeTab] || []).map((item, i) => (
          <div key={i} style={{ padding: "18px", background: "rgba(10,16,40,.6)", border: `1px solid ${item.owned ? "#00e5ff44" : "#1a2540"}`, borderRadius: 10, textAlign: "center", transition: "border-color .2s" }}
            onMouseEnter={e => !item.owned && (e.currentTarget.style.borderColor = item.color + "55")} onMouseLeave={e => !item.owned && (e.currentTarget.style.borderColor = "#1a2540")}>
            <div style={{ fontSize: 36, marginBottom: 12, color: item.color }}>{item.icon}</div>
            <div style={{ fontSize: 12, color: "#b0bfee", fontWeight: 600, marginBottom: 6 }}>{item.name}</div>
            {item.owned ? (
              <div className="tag" style={{ background: "rgba(16,185,129,.1)", color: "#10b981" }}>OWNED</div>
            ) : (
              <button className="btn" style={{ fontSize: 9, padding: "6px 12px", borderColor: item.color, color: item.color, background: `${item.color}11`, width: "100%", marginTop: 4 }}>{item.price}</button>
            )}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 24, borderTop: "1px solid #0d1a3a", paddingTop: 16 }}>
        <div className="orb" style={{ fontSize: 9, letterSpacing: 3, color: "#10b981", marginBottom: 10 }}>DONATE / BUY COINS</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10 }}>
          {COIN_PACKS.map((pack) => (
            <div key={pack.coins} style={{ padding: 12, border: "1px solid #1a2540", borderRadius: 8, background: "rgba(10,16,40,.45)" }}>
              <div className="orb" style={{ fontSize: 15, color: "#ffd700", marginBottom: 4 }}>{pack.coins} NC</div>
              <div style={{ fontSize: 12, color: "#b0bfee", marginBottom: 8 }}>{pack.price}</div>
              <button className="btn btn-green" style={{ width: "100%", fontSize: 9, padding: "7px 8px" }}>BUY</button>
            </div>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 20, fontSize: 12, color: "#4a5a8a" }}>All cosmetics are visual only — no gameplay advantage. Purchases require Stripe integration.</div>
    </div>
  );
}

// ═══ SETTINGS PAGE ════════════════════════════════════════════
function SettingsPage({ themeId, setThemeId, theme, textSettings, setTextSettings }) {
  const [customBg, setCustomBg] = useState(() => localStorage.getItem("nx_custom_bg") || "");

  useEffect(() => {
    if (!customBg) {
      document.body.style.backgroundImage = "";
      localStorage.removeItem("nx_custom_bg");
      return;
    }
    const gradient = `radial-gradient(ellipse at top, ${customBg}33 0%, transparent 65%)`;
    document.body.style.backgroundImage = gradient;
    localStorage.setItem("nx_custom_bg", customBg);
  }, [customBg]);

  return (
    <div style={{ padding: "32px 24px", maxWidth: 900, margin: "0 auto" }}>
      <div className="orb" style={{ fontSize: 9, letterSpacing: 4, color: "#00e5ff", marginBottom: 6 }}>VISUALS</div>
      <h1 className="orb" style={{ fontSize: 30, fontWeight: 900, color: "#fff", marginBottom: 6 }}>SETTINGS</h1>
      <p style={{ fontSize: 14, color: "#6070a0", marginBottom: 26 }}>Change theme, background accent and overall look of the platform.</p>

      <div className="card" style={{ marginBottom: 18, background: theme.panelBg }}>
        <div className="orb" style={{ fontSize: 10, letterSpacing: 2, color: "#4a5a8a", marginBottom: 12 }}>THEME PRESETS</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10 }}>
          {Object.values(THEME_PRESETS).map((preset) => (
            <button
              key={preset.id}
              className="nb"
              onClick={() => setThemeId(preset.id)}
              style={{
                padding: 12,
                borderRadius: 8,
                border: `1px solid ${themeId === preset.id ? "#00e5ff" : "#1a2540"}`,
                background: preset.panelBg
              }}
            >
              <div className="orb" style={{ fontSize: 10, letterSpacing: 2, color: themeId === preset.id ? "#00e5ff" : "#b0bfee" }}>{preset.name}</div>
              <div style={{ marginTop: 8, height: 34, borderRadius: 6, background: preset.appBg, border: "1px solid #1a2540" }} />
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ background: theme.panelBg }}>
        <div className="orb" style={{ fontSize: 10, letterSpacing: 2, color: "#4a5a8a", marginBottom: 10 }}>CUSTOM BACKGROUND ACCENT</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <input type="color" value={customBg || "#00e5ff"} onChange={(e) => setCustomBg(e.target.value)} style={{ width: 50, height: 38, padding: 4 }} />
          <button className="btn btn-ghost" style={{ fontSize: 9, padding: "7px 12px" }} onClick={() => setCustomBg("")}>RESET ACCENT</button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 18, background: theme.panelBg }}>
        <div className="orb" style={{ fontSize: 10, letterSpacing: 2, color: "#4a5a8a", marginBottom: 12 }}>TEXT SETTINGS</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, color: "#8090c0" }}>Font Scale: {textSettings.fontScale || 100}%</label>
            <input
              type="range"
              min="85"
              max="130"
              value={textSettings.fontScale || 100}
              onChange={(e) => setTextSettings((prev) => ({ ...prev, fontScale: Number(e.target.value) }))}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "#8090c0" }}>Font Style</label>
            <select
              value={textSettings.fontFamily || "rajdhani"}
              onChange={(e) => setTextSettings((prev) => ({ ...prev, fontFamily: e.target.value }))}
              style={{ width: "100%", background: "#0a1028", color: "#b0bfee", border: "1px solid #1a2540", borderRadius: 6, padding: "8px 10px" }}
            >
              <option value="rajdhani">Rajdhani (default)</option>
              <option value="orbitron">Orbitron (futuristic)</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, color: "#8090c0" }}>Local Player 1 Text</label>
            <input value={textSettings.playerText || ""} onChange={(e) => setTextSettings((prev) => ({ ...prev, playerText: e.target.value }))} placeholder="PLAYER 1" />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "#8090c0" }}>Local Player 2 Text</label>
            <input value={textSettings.opponentText || ""} onChange={(e) => setTextSettings((prev) => ({ ...prev, opponentText: e.target.value }))} placeholder="PLAYER 2" />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "#8090c0" }}>Main CTA Text</label>
            <input value={textSettings.playNowText || ""} onChange={(e) => setTextSettings((prev) => ({ ...prev, playNowText: e.target.value }))} placeholder="PLAY NOW" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══ DASHBOARD PAGE ═══════════════════════════════════════════
function DashboardPage({ user, profile, sessionStats, scores, rank, onNav }) {
  const [matches, setMatches] = useState([]);
  const [loadingMatches, setLoadingMatches] = useState(false);

  useEffect(() => {
    if (!user?.token) return;
    setLoadingMatches(true);
    supabase.getMatches(user.token, user.id)
      .then(d => { if (Array.isArray(d)) setMatches(d); })
      .catch(() => { })
      .finally(() => setLoadingMatches(false));
  }, [user]);

  const wins = profile?.wins ?? sessionStats.wins;
  const losses = profile?.losses ?? sessionStats.losses;
  const draws = profile?.draws ?? sessionStats.draws;
  const gamesPlayed = profile?.games_played ?? sessionStats.gamesPlayed;
  const bestStreak = profile?.best_streak ?? sessionStats.bestStreak;
  const xp = profile?.xp ?? ((sessionStats.wins * 120) + (sessionStats.draws * 40) + (sessionStats.losses * 20) + (sessionStats.moves * 2));
  const level = Math.floor(xp / 200) + 1;
  const pct = Math.min(((xp % 200) / 200) * 100, 100);
  const wr = gamesPlayed > 0 ? Math.round((wins / gamesPlayed) * 100) : 0;

  const ACHIEVEMENTS = [
    { name: "First Blood", desc: "Win your first match", done: wins >= 1, icon: "⚔" },
    { name: "On a Roll", desc: "Win 3 games in a row", done: bestStreak >= 3, icon: "🔥" },
    { name: "Century", desc: "Make 100 total moves", done: (profile?.moves_total ?? sessionStats.moves) >= 100, icon: "💯" },
    { name: "Grinder", desc: "Play 10 games", done: gamesPlayed >= 10, icon: "⚙" },
    { name: "Comeback Kid", desc: "Win after losing 3 in a row", done: false, icon: "↩" },
    { name: "Quantum Master", desc: "Activate Quantum Drop modifier", done: false, icon: "⚛" },
  ];

  const QUESTS = [
    { name: "Play 3 games today", xp: 60, progress: Math.min(gamesPlayed, 3), max: 3 },
    { name: "Win a match vs AI Hard", xp: 100, progress: 0, max: 1 },
    { name: "Make 50 moves", xp: 40, progress: Math.min(profile?.moves_total ?? sessionStats.moves, 50), max: 50 },
  ];

  return (
    <div style={{ padding: "32px 24px", maxWidth: 960, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 32, flexWrap: "wrap" }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", border: `2px solid ${rank?.color || "#00e5ff"}`, background: "#0a1428", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, color: rank?.color || "#00e5ff", boxShadow: `0 0 20px ${rank?.color || "#00e5ff"}44` }}>◈</div>
        <div>
          <div className="orb" style={{ fontSize: 22, fontWeight: 900, color: "#fff" }}>{user?.username || "NEXUS_PLAYER"}</div>
          <div style={{ fontSize: 12, color: "#4a5a8a" }}>{user?.email || "Guest session · Stats not saved"}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            {rank && <span className="tag" style={{ background: `${rank.color}22`, color: rank.color }}>{rank.tier}</span>}
            <span className="tag" style={{ background: "rgba(0,229,255,.1)", color: "#00e5ff" }}>LEVEL {level}</span>
            <span className="tag" style={{ background: "rgba(16,185,129,.1)", color: "#10b981" }}>{wr}% WIN RATE</span>
          </div>
        </div>
        {!user && <button className="btn btn-cyan" style={{ marginLeft: "auto", fontSize: 10 }} onClick={() => onNav && onNav("landing")}>↗ SIGN IN TO SAVE STATS</button>}
      </div>

      {/* Stats grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 10, marginBottom: 28 }}>
        {[["Wins", wins, "#00e5ff"], ["Losses", losses, "#ef4444"], ["Draws", draws, "#ffd700"], ["Win Rate", wr + "%", "#10b981"], ["Best Streak", bestStreak + "🔥", "#f97316"], ["Total XP", xp, "#bf00ff"]].map(([l, v, c]) => (
          <div key={l} style={{ padding: "14px 12px", background: "rgba(10,16,40,.5)", border: "1px solid #1a2540", borderRadius: 8, textAlign: "center" }}>
            <div className="orb" style={{ fontSize: 20, fontWeight: 900, color: c }}>{v}</div>
            <div style={{ fontSize: 9, color: "#4a5a8a", marginTop: 3 }}>{l}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24, flexWrap: "wrap" }}>
        {/* XP Progress */}
        <div className="card">
          <div className="orb" style={{ fontSize: 9, letterSpacing: 3, color: "#bf00ff", marginBottom: 12 }}>XP PROGRESS — SEASON 1</div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <div className="orb" style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>Level {level}</div>
            <div style={{ fontSize: 11, color: "#4a5a8a" }}>{xp % 200} / 200 XP</div>
          </div>
          <div className="xp-bar"><div className="xp-fill" style={{ width: `${pct}%` }} /></div>
          <div style={{ fontSize: 11, color: "#4a5a8a", marginTop: 8 }}>Next level: {200 - (xp % 200)} XP needed</div>
        </div>

        {/* Daily Quests */}
        <div className="card">
          <div className="orb" style={{ fontSize: 9, letterSpacing: 3, color: "#ffd700", marginBottom: 12 }}>DAILY QUESTS</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {QUESTS.map((q, i) => (
              <div key={i}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: "#b0bfee" }}>{q.name}</span>
                  <span className="orb" style={{ fontSize: 9, color: "#ffd700" }}>+{q.xp} XP</span>
                </div>
                <div className="xp-bar">
                  <div style={{ height: "100%", width: `${Math.min((q.progress / q.max) * 100, 100)}%`, background: "linear-gradient(90deg,#ffd700,#f97316)", borderRadius: 3, transition: "width .5s" }} />
                </div>
                <div style={{ fontSize: 9, color: "#4a5a8a", marginTop: 2 }}>{q.progress}/{q.max}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Match History */}
      <div className="orb" style={{ fontSize: 9, letterSpacing: 3, color: "#4a5a8a", marginBottom: 12 }}>MATCH HISTORY</div>
      {!user ? (
        <div style={{ padding: "16px", background: "rgba(10,16,40,.4)", border: "1px solid #0d1a3a", borderRadius: 8, fontSize: 12, color: "#4a5a8a" }}>Sign in to view your match history.</div>
      ) : loadingMatches ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 16, color: "#4a5a8a" }}><span className="spinner" />Loading matches...</div>
      ) : matches.length === 0 ? (
        <div style={{ padding: "16px", background: "rgba(10,16,40,.4)", border: "1px solid #0d1a3a", borderRadius: 8, fontSize: 12, color: "#4a5a8a" }}>No matches recorded yet. Play a game to see your history here.</div>
      ) : (
        <div style={{ border: "1px solid #0d1a3a", borderRadius: 10, overflow: "hidden", marginBottom: 24 }}>
          {matches.slice(0, 10).map((m, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", padding: "10px 16px", borderBottom: i < Math.min(matches.length, 10) - 1 ? "1px solid #0d1a3a" : "none", background: i % 2 === 0 ? "rgba(10,16,40,.3)" : "transparent", gap: 12 }}>
              <div style={{ width: 36, textAlign: "center" }}>
                <span className="tag" style={{ background: m.result === 'win' ? "rgba(0,229,255,.1)" : m.result === 'draw' ? "rgba(255,215,0,.1)" : "rgba(239,68,68,.1)", color: m.result === 'win' ? "#00e5ff" : m.result === 'draw' ? "#ffd700" : "#ef4444" }}>
                  {m.result?.toUpperCase()}
                </span>
              </div>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 12, color: "#b0bfee" }}>vs NEXUS AI</span>
                <span className="tag" style={{ marginLeft: 8, background: "rgba(191,0,255,.1)", color: "#bf00ff" }}>{m.difficulty?.toUpperCase()}</span>
              </div>
              <div style={{ fontSize: 11, color: "#4a5a8a" }}>{m.moves} moves</div>
              <div style={{ fontSize: 10, color: "#2a3a5a" }}>{new Date(m.created_at).toLocaleDateString()}</div>
            </div>
          ))}
        </div>
      )}

      {/* Achievements */}
      <div className="orb" style={{ fontSize: 9, letterSpacing: 3, color: "#4a5a8a", marginBottom: 12 }}>ACHIEVEMENTS</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 10 }}>
        {ACHIEVEMENTS.map((a, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "rgba(10,16,40,.5)", border: `1px solid ${a.done ? "rgba(16,185,129,.4)" : "#1a2540"}`, borderRadius: 8, opacity: a.done ? 1 : .55 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: a.done ? "rgba(16,185,129,.15)" : "rgba(255,255,255,.04)", border: `1px solid ${a.done ? "rgba(16,185,129,.4)" : "#1a2540"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{a.icon}</div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: a.done ? "#10b981" : "#b0bfee" }}>{a.name}</div>
              <div style={{ fontSize: 10, color: "#4a5a8a" }}>{a.desc}</div>
            </div>
            {a.done && <div style={{ marginLeft: "auto", fontSize: 16 }}>✓</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
