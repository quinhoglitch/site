const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const os = require('os');

const app = express();
const PORT = 3000;
const VIDEOS_DIR = 'D:\\animes';

let libraryCache = null;
let libraryCacheTime = 0;
const LIBRARY_CACHE_TTL = 5000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/videos', express.static(VIDEOS_DIR));

const VIDEO_EXTS = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v'];
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];

function isVideo(f) { return VIDEO_EXTS.includes(path.extname(f).toLowerCase()); }

function getSafeVideoPath(filePath) {
  const relPath = decodeURIComponent(String(filePath || '')).replace(/^[/\\]?videos[/\\]/, '');
  const absPath = path.resolve(VIDEOS_DIR, relPath);
  if (!absPath.startsWith(path.resolve(VIDEOS_DIR))) return null;
  if (!fs.existsSync(absPath)) return null;
  return absPath;
}

function toSlug(str) {
  return str
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function findSubtitle(dir, base) {
  const subs = [];
  const seen = new Set();

  function add(f, lang, label, ext) {
    const rel = path.relative(VIDEOS_DIR, f).replace(/\\/g, '/');
    if (seen.has(rel)) return;
    seen.add(rel);
    subs.push({ file: '/videos/' + rel, lang, label, ext });
  }

  // 1. Nome exato: "video.srt"
  for (const ext of ['.srt', '.vtt']) {
    const f = path.join(dir, base + ext);
    if (fs.existsSync(f)) add(f, 'pt', 'Português', ext.slice(1));
  }

  let allFiles = [];
  try { allFiles = fs.readdirSync(dir); } catch(e) { return subs; }

  // 2. Com idioma: "video.pt.srt", "video.en.srt"
  const escapedBase = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const langPat = new RegExp('^' + escapedBase + '\\.([a-zA-Z]{2}(?:-[a-zA-Z]{2})?)\\.(srt|vtt)$', 'i');
  for (const f of allFiles) {
    const m = f.match(langPat);
    if (!m) continue;
    const code = m[1].toLowerCase();
    const label = code.startsWith('pt') ? 'Português'
      : code.startsWith('en') ? 'Inglês'
      : code.startsWith('es') ? 'Espanhol' : code.toUpperCase();
    add(path.join(dir, f), code, label, m[2].toLowerCase());
  }

  // 3. Fuzzy: casa pelo numero do episodio quando nomes nao batem
  //    Ex: "Charlotte 02 [BD x265].mkv" casa com "Charlotte 02.srt" ou "02.srt"
  if (subs.length === 0) {
    const epM = base.match(/(?:^|\D)(\d{1,3})(?:\D|$)/);
    if (epM) {
      const n = parseInt(epM[1], 10);
      const ns = String(n);
      const np = ns.padStart(2, '0');
      const fuzzyPat = new RegExp('(?:^|\\D)(' + ns + '|' + np + ')(?:\\D|$)');
      for (const f of allFiles) {
        const ext = path.extname(f).toLowerCase();
        if (ext !== '.srt' && ext !== '.vtt') continue;
        const fname = path.basename(f, ext);
        if (fuzzyPat.test(fname)) {
          add(path.join(dir, f), 'pt', 'Português', ext.slice(1));
        }
      }
    }
  }

  if (subs.length) console.log('[SUB]', base, '->', subs.map(s => s.file));
  return subs;
}
function findThumbnail(dir, base) {
  for (const ext of IMAGE_EXTS)
    for (const name of [base, 'thumbnail', 'cover', 'poster'])
      if (fs.existsSync(path.join(dir, name + ext)))
        return '/videos/' + path.relative(VIDEOS_DIR, path.join(dir, name + ext)).replace(/\\/g, '/');
  return null;
}

function getSeriesThumb(dir, name) {
  for (const ext of IMAGE_EXTS)
    for (const n of ['poster', 'thumbnail', 'cover', name])
      if (fs.existsSync(path.join(dir, n + ext)))
        return '/videos/' + path.relative(VIDEOS_DIR, path.join(dir, n + ext)).replace(/\\/g, '/');
  return null;
}

function parseEpNum(f) {
  const b = path.basename(f, path.extname(f));
  const m = b.match(/(?:ep(?:isodio|isode|\.)?|e)[\s._-]*(\d+)/i) || b.match(/(\d+)/);
  return m ? parseInt(m[1]) : 0;
}

function parseSeasonNum(d) { const m = d.match(/(\d+)/); return m ? parseInt(m[1]) : 1; }

function buildLibrary() {
  if (libraryCache && (Date.now() - libraryCacheTime) < LIBRARY_CACHE_TTL) return libraryCache;
  if (!fs.existsSync(VIDEOS_DIR)) { fs.mkdirSync(VIDEOS_DIR, { recursive: true }); return []; }

  const library = [];
  const seriesDirs = fs.readdirSync(VIDEOS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory()).map(d => d.name);

  for (const seriesName of seriesDirs) {
    const sp = path.join(VIDEOS_DIR, seriesName);
    const series = { id: toSlug(seriesName), name: seriesName, thumbnail: getSeriesThumb(sp, seriesName), seasons: [] };
    const seasonDirs = fs.readdirSync(sp, { withFileTypes: true }).filter(d => d.isDirectory());

    if (!seasonDirs.length) {
      const eps = buildEpisodes(sp, seriesName, 1);
      if (eps.length) {
        series.seasons.push({ number: 1, label: 'Temporada 1', episodes: eps });
        if (!series.thumbnail && eps[0].thumbnail) series.thumbnail = eps[0].thumbnail;
      }
    } else {
      for (const sd of seasonDirs) {
        const sn = parseSeasonNum(sd.name);
        const eps = buildEpisodes(path.join(sp, sd.name), seriesName, sn);
        if (eps.length) {
          series.seasons.push({ number: sn, label: sd.name, episodes: eps });
          if (!series.thumbnail && eps[0].thumbnail) series.thumbnail = eps[0].thumbnail;
        }
      }
      series.seasons.sort((a, b) => a.number - b.number);
    }
    if (series.seasons.length) library.push(series);
  }

  libraryCache = library;
  libraryCacheTime = Date.now();
  return library;
}

function buildEpisodes(dir, seriesName, seasonNum) {
  return fs.readdirSync(dir).filter(isVideo).map(file => {
    const base = path.basename(file, path.extname(file));
    const relPath = path.relative(VIDEOS_DIR, path.join(dir, file)).replace(/\\/g, '/');
    const subs = findSubtitle(dir, base);
    if (subs.length) console.log(`[SUB] Encontrado para "${base}":`, subs.map(s => s.file));
    return {
      id: toSlug(relPath),
      title: base,
      episode: parseEpNum(file),
      season: seasonNum,
      series: seriesName,
      file: '/videos/' + relPath,
      thumbnail: findThumbnail(dir, base),
      subtitles: subs,
    };
  }).sort((a, b) => a.episode - b.episode);
}

// ── API ──────────────────────────────────────────
app.get('/api/library', (req, res) => {
  try {
    const lib = buildLibrary();
    const q = req.query.q?.toLowerCase();
    res.json(q ? lib.filter(s => s.name.toLowerCase().includes(q)) : lib);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/series/:id', (req, res) => {
  try {
    const lib = buildLibrary();
    const reqId = decodeURIComponent(req.params.id);
    const s = lib.find(s => s.id === reqId);
    if (!s) return res.status(404).json({ error: 'Not found' });
    res.json(s);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Diagnóstico: lista arquivos de uma pasta
app.get('/api/debug/dir', (req, res) => {
  const rel = req.query.path || '';
  const full = rel ? path.join(VIDEOS_DIR, rel) : VIDEOS_DIR;
  try {
    const files = fs.readdirSync(full);
    res.json({ path: full, files });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/refresh', (req, res) => {
  libraryCache = null; libraryCacheTime = 0;
  res.json({ ok: true });
});

app.get('/api/video', (req, res) => {
  const absPath = getSafeVideoPath(req.query.file);
  if (!absPath) return res.status(404).send('Arquivo nao encontrado');

  const ext = path.extname(absPath).toLowerCase();
  const stat = fs.statSync(absPath);
  const fileSize = stat.size;
  const range = req.headers.range;
  const mime = ({
    '.mp4': 'video/mp4',
    '.mkv': 'video/x-matroska',
    '.webm': 'video/webm',
    '.m4v': 'video/mp4',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
  })[ext] || 'application/octet-stream';

  if (!range) {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': mime,
      'Accept-Ranges': 'bytes',
    });
    return fs.createReadStream(absPath).pipe(res);
  }

  const parts = range.replace(/bytes=/, '').split('-');
  const start = parseInt(parts[0], 10);
  const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
  if (isNaN(start) || isNaN(end) || start >= fileSize || end >= fileSize || start > end) {
    res.status(416).setHeader('Content-Range', `bytes */${fileSize}`);
    return res.end();
  }

  const chunkSize = (end - start) + 1;
  res.writeHead(206, {
    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
    'Accept-Ranges': 'bytes',
    'Content-Length': chunkSize,
    'Content-Type': mime,
  });
  return fs.createReadStream(absPath, { start, end }).pipe(res);
});
// SRT → WebVTT
function detectEncoding(buf) {
  // Detecta UTF-8 com BOM
  if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) return 'utf8';
  // Tenta decodificar como UTF-8 — se falhar (replacement chars), usa latin1
  const utf8 = buf.toString('utf8');
  // Verifica se tem replacement character (indica UTF-8 inválido)
  if (utf8.includes('\uFFFD')) return 'latin1';
  return 'utf8';
}

function srtToVtt(buf) {
  const enc = detectEncoding(buf);
  let txt = buf.toString(enc);
  
  // Remove BOM e normaliza quebras de linha
  txt = txt.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  
  const blocks = [];
  // Split em blocos — tolerante a múltiplas linhas em branco
  for (const block of txt.split(/\n{2,}/)) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;
    
    // Pula número de sequência (linha só com dígitos)
    let i = /^\s*\d+\s*$/.test(lines[0]) ? 1 : 0;
    if (i >= lines.length) continue;
    
    // Linha de timestamps
    const tline = lines[i];
    if (!tline || !tline.includes('-->')) continue;
    
    // Converte vírgula → ponto nos ms (SRT usa vírgula, VTT usa ponto)
    const time = tline
      .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
      .trim();
    
    const text = lines.slice(i + 1)
      .join('\n')
      .replace(/\{[^}]*\}/g, '')    // remove {an8}, {\i1}, etc
      .trim();
      
    if (text) blocks.push(time + '\n' + text);
  }
  
  console.log(`[SRT] Convertido: ${blocks.length} cues (enc: ${enc})`);
  return 'WEBVTT\n\n' + blocks.join('\n\n') + '\n';
}

app.get('/api/srt2vtt', (req, res) => {
  const filePath = req.query.file;
  if (!filePath) return res.status(400).send('file obrigatório');

  // Aceita tanto "Serie/ep.srt" quanto "/videos/Serie/ep.srt"
  const relPath = decodeURIComponent(filePath).replace(/^[/\\]?videos[/\\]/, '');
  const absPath = path.resolve(VIDEOS_DIR, relPath);

  console.log(`[SRT] file="${filePath}" → relPath="${relPath}" → abs="${absPath}"`);

  if (!absPath.startsWith(path.resolve(VIDEOS_DIR))) return res.status(403).send('Acesso negado');
  if (!fs.existsSync(absPath)) {
    console.log(`[SRT] ARQUIVO NÃO ENCONTRADO: ${absPath}`);
    return res.status(404).send('Arquivo não encontrado: ' + relPath);
  }

  res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');

  const ext = path.extname(absPath).toLowerCase();
  if (ext === '.vtt') return res.sendFile(absPath);

  try {
    const buf = fs.readFileSync(absPath);  // lê como Buffer bruto
    const vtt = srtToVtt(buf);             // detecta encoding internamente
    res.send(vtt);
  } catch (e) {
    console.error('[SRT] Erro:', e.message);
    res.status(500).send('Erro: ' + e.message);
  }
});

// Rede local
function getLocalIPs() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const iface of Object.values(nets))
    for (const net of iface)
      if (net.family === 'IPv4' && !net.internal) ips.push(net.address);
  return ips;
}

app.get('/api/network', (req, res) => res.json({ ips: getLocalIPs(), port: PORT }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, '0.0.0.0', () => {
  const ips = getLocalIPs();
  console.log(`\n🎬 STREAMIX em http://localhost:${PORT}`);
  ips.forEach(ip => console.log(`   Rede: http://${ip}:${PORT}`));
  console.log(`📁 ${VIDEOS_DIR}\n`);
});



