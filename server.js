const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const archiver = require('archiver');
const crypto = require('crypto');
const app = express();
const port = process.env.PORT || 3000;

const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads');
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'uploads.json');

const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const PROXY_CACHE_DIR = path.join(UPLOADS_DIR, 'proxy-cache');

if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
if (!fs.existsSync(PROXY_CACHE_DIR)) fs.mkdirSync(PROXY_CACHE_DIR, { recursive: true });

// Proxy cache configuration
const PROXY_CACHE_MAX_BYTES = Number(process.env.PROXY_CACHE_MAX_BYTES) || (8 * 1024 * 1024 * 1024); // default 8GB
const PROXY_CACHE_INITIAL_BYTES = Number(process.env.PROXY_CACHE_INITIAL_BYTES) || (1 * 1024 * 1024); // warm first 1MB
const PROXY_WARM_INTERVAL_MS = Number(process.env.PROXY_WARM_INTERVAL_MS) || 10000; // try warm every 10s

function readCacheMeta(cacheMetaPath){
  try{ return JSON.parse(fs.readFileSync(cacheMetaPath, 'utf8')); }catch(e){ return null; }
}

function writeCacheMeta(cacheMetaPath, meta){
  try{ fs.writeFileSync(cacheMetaPath, JSON.stringify(meta), 'utf8'); }catch(e){ console.error('writeCacheMeta failed', e); }
}

function getCacheEntries(){
  try{
    return fs.readdirSync(PROXY_CACHE_DIR).filter(n=>!n.endsWith('.meta.json')).map(fn=>{
      const fp = path.join(PROXY_CACHE_DIR, fn);
      const meta = readCacheMeta(fp + '.meta.json') || {};
      const st = fs.statSync(fp);
      return { file: fp, name: fn, size: st.size, meta };
    });
  }catch(e){ return []; }
}

function getCacheSize(){
  try{ return getCacheEntries().reduce((s,e)=>s+e.size, 0); }catch(e){ return 0; }
}

function evictIfNeeded(){
  try{
    let total = getCacheSize();
    if (total <= PROXY_CACHE_MAX_BYTES) return;
    // sort by meta.atime (oldest first) then by file mtime
    const entries = getCacheEntries().sort((a,b)=>{
      const aa = a.meta && a.meta.atime ? a.meta.atime : 0;
      const bb = b.meta && b.meta.atime ? b.meta.atime : 0;
      if (aa !== bb) return aa - bb;
      return a.size - b.size;
    });
    for(const e of entries){
      try{
        fs.unlinkSync(e.file);
        const mp = e.file + '.meta.json'; if(fs.existsSync(mp)) fs.unlinkSync(mp);
        total -= e.size;
        if(total <= PROXY_CACHE_MAX_BYTES) break;
      }catch(err){ console.error('evict failed', err); }
    }
  }catch(e){ console.error('evictIfNeeded failed', e); }
}

function touchCacheAtime(cachePath){
  try{
    const metaPath = cachePath + '.meta.json';
    const meta = readCacheMeta(metaPath) || {};
    meta.atime = Date.now();
    writeCacheMeta(metaPath, meta);
  }catch(e){ console.error('touchCacheAtime failed', e); }
}

async function warmUrl(url){
  try{
    const hash = crypto.createHash('sha1').update(url).digest('hex');
    const cachePath = path.join(PROXY_CACHE_DIR, hash);
    const cacheMeta = cachePath + '.meta.json';
    if (fs.existsSync(cachePath) && fs.existsSync(cacheMeta)) return;
    // ensure there's space
    evictIfNeeded();
    const mod = url.startsWith('https:') ? require('https') : require('http');
    const parsed = new URL(url);
    const opts = { method: 'GET', headers: { Range: `bytes=0-${PROXY_CACHE_INITIAL_BYTES-1}` } };
    return new Promise((resolve)=>{
      const tempPath = cachePath + '.tmp';
      const lockPath = cachePath + '.lock';
      try{ fs.writeFileSync(lockPath, String(process.pid)); }catch(e){}
      const ws = fs.createWriteStream(tempPath);
      const req = mod.request(parsed, opts, res => {
        const contentType = res.headers['content-type'] || 'application/octet-stream';
        let received = 0;
        res.on('data', c => { received += c.length; });
        res.pipe(ws);
        res.on('end', ()=>{
          try{ ws.end(); try{ fs.renameSync(tempPath, cachePath); }catch(e){}; const size = fs.existsSync(cachePath) ? fs.statSync(cachePath).size : 0; writeCacheMeta(cacheMeta, { url, contentType, cachedBytes: size, partial: true, atime: Date.now() }); }catch(e){ console.error('warm finalize failed', e); }
          try{ if(fs.existsSync(lockPath)) fs.unlinkSync(lockPath); }catch(_){}
          resolve(true);
        });
      });
      req.on('error', (e)=>{ try{ if(fs.existsSync(tempPath)) fs.unlinkSync(tempPath); }catch(_){}; try{ if(fs.existsSync(lockPath)) fs.unlinkSync(lockPath); }catch(_){}; resolve(false); });
      req.end();
    });
  }catch(e){ console.error('warmUrl failed', e); return false; }
}

// background warmer: iterate external urls in uploads.json and warm them gradually
setInterval(async ()=>{
  try{
    evictIfNeeded();
    const data = JSON.parse(fs.readFileSync(DATA_FILE,'utf8'));
    for(const it of data){
      if (!it.file) continue;
      if (typeof it.file === 'string' && (it.file.startsWith('http://') || it.file.startsWith('https://'))){
        const hash = crypto.createHash('sha1').update(it.file).digest('hex');
        const cachePath = path.join(PROXY_CACHE_DIR, hash);
        const cacheMeta = cachePath + '.meta.json';
        if (!fs.existsSync(cachePath) || !fs.existsSync(cacheMeta)){
          // warm one and break to avoid busy loop
          await warmUrl(it.file);
          break;
        }
      }
    }
  }catch(e){ /* ignore */ }
}, PROXY_WARM_INTERVAL_MS);

// Admin: cache status and manual warm endpoint
app.get('/api/cache-status', basicAuth, (req, res) => {
  try{
    const entries = getCacheEntries().map(e=>({ name: e.name, size: e.size, url: (e.meta && e.meta.url)||null, cachedBytes: (e.meta && e.meta.cachedBytes)||e.size, partial: (e.meta && e.meta.partial)||false, atime: (e.meta && e.meta.atime)||0 }));
    const total = getCacheSize();
    res.json({ total, max: PROXY_CACHE_MAX_BYTES, entries });
  }catch(e){ console.error('cache-status failed', e); res.status(500).json({ error: 'failed' }); }
});

app.post('/api/warm-cache', basicAuth, express.json(), async (req, res) => {
  try{
    const body = req.body || {};
    const urls = Array.isArray(body.urls) && body.urls.length ? body.urls : null;
    if(urls){
      // warm provided list
      const results = [];
      for(const u of urls){ results.push({ url: u, ok: await warmUrl(u) }); }
      return res.json({ results });
    }
    // otherwise warm external entries from uploads.json (all or until space)
    const data = JSON.parse(fs.readFileSync(DATA_FILE,'utf8'));
    const external = data.filter(it=> it.file && typeof it.file === 'string' && (it.file.startsWith('http://') || it.file.startsWith('https://')) ).map(it=>it.file);
    const results = [];
    for(const u of external){
      results.push({ url: u, ok: await warmUrl(u) });
    }
    res.json({ results });
  }catch(e){ console.error('warm-cache failed', e); res.status(500).json({ error: 'failed' }); }
});


if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]', 'utf8');

// Redirect requests for standalone pages to the main page — keep only '/' and '/admin' as pages.
app.use(express.json());

app.use((req, res, next) => {
  if (req.method === 'GET') {
    const blocked = ['/player.html', '/episode.html', '/sponsor.html', '/player', '/episode', '/sponsor'];
    // allow admin and API and uploads and static asset requests
    if (blocked.includes(req.path)) {
      return res.redirect('/');
    }
  }
  next();
});

app.use(express.static(PUBLIC_DIR));

// Serve uploads with proper Range support for audio streaming
app.get('/media/:name', (req, res) => {
  try {
    const startTime = Date.now();
    const name = req.params.name;
    if (!name || name.includes('..') || name.includes('/')) return res.status(400).end('invalid name');
    const filePath = path.join(UPLOADS_DIR, name);
    if (!fs.existsSync(filePath)) return res.status(404).end('not found');

    const stat = fs.statSync(filePath);
    const total = stat.size;
    const range = req.headers.range;

    const ext = path.extname(name).toLowerCase().replace('.', '');
    const mimeMap = { mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' };
    const contentType = mimeMap[ext] || 'application/octet-stream';

    // allow clients to cache media for a short while to reduce load on the server
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=86400');

    // helper to log transfer
    const logTransfer = (status, rangeInfo, bytesSent, aborted=false) => {
      const dur = Date.now() - startTime;
      console.log(`[media] ${new Date().toISOString()} name=${name} status=${status} range=${rangeInfo} bytes=${bytesSent}ms=${dur}ms aborted=${aborted} ip=${req.ip}`);
    };

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : total - 1;
      if (isNaN(start) || isNaN(end) || start > end) return res.status(416).end();
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
      res.setHeader('Content-Length', (end - start) + 1);
      const stream = fs.createReadStream(filePath, { start, end, highWaterMark: 64 * 1024 });
      let bytes = 0; let aborted = false;
      stream.on('data', chunk => { bytes += chunk.length; });
      stream.on('end', () => logTransfer(206, `${start}-${end}/${total}`, bytes, aborted));
      stream.on('error', (err) => { console.error('stream error', err); });
      res.on('close', ()=>{ if(res.writableEnded===false) { aborted = true; logTransfer(206, `${start}-${end}/${total}`, bytes, true); } });
      stream.pipe(res);
      return;
    }

    res.setHeader('Content-Length', total);
    const stream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 });
    let bytes = 0; let aborted = false;
    stream.on('data', chunk => { bytes += chunk.length; });
    stream.on('end', () => logTransfer(200, `0-${total-1}/${total}`, bytes, aborted));
    stream.on('error', (err) => { console.error('stream error', err); });
    res.on('close', ()=>{ if(res.writableEnded===false) { aborted = true; logTransfer(200, `0-${total-1}/${total}`, bytes, true); } });
    stream.pipe(res);
  } catch (e) {
    console.error('media serve failed', e);
    res.status(500).end('error');
  }
});

// Respond to HEAD requests for media so clients can quickly learn file size and headers
app.head('/media/:name', (req, res) => {
  try {
    const name = req.params.name;
    if (!name || name.includes('..') || name.includes('/')) return res.status(400).end('invalid name');
    const filePath = path.join(UPLOADS_DIR, name);
    if (!fs.existsSync(filePath)) return res.status(404).end('not found');
    const stat = fs.statSync(filePath);
    const total = stat.size;
    const ext = path.extname(name).toLowerCase().replace('.', '');
    const mimeMap = { mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' };
    const contentType = mimeMap[ext] || 'application/octet-stream';
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', total);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).end();
  } catch (e) {
    console.error('media HEAD failed', e);
    return res.status(500).end('error');
  }
});

// Basic auth middleware for admin/backups
function basicAuth(req, res, next){
  const user = process.env.ADMIN_USER || 'admin';
  const pass = process.env.ADMIN_PASS || 'password';
  const auth = req.headers.authorization;
  if(!auth || !auth.startsWith('Basic ')){
    res.setHeader('WWW-Authenticate','Basic realm="Admin Area"');
    return res.status(401).send('Authentication required');
  }
  const creds = Buffer.from(auth.split(' ')[1], 'base64').toString('utf8');
  const [u,p] = creds.split(':');
  if(u === user && p === pass) return next();
  res.setHeader('WWW-Authenticate','Basic realm="Admin Area"');
  return res.status(401).send('Invalid credentials');
}

// Multer setup: store uploaded files in public/uploads with original name (but prefixed timestamp)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ts = Date.now();
    const safe = file.originalname.replace(/[^a-zA-Z0-9.\-\u0600-\u06FF_]/g, '_');
    cb(null, `${ts}-${safe}`);
  }
});
const upload = multer({ storage });

// allow attaching a cover image to an existing upload entry
const coverUpload = multer({ storage }).single('cover');

app.post('/api/attach-cover', basicAuth, (req, res) => {
  coverUpload(req, res, err => {
    if (err) return res.status(500).json({ error: 'cover upload failed' });
    try {
      const id = req.body.id && Number(req.body.id);
      if (!id || !req.file) return res.status(400).json({ error: 'missing id or cover file' });
      const items = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      const idx = items.findIndex(it => Number(it.id) === id);
      if (idx === -1) return res.status(404).json({ error: 'item not found' });
      items[idx].cover = `/uploads/${req.file.filename}`;
      fs.writeFileSync(DATA_FILE, JSON.stringify(items, null, 2), 'utf8');
      res.json({ success: true, cover: items[idx].cover });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'failed to attach cover' });
    }
  });
});

// Replace audio file for an existing upload (protected)
app.post('/api/uploads/:id/replace-file', basicAuth, upload.single('file'), (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!req.file) return res.status(400).json({ error: 'missing file' });
    const items = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    const idx = items.findIndex(it => Number(it.id) === id);
    if (idx === -1) return res.status(404).json({ error: 'item not found' });

    // remove old file if local
    try{
      const old = items[idx].file;
      if(old && old.startsWith('/uploads/')){
        const oldPath = path.join(PUBLIC_DIR, old.replace(/^\//,''));
        if(fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
    }catch(e){}

    // update item with new file
    items[idx].file = `/uploads/${req.file.filename}`;
    items[idx].originalName = req.file.originalname;
    items[idx].mime = req.file.mimetype;
    items[idx].updatedAt = new Date().toISOString();
    fs.writeFileSync(DATA_FILE, JSON.stringify(items, null, 2), 'utf8');
    res.json({ success: true, entry: items[idx] });
  } catch (e) {
    console.error('replace-file failed', e);
    res.status(500).json({ error: 'replace failed' });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.get('/admin', basicAuth, (req, res) => {
  // Serve admin.html but inject a small script exposing the Basic auth header
  try{
    const adminUser = process.env.ADMIN_USER || 'admin';
    const adminPass = process.env.ADMIN_PASS || 'password';
    const token = Buffer.from(`${adminUser}:${adminPass}`).toString('base64');
    let html = fs.readFileSync(path.join(PUBLIC_DIR, 'admin.html'), 'utf8');
    const inject = `<script>window.__ADMIN_AUTH = "Basic ${token}";</script>`;
    // insert before closing </body>
    html = html.replace('</body>', `${inject}</body>`);
    res.send(html);
  }catch(e){
    console.error('failed to serve admin', e);
    res.sendFile(path.join(PUBLIC_DIR, 'admin.html'));
  }
});

// Return list of uploaded items
app.get('/api/uploads', (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'failed to read uploads' });
  }
});

// Update upload metadata (title, description, textContent)
app.put('/api/uploads/:id', basicAuth, express.json(), (req, res) => {
  try {
    const id = Number(req.params.id);
    const items = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    const idx = items.findIndex(it => Number(it.id) === id);
    if (idx === -1) return res.status(404).json({ error: 'item not found' });
    const { title, description, textContent } = req.body || {};
    if (typeof title !== 'undefined') items[idx].title = title;
    if (typeof description !== 'undefined') items[idx].description = description;
    if (typeof textContent !== 'undefined') items[idx].textContent = textContent;
    fs.writeFileSync(DATA_FILE, JSON.stringify(items, null, 2), 'utf8');
    res.json({ success: true, entry: items[idx] });
  } catch (e) {
    console.error('update upload failed', e);
    res.status(500).json({ error: 'update failed' });
  }
});

// Delete an upload entry (and optionally remove file/cover)
app.delete('/api/uploads/:id', basicAuth, (req, res) => {
  try {
    const id = Number(req.params.id);
    const items = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    const idx = items.findIndex(it => Number(it.id) === id);
    if (idx === -1) return res.status(404).json({ error: 'item not found' });
    const removed = items.splice(idx, 1)[0];
    // try to remove files if they are local
    try{
      if(removed.file && removed.file.startsWith('/uploads/')){
        const fp = path.join(PUBLIC_DIR, removed.file.replace(/^\//,''));
        if(fs.existsSync(fp)) fs.unlinkSync(fp);
      }
      if(removed.cover && removed.cover.startsWith('/uploads/')){
        const cp = path.join(PUBLIC_DIR, removed.cover.replace(/^\//,''));
        if(fs.existsSync(cp)) fs.unlinkSync(cp);
      }
    }catch(e){}
    fs.writeFileSync(DATA_FILE, JSON.stringify(items, null, 2), 'utf8');
    res.json({ success: true });
  } catch (e) {
    console.error('delete upload failed', e);
    res.status(500).json({ error: 'delete failed' });
  }
});

// --- Backup endpoints ---
app.post('/api/backup', basicAuth, (req, res) => {
  try {
    const ts = Date.now();
    const name = `backup-${ts}`;
    const dest = path.join(BACKUPS_DIR, name);
    fs.mkdirSync(dest, { recursive: true });

    // items to include in backup (top-level project items)
    const items = ['public', 'data', 'server.js', 'package.json', 'package-lock.json'];
    for (const it of items) {
      const src = path.join(__dirname, it);
      if (!fs.existsSync(src)) continue;
      const target = path.join(dest, path.basename(it));
      const stat = fs.statSync(src);
      if (stat.isDirectory()) {
        fs.cpSync(src, target, { recursive: true });
      } else {
        fs.copyFileSync(src, target);
      }
    }

    // create zip archive for download
    const zipPath = path.join(BACKUPS_DIR, `${name}.zip`);
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', () => {
      // done
    });
    archive.on('error', (err) => { throw err; });
    archive.pipe(output);
    archive.directory(dest, false);
    archive.finalize();

    res.json({ success: true, name });
  } catch (e) {
    console.error('backup failed', e);
    res.status(500).json({ error: 'backup failed' });
  }
});

app.get('/api/backups', basicAuth, (req, res) => {
  try {
    if (!fs.existsSync(BACKUPS_DIR)) return res.json([]);
    const entries = fs.readdirSync(BACKUPS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => {
        const p = path.join(BACKUPS_DIR, d.name);
        const st = fs.statSync(p);
        return { name: d.name, createdAt: st.ctimeMs };
      })
      .sort((a,b)=> b.createdAt - a.createdAt);
    res.json(entries);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'failed to list backups' });
  }
});

// Simple status endpoint for health checks and quick visibility
app.get('/status', (req, res) => {
  try {
    const status = {
      status: 'ok',
      time: new Date().toISOString(),
      pid: process.pid,
      uptimeSeconds: Math.floor(process.uptime()),
      env: process.env.NODE_ENV || 'production'
    };
    res.json(status);
  } catch (e) {
    res.status(500).json({ status: 'error' });
  }
});

// Simple proxy for external media to avoid CORS issues and support Range/HEAD
app.all('/proxy', (req, res) => {
  try {
    const url = (req.method === 'GET' || req.method === 'HEAD') ? req.query.url : req.query.url;
    if (!url) return res.status(400).end('missing url');
    let parsed;
    try { parsed = new URL(url); } catch (e) { return res.status(400).end('invalid url'); }
    if (!['http:', 'https:'].includes(parsed.protocol)) return res.status(400).end('unsupported protocol');

    // respond to CORS preflight
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Range,Accept,Content-Type');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length,Content-Range,Accept-Ranges');
    if (req.method === 'OPTIONS') return res.status(204).end();

    const mod = parsed.protocol === 'https:' ? require('https') : require('http');
    const opts = {
      method: req.method === 'HEAD' ? 'HEAD' : 'GET',
      headers: {}
    };
    // forward Range header if present (important for streaming)
    if (req.headers.range) opts.headers.Range = req.headers.range;
    if (req.headers['user-agent']) opts.headers['User-Agent'] = req.headers['user-agent'];

    // Try to serve from cache when available (full cached file)
    const hash = crypto.createHash('sha1').update(url).digest('hex');
    const cachePath = path.join(PROXY_CACHE_DIR, hash);
    const cacheMeta = cachePath + '.meta.json';

    if (fs.existsSync(cachePath) && fs.existsSync(cacheMeta)) {
      // serve cached file with range support
      const stat = fs.statSync(cachePath);
      const total = stat.size;
      const range = req.headers.range;
      const contentType = JSON.parse(fs.readFileSync(cacheMeta, 'utf8')).contentType || 'application/octet-stream';
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Type', contentType);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=86400');

      // update access time for LRU eviction
      try{ touchCacheAtime(cachePath); }catch(e){}

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : total - 1;
        if (isNaN(start) || isNaN(end) || start > end) return res.status(416).end();
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
        res.setHeader('Content-Length', (end - start) + 1);
        const stream = fs.createReadStream(cachePath, { start, end, highWaterMark: 64 * 1024 });
        stream.pipe(res);
        return;
      }

      res.setHeader('Content-Length', total);
      fs.createReadStream(cachePath, { highWaterMark: 64 * 1024 }).pipe(res);
      return;
    }

    // Not cached: stream from remote and save to temp cache for future
    const tempPath = cachePath + '.tmp';
    const fileStream = fs.createWriteStream(tempPath, { flags: 'w' });

    // forward Range header if present (important for streaming)
    if (req.headers.range) opts.headers.Range = req.headers.range;
    if (req.headers['user-agent']) opts.headers['User-Agent'] = req.headers['user-agent'];

    const proxyReq = mod.request(parsed, opts, proxyRes => {
      // forward relevant headers
      if (proxyRes.headers['content-type']) res.setHeader('Content-Type', proxyRes.headers['content-type']);
      if (proxyRes.headers['content-length']) res.setHeader('Content-Length', proxyRes.headers['content-length']);
      if (proxyRes.headers['content-range']) res.setHeader('Content-Range', proxyRes.headers['content-range']);
      if (proxyRes.headers['accept-ranges']) res.setHeader('Accept-Ranges', proxyRes.headers['accept-ranges']);
      // CORS
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.statusCode = proxyRes.statusCode || 200;
      // for HEAD requests, end after headers
      if (req.method === 'HEAD') {
        // save metadata for future (no body)
        const meta = { contentType: proxyRes.headers['content-type'] || 'application/octet-stream' };
        fs.writeFileSync(cacheMeta, JSON.stringify(meta));
        return res.end();
      }

      // Pipe remote data to response while also writing to temp file
      proxyRes.pipe(res);
      proxyRes.pipe(fileStream);

      proxyRes.on('end', () => {
        try {
          fileStream.end();
          // mark cache complete
          const meta = { contentType: proxyRes.headers['content-type'] || 'application/octet-stream' };
          fs.writeFileSync(cacheMeta, JSON.stringify(meta));
          // rename temp to final cache file
          try { fs.renameSync(tempPath, cachePath); } catch(e) { /* best-effort */ }
        } catch (e) { console.error('proxy cache finalize failed', e); }
      });

      proxyRes.on('error', (err) => { console.error('proxy response error', err); try{ res.end(); }catch(e){} });
    });
    proxyReq.on('error', err => {
      console.error('proxy request failed', err);
      try { res.status(502).end('proxy error'); } catch(e){}
    });
    proxyReq.end();
  } catch (e) {
    console.error('proxy handler failed', e);
    res.status(500).end('proxy failed');
  }
});

// download backup zip (if exists)
app.get('/api/backups/:name/download', basicAuth, (req, res) => {
  try {
    const name = req.params.name;
    const zipPath = path.join(BACKUPS_DIR, `${name}.zip`);
    const folderPath = path.join(BACKUPS_DIR, name);

    if (!fs.existsSync(zipPath)) {
      if (!fs.existsSync(folderPath)) return res.status(404).json({ error: 'backup not found' });
      // create zip on the fly
      const archive = archiver('zip', { zlib: { level: 9 } });
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${name}.zip"`);
      archive.directory(folderPath, false);
      archive.pipe(res);
      archive.finalize();
      return;
    }

    res.download(zipPath, `${name}.zip`);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'failed to download backup' });
  }
});

app.post('/api/restore', basicAuth, (req, res) => {
  try {
    const { name } = req.body || {};
    if (!name) return res.status(400).json({ error: 'missing backup name' });
    const srcRoot = path.join(BACKUPS_DIR, name);
    if (!fs.existsSync(srcRoot)) return res.status(404).json({ error: 'backup not found' });

    // For each top-level item in the backup, copy it back to project root
    const items = fs.readdirSync(srcRoot, { withFileTypes: true });
    for (const it of items) {
      const src = path.join(srcRoot, it.name);
      const dest = path.join(__dirname, it.name);
      // remove existing dest then copy
      if (fs.existsSync(dest)) {
        // careful with recursive removal
        const st = fs.statSync(dest);
        if (st.isDirectory()) fs.rmSync(dest, { recursive: true, force: true });
        else fs.unlinkSync(dest);
      }
      const stSrc = fs.statSync(src);
      if (stSrc.isDirectory()) fs.cpSync(src, dest, { recursive: true });
      else fs.copyFileSync(src, dest);
    }

    res.json({ success: true });
  } catch (e) {
    console.error('restore failed', e);
    res.status(500).json({ error: 'restore failed' });
  }
});

// Handle upload: supports file field `file`, and text fields `title`, `description`, `textContent`
app.post('/upload', upload.single('file'), (req, res) => {
  try {
    const items = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    const { title, description, textContent } = req.body || {};
    const entry = {
      id: Date.now(),
      title: title || (req.file ? req.file.originalname : 'بدون عنوان'),
      description: description || '',
      file: req.file ? `/uploads/${req.file.filename}` : null,
      originalName: req.file ? req.file.originalname : null,
      mime: req.file ? req.file.mimetype : null,
      textContent: textContent || null,
      createdAt: new Date().toISOString()
    };

    items.unshift(entry);
    fs.writeFileSync(DATA_FILE, JSON.stringify(items, null, 2), 'utf8');

    res.json({ success: true, entry });
  } catch (err) {
    console.error('upload error', err);
    res.status(500).json({ error: 'upload failed' });
  }
});

app.listen(port, () => {
  console.log(`Server listening on http://127.0.0.1:${port}`);
});
