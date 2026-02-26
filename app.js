/* ═══════════════════════════════════════
   STREAMIX — App JS
   ═══════════════════════════════════════ */

let library = [];
let currentSeries = null;
let currentSeason = 0;
let currentEpisodeIndex = 0;
let heroIndex = 0;
let heroTimer = null;
let searchTimer = null;

const PROGRESS_KEY = 'smx_progress';

function buildPlayableUrl(file) {
  const rel = String(file || '').replace(/^\/videos\//, '');
  return `/api/video?file=${encodeURIComponent(rel)}`;
}

function toVideoRel(file) {
  return String(file || '').replace(/^\/videos\//, '');
}

function buildInternalSubtitleUrl(file, streamIndex) {
  return `/api/subtitle-track?file=${encodeURIComponent(toVideoRel(file))}&stream=${encodeURIComponent(streamIndex)}`;
}

async function fetchInternalSubtitleSources(file) {
  const url = `/api/subtracks?file=${encodeURIComponent(toVideoRel(file))}`;
  const json = await fetch(url).then(r => r.ok ? r.json() : { tracks: [] }).catch(() => ({ tracks: [] }));
  const tracks = Array.isArray(json.tracks) ? json.tracks : [];
  return tracks.map(t => ({
    label: t.label || `Legenda ${t.order ?? ''}`.trim(),
    lang: t.lang || 'und',
    url: buildInternalSubtitleUrl(file, t.streamIndex),
  }));
}

// ── INIT ───────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  await loadLibrary();
  hideLoader();
  setupNavScroll();
  handleHash();
  window.addEventListener('hashchange', handleHash);
  document.addEventListener('fullscreenchange', subApplyDisplayMode);
  document.getElementById('mainPlayer').addEventListener('ended', () => {
    if (getGlobalEpIndex() < getAllEpisodes().length - 1) setTimeout(nextEpisode, 2000);
  });
});

async function loadLibrary(query = '') {
  try {
    const url = query ? `/api/library?q=${encodeURIComponent(query)}` : '/api/library';
    library = await fetch(url).then(r => r.json());
  } catch { library = []; }
}

function hideLoader() {
  setTimeout(() => document.getElementById('loader').classList.add('hidden'), 600);
}

function setupNavScroll() {
  const nav = document.getElementById('navbar');
  window.addEventListener('scroll', () => nav.classList.toggle('scrolled', window.scrollY > 20));
  nav.classList.add('scrolled');
}

// ── ROUTING ────────────────────────────
function handleHash() {
  const hash = decodeURIComponent(window.location.hash);
  if (!hash || hash === '#') return showHome();
  if (hash.startsWith('#series/')) {
    const parts = hash.slice(8).split('/');
    return showSeries(parts[0], parseInt(parts[2]) || null);
  }
  if (hash.startsWith('#watch/')) {
    const parts = hash.slice(7).split('/');
    return playEpisode(parts[0], parseInt(parts[1]), parseInt(parts[2]));
  }
  showHome();
}

function goHome() { window.location.hash = ''; }

// ── HOME ───────────────────────────────
async function showHome(query = '') {
  await loadLibrary(query);
  showView('home');
  renderGrid();
  setupHero();
  window.scrollTo(0, 0);
}

function renderGrid() {
  const grid = document.getElementById('seriesGrid');
  const empty = document.getElementById('emptyState');
  const q = document.getElementById('searchInput').value;
  document.getElementById('sectionTitle').textContent = q ? `Resultados para "${q}"` : 'Todas as Séries';
  document.getElementById('sectionCount').textContent = library.length + ' série' + (library.length !== 1 ? 's' : '');
  if (!library.length) { grid.style.display = 'none'; empty.style.display = 'block'; return; }
  grid.style.display = 'grid'; empty.style.display = 'none';
  const prog = JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}');
  grid.innerHTML = library.map((s, i) => {
    const totalEps = s.seasons.reduce((a, ss) => a + ss.episodes.length, 0);
    const watched = s.seasons.flatMap(ss => ss.episodes).filter(ep => (prog[ep.file]?.pct || 0) > 90).length;
    const pct = totalEps ? Math.round((watched / totalEps) * 100) : 0;
    const thumb = s.thumbnail
      ? `<img src="${s.thumbnail}" alt="${s.name}" loading="lazy" />`
      : `<div class="card-placeholder">🎬<span>${s.name.slice(0,2).toUpperCase()}</span></div>`;
    return `<div class="card" onclick="window.location.hash='series/${s.id}'" style="animation-delay:${i*40}ms">
      <div class="card-thumb">${thumb}<div class="card-overlay"><div class="card-play-btn">▶</div></div>
        ${pct > 0 ? `<div class="card-progress"><div class="card-progress-fill" style="width:${pct}%"></div></div>` : ''}
      </div>
      <div class="card-info"><div class="card-title">${s.name}</div>
        <div class="card-sub"><span class="card-badge">${s.seasons.length} temp.</span><span class="card-ep-count">${totalEps} ep.</span></div>
      </div></div>`;
  }).join('');
}

// ── HERO ───────────────────────────────
function setupHero() {
  clearInterval(heroTimer);
  if (!library.length) return;
  renderHero(heroIndex % library.length);
  heroTimer = setInterval(() => { heroIndex = (heroIndex + 1) % library.length; renderHero(heroIndex); }, 7000);
}
let heroData = null;
function renderHero(idx) {
  const s = library[idx]; if (!s) return;
  heroData = s;
  document.getElementById('heroBg').style.backgroundImage = s.thumbnail ? `url(${s.thumbnail})` : 'linear-gradient(135deg,#1a0a20,#0a1a20)';
  document.getElementById('heroTitle').textContent = s.name;
  const t = s.seasons.reduce((a, ss) => a + ss.episodes.length, 0);
  document.getElementById('heroDesc').textContent = `${s.seasons.length} temporada${s.seasons.length > 1 ? 's' : ''} · ${t} episódio${t > 1 ? 's' : ''}`;
}
function heroPlay() { if (heroData) window.location.hash = `series/${heroData.id}`; }

// ── SERIES ─────────────────────────────
async function showSeries(id, forceSeason = null) {
  clearInterval(heroTimer);
  const res = await fetch(`/api/series/${encodeURIComponent(id)}`);
  if (!res.ok) return goHome();
  currentSeries = await res.json();
  currentSeason = forceSeason !== null ? Math.max(0, currentSeries.seasons.findIndex(s => s.number === forceSeason)) : 0;
  showView('series');
  document.getElementById('seriesTitle').textContent = currentSeries.name;
  const t = currentSeries.seasons.reduce((a, s) => a + s.episodes.length, 0);
  document.getElementById('seriesMeta').innerHTML = `<span>${currentSeries.seasons.length} temporada${currentSeries.seasons.length !== 1 ? 's' : ''}</span><span>${t} episódios</span>`;
  document.getElementById('seriesHeroBg').style.backgroundImage = currentSeries.thumbnail ? `url(${currentSeries.thumbnail})` : 'linear-gradient(135deg,#1a0520,#050a1a)';
  renderSeasonTabs(); renderEpisodes(); window.scrollTo(0, 0);
}

function renderSeasonTabs() {
  document.getElementById('seasonTabs').innerHTML = currentSeries.seasons.map((s, i) =>
    `<button class="season-tab ${i === currentSeason ? 'active' : ''}" onclick="switchSeason(${i})">${s.label}</button>`
  ).join('');
}
function switchSeason(idx) {
  currentSeason = idx;
  window.location.hash = `series/${currentSeries.id}/${currentSeries.seasons[idx].number}`;
  renderSeasonTabs(); renderEpisodes();
}
function renderEpisodes() {
  const grid = document.getElementById('episodesGrid');
  const season = currentSeries.seasons[currentSeason];
  if (!season) { grid.innerHTML = ''; return; }
  const prog = JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}');
  grid.innerHTML = season.episodes.map((ep, i) => {
    const pct = prog[ep.file]?.pct || 0;
    const isWatched = pct > 90;
    const hasSubs = ep.subtitles && ep.subtitles.length > 0;
    const thumb = ep.thumbnail
      ? `<img src="${ep.thumbnail}" alt="${ep.title}" loading="lazy" />`
      : `<div class="card-placeholder">▶<span>EP ${ep.episode.toString().padStart(2,'0')}</span></div>`;
    return `<div class="card" onclick="window.location.hash='watch/${currentSeries.id}/${season.number}/${i}'" style="animation-delay:${i*30}ms">
      <div class="card-thumb">${thumb}<div class="card-overlay"><div class="card-play-btn">▶</div></div>
        ${pct > 0 && !isWatched ? `<div class="card-progress"><div class="card-progress-fill" style="width:${pct}%"></div></div>` : ''}
      </div>
      <div class="card-info"><div class="card-title">${ep.title}</div>
        <div class="card-sub">
          <span class="card-badge">EP ${ep.episode.toString().padStart(2,'0')}</span>
          ${isWatched ? '<span style="color:#4ade80">✓</span>' : ''}
          ${hasSubs ? '<span title="Legendas disponíveis" style="color:#60a5fa">CC</span>' : ''}
        </div>
      </div></div>`;
  }).join('');
}

// ── PLAYER ─────────────────────────────
function playEpisode(seriesId, seasonNum, epIndex) {
  if (!currentSeries || currentSeries.id !== seriesId) {
    fetch(`/api/series/${encodeURIComponent(seriesId)}`).then(r => r.json()).then(s => {
      currentSeries = s;
      currentSeason = Math.max(0, s.seasons.findIndex(ss => ss.number === seasonNum));
      currentEpisodeIndex = epIndex;
      doPlayEpisode();
    });
    return;
  }
  currentSeason = Math.max(0, currentSeries.seasons.findIndex(ss => ss.number === seasonNum));
  currentEpisodeIndex = epIndex;
  doPlayEpisode();
}

function doPlayEpisode() {
  const season = currentSeries.seasons[currentSeason];
  if (!season) return;
  const ep = season.episodes[currentEpisodeIndex];
  if (!ep) return;

  showView('player');
  subStop(); // para loop de legenda anterior

  const video = document.getElementById('mainPlayer');
  video.removeEventListener('timeupdate', saveProgress);
  video.src = buildPlayableUrl(ep.file);

  document.getElementById('playerSeries').textContent = currentSeries.name;
  document.getElementById('playerEp').textContent = `${season.label} · Episódio ${ep.episode}`;
  document.getElementById('playerTitle').textContent = ep.title;
  document.getElementById('playerSub').textContent = `${currentSeries.name} — ${season.label}`;
  document.title = `${ep.title} — STREAMIX`;

  document.getElementById('playerBack').onclick = () => {
    subStop();
    window.location.hash = `series/${currentSeries.id}/${season.number}`;
  };

  const gi = getGlobalEpIndex();
  const all = getAllEpisodes();
  document.getElementById('btnPrevEp').disabled = gi <= 0;
  document.getElementById('btnNextEp').disabled = gi >= all.length - 1;

  const saved = JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}')[ep.file];
  if (saved && saved.pct < 95)
    video.addEventListener('loadedmetadata', () => { video.currentTime = saved.time; }, { once: true });

  video.addEventListener('timeupdate', saveProgress);

  // Inicializa legendas
  subInit(ep);

  renderUpNext();
  video.play().catch(() => {});
  window.scrollTo(0, 0);
}

// ══════════════════════════════════════
// SISTEMA DE LEGENDAS
// ══════════════════════════════════════
let _subCues  = [];
let _subIdx   = -1;
let _subSrcs  = [];
let _subRAF   = null;
let _subLast  = null;
let _subUseNative = false;
let _subToken = 0;      // incrementa a cada episódio — evita race conditions
const _subCache = {};   // cache global: url → cues[]

function subMountNativeTracks() {
  const video = document.getElementById('mainPlayer');
  video.querySelectorAll('track[data-smx-sub="1"]').forEach(t => t.remove());
  _subSrcs.forEach((s, i) => {
    const tr = document.createElement('track');
    tr.kind = 'subtitles';
    tr.label = s.label || ('Legenda ' + (i + 1));
    tr.srclang = (s.lang || 'pt').slice(0, 2);
    tr.src = s.url;
    tr.default = i === 0;
    tr.dataset.smxSub = '1';
    video.appendChild(tr);
  });
}

function subSelectNative(idx) {
  const video = document.getElementById('mainPlayer');
  const tracks = Array.from(video.textTracks || []);
  const mine = tracks.slice(0, _subSrcs.length);
  if (!mine.length) return false;
  mine.forEach(t => { t.mode = 'disabled'; });
  if (idx >= 0 && mine[idx]) mine[idx].mode = 'showing';
  _subUseNative = true;
  return true;
}

function isPlayerFullscreen() {
  const fs = document.fullscreenElement || document.webkitFullscreenElement;
  if (!fs) return false;
  const video = document.getElementById('mainPlayer');
  const wrapper = video.closest('.video-wrapper');
  return fs === video || fs === wrapper;
}

function subDisableNativeTracks() {
  const video = document.getElementById('mainPlayer');
  Array.from(video.textTracks || []).forEach(t => { t.mode = 'disabled'; });
}

function subApplyDisplayMode() {
  const overlay = document.getElementById('subOverlay');
  if (!overlay) return;

  if (_subIdx < 0) {
    _subUseNative = false;
    subDisableNativeTracks();
    overlay.style.display = '';
    return;
  }

  if (isPlayerFullscreen() && subSelectNative(_subIdx)) {
    overlay.style.display = 'none';
    return;
  }

  _subUseNative = false;
  subDisableNativeTracks();
  overlay.style.display = '';
}

function subRenderButtons() {
  const btns = document.getElementById('subBtns');
  btns.innerHTML =
    '<button class="sub-btn" data-idx="-1" onclick="subSelect(-1)">Desativada</button>' +
    _subSrcs.map((s, i) =>
      `<button class="sub-btn" data-idx="${i}" onclick="subSelect(${i})">${s.label}</button>`
    ).join('');
}
function subInit(ep) {
  subStop();
  _subToken++;
  _subCues = []; _subIdx = -1; _subSrcs = []; _subLast = null; _subUseNative = false;

  const bar     = document.getElementById('subBar');
  const btns    = document.getElementById('subBtns');
  const overlay = document.getElementById('subOverlay');
  overlay.textContent = '';
  bar.style.display = 'none';
  btns.innerHTML = '';

  const external = Array.isArray(ep.subtitles) ? ep.subtitles : [];
  _subSrcs = external.map(s => ({
    label: s.label || s.lang || 'Legenda',
    lang: s.lang || 'pt',
    url: s.ext === 'srt'
      ? `/api/srt2vtt?file=${encodeURIComponent(s.file.replace(/^\/videos\//, ''))}`
      : s.file,
  }));

  if (_subSrcs.length) {
    bar.style.display = 'flex';
    subRenderButtons();
    subMountNativeTracks();
    subStartLoop();
    subSelect(0);
  }

  const token = _subToken;
  fetchInternalSubtitleSources(ep.file).then((internal) => {
    if (token !== _subToken) return;
    if (!internal.length) return;
    const hadAny = _subSrcs.length > 0;
    _subSrcs = _subSrcs.concat(internal);
    bar.style.display = 'flex';
    subRenderButtons();
    subMountNativeTracks();
    if (!_subRAF) subStartLoop();
    if (!hadAny || _subIdx < 0) subSelect(0);
    else subApplyDisplayMode();
  }).catch(() => {});
}

async function subFetch(idx, token) {
  if (idx < 0 || !_subSrcs[idx]) return;
  const src = _subSrcs[idx];

  if (!_subCache[src.url]) {
    try {
      const res = await fetch(src.url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const raw = await res.text();
      _subCache[src.url] = subParse(raw);
      console.log('[SUB]', _subCache[src.url].length, 'cues –', src.label);
    } catch(e) {
      console.error('[SUB] Erro:', e.message, src.url);
      return;
    }
  }

  // Só aplica se ainda é o mesmo episódio e mesma legenda selecionada
  if (token === _subToken && _subIdx === idx) {
    _subCues = _subCache[src.url];
  }
}

function subSelect(idx) {
  _subCues = []; _subLast = null;
  const overlay = document.getElementById('subOverlay');
  overlay.textContent = '';
  document.querySelectorAll('#subBtns .sub-btn').forEach(b =>
    b.classList.toggle('active', parseInt(b.dataset.idx) === idx)
  );

  if (idx < 0) {
    _subIdx = -1;
    subApplyDisplayMode();
    return;
  }
  _subIdx = idx;
  subApplyDisplayMode();
  if (_subUseNative) return;

  const src = _subSrcs[idx];
  if (!src) return;

  if (_subCache[src.url]) {
    _subCues = _subCache[src.url];
  } else {
    subFetch(idx, _subToken);
  }
}


function subParse(text) {
  // Normaliza: BOM, CRLF, espaços
  text = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // Remove cabeçalho VTT e blocos NOTE/STYLE
  text = text.replace(/^WEBVTT[^\n]*\n*/m, '').replace(/^NOTE[\s\S]*?(?=\n\n|$)/gm, '');

  const cues = [];
  for (const block of text.split(/\n[ \t]*\n+/)) {
    const lines = block.trim().split('\n').map(l => l.trim()).filter(l => l);
    if (lines.length < 2) continue;
    // Acha a linha de timestamp (pode ter número antes)
    let timeLine = '', textStart = 0;
    for (let i = 0; i < Math.min(lines.length, 3); i++) {
      if (lines[i].includes('-->')) { timeLine = lines[i]; textStart = i + 1; break; }
    }
    if (!timeLine) continue;
    // Aceita VTT em HH:MM:SS.mmm ou MM:SS.mmm
    const m = timeLine.match(/((?:\d+:)?\d{2}:\d{2}[,.]\d+)\s*-->\s*((?:\d+:)?\d{2}:\d{2}[,.]\d+)/);
    if (!m) continue;
    const toS = (ts) => {
      const parts = ts.replace(',', '.').split(':');
      if (parts.length === 3) {
        const [h, mn, secMs] = parts;
        const [s, ms = '0'] = secMs.split('.');
        return (+h * 3600) + (+mn * 60) + (+s) + (+ms / 1000);
      }
      if (parts.length === 2) {
        const [mn, secMs] = parts;
        const [s, ms = '0'] = secMs.split('.');
        return (+mn * 60) + (+s) + (+ms / 1000);
      }
      return NaN;
    };
    const start = toS(m[1]);
    const end   = toS(m[2]);
    if (isNaN(start) || isNaN(end) || end <= start) continue;
    const clean = lines.slice(textStart).join('\n')
      .replace(/\{[^}]*\}/g, '').replace(/<\/?[a-zA-Z][^>]*>/g, '').trim();
    if (clean) cues.push({ start, end, text: clean });
  }
  cues.sort((a, b) => a.start - b.start);
  return cues;
}


function subStartLoop() {
  subStop();
  const video   = document.getElementById('mainPlayer');
  const overlay = document.getElementById('subOverlay');

  function tick() {
    _subRAF = requestAnimationFrame(tick);
    if (_subUseNative) return;
    if (_subIdx < 0 || !_subCues.length) {
      if (_subLast !== '') { overlay.textContent = ''; _subLast = ''; }
      return;
    }
    const t   = video.currentTime;
    const cue = _subCues.find(c => t >= c.start && t <= c.end) || null;
    const txt = cue ? cue.text : '';
    if (txt !== _subLast) {
      overlay.textContent = txt;
      _subLast = txt;
    }
  }
  tick();
}

function subStop() {
  if (_subRAF) { cancelAnimationFrame(_subRAF); _subRAF = null; }
  subDisableNativeTracks();
}

// ── PROGRESSO ──────────────────────────
function saveProgress() {
  const video = document.getElementById('mainPlayer');
  if (!video.duration) return;
  const ep = currentSeries.seasons[currentSeason].episodes[currentEpisodeIndex];
  const pct = Math.round((video.currentTime / video.duration) * 100);
  const prog = JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}');
  prog[ep.file] = { time: video.currentTime, pct };
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(prog));
}

// ── NAVEGAÇÃO ──────────────────────────
function getAllEpisodes() {
  const all = [];
  currentSeries.seasons.forEach((s, si) => s.episodes.forEach((ep, ei) => all.push({ si, ei, ep })));
  return all;
}
function getGlobalEpIndex() {
  return getAllEpisodes().findIndex(e => e.si === currentSeason && e.ei === currentEpisodeIndex);
}
function prevEpisode() {
  const gi = getGlobalEpIndex(); if (gi <= 0) return;
  const p = getAllEpisodes()[gi - 1];
  currentSeason = p.si; currentEpisodeIndex = p.ei;
  window.location.hash = `watch/${currentSeries.id}/${currentSeries.seasons[currentSeason].number}/${currentEpisodeIndex}`;
}
function nextEpisode() {
  const all = getAllEpisodes(); const gi = getGlobalEpIndex();
  if (gi >= all.length - 1) return;
  const n = all[gi + 1];
  currentSeason = n.si; currentEpisodeIndex = n.ei;
  window.location.hash = `watch/${currentSeries.id}/${currentSeries.seasons[currentSeason].number}/${currentEpisodeIndex}`;
}

function renderUpNext() {
  const upNext = document.getElementById('upNext');
  const all = getAllEpisodes();
  const gi = getGlobalEpIndex();
  const upcoming = all.slice(gi + 1, gi + 5);
  if (!upcoming.length) { upNext.innerHTML = ''; return; }
  const prog = JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}');
  upNext.innerHTML = `<h3>A SEGUIR</h3><div class="up-next-grid">` +
    upcoming.map(({ si, ei, ep }) => {
      const s = currentSeries.seasons[si];
      const pct = prog[ep.file]?.pct || 0;
      const thumb = ep.thumbnail
        ? `<img src="${ep.thumbnail}" alt="${ep.title}" loading="lazy" />`
        : `<div class="card-placeholder">▶<span>EP ${ep.episode.toString().padStart(2,'0')}</span></div>`;
      return `<div class="card" onclick="window.location.hash='watch/${currentSeries.id}/${s.number}/${ei}'">
        <div class="card-thumb">${thumb}<div class="card-overlay"><div class="card-play-btn">▶</div></div>
          ${pct > 0 ? `<div class="card-progress"><div class="card-progress-fill" style="width:${pct}%"></div></div>` : ''}
        </div>
        <div class="card-info"><div class="card-title">${ep.title}</div>
          <div class="card-sub"><span class="card-badge">EP ${ep.episode.toString().padStart(2,'0')}</span></div>
        </div></div>`;
    }).join('') + '</div>';
}

// ── PESQUISA ───────────────────────────
async function onSearch(val) {
  document.getElementById('searchClear').classList.toggle('visible', val.length > 0);
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => showHome(val), 300);
}
function clearSearch() {
  document.getElementById('searchInput').value = '';
  document.getElementById('searchClear').classList.remove('visible');
  showHome('');
}

// ── REDE LOCAL ─────────────────────────
let netPanelOpen = false;
let netDataLoaded = false;
function toggleNetPanel() {
  const panel = document.getElementById('netPanel');
  const btn = document.querySelector('.btn-network');
  netPanelOpen = !netPanelOpen;
  panel.style.display = netPanelOpen ? 'block' : 'none';
  btn.classList.toggle('active', netPanelOpen);
  if (netPanelOpen && !netDataLoaded) loadNetworkInfo();
}
async function loadNetworkInfo() {
  try {
    const { ips, port } = await fetch('/api/network').then(r => r.json());
    const container = document.getElementById('netIPs');
    if (!ips.length) { container.innerHTML = '<div class="net-no-ip">⚠ Nenhuma rede encontrada.</div>'; return; }
    container.innerHTML = ips.map((ip, i) => `
      <div class="net-ip-row" onclick="copyIP('http://${ip}:${port}', ${i})">
        <div class="net-ip-icon">${i === 0 ? '🖥' : '📡'}</div>
        <div class="net-ip-info">
          <div class="net-ip-addr">http://${ip}:${port}</div>
          <div class="net-ip-label">Clique para copiar</div>
        </div>
        <button class="net-ip-copy" id="copy-btn-${i}" onclick="event.stopPropagation();copyIP('http://${ip}:${port}', ${i})">📋</button>
      </div>`).join('');
    netDataLoaded = true;
  } catch { document.getElementById('netIPs').innerHTML = '<div class="net-no-ip">Erro ao carregar.</div>'; }
}
function copyIP(url, idx) {
  navigator.clipboard.writeText(url).then(() => {
    const btn = document.getElementById(`copy-btn-${idx}`);
    if (btn) { btn.textContent = '✅'; setTimeout(() => btn.textContent = '📋', 2000); }
  }).catch(() => {
    const inp = document.createElement('input');
    inp.value = url; document.body.appendChild(inp); inp.select(); document.execCommand('copy'); document.body.removeChild(inp);
  });
}
document.addEventListener('click', e => {
  if (netPanelOpen && !e.target.closest('.net-btn-wrap')) {
    netPanelOpen = false;
    document.getElementById('netPanel').style.display = 'none';
    document.querySelector('.btn-network')?.classList.remove('active');
  }
});

// ── UTILS ──────────────────────────────
function showView(name) {
  // Pausa o vídeo ao sair do player
  if (name !== 'player') {
    const video = document.getElementById('mainPlayer');
    if (video && !video.paused) {
      video.pause();
      subStop();
    }
  }
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`view-${name}`).classList.add('active');
  document.title = 'STREAMIX';
}


