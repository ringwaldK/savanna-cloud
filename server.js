const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { randomUUID } = require('crypto');
const path = require('path');
const fs = require('fs');

// Alias to keep existing call sites unchanged
const uuidv4 = randomUUID;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const SESSIONS_DIR = path.join(__dirname, 'sessions');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// Ensure runtime directories exist
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR);
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);

// ── In-memory session state ───────────────────────────────────────────────────
let state = createFreshState();

// ── Simple admin auth (token stored in-memory) ─────────────────────────────────
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme';
const ADMIN_COOKIE_NAME = 'admin-token';
const validAdminTokens = new Set();

function parseCookiesFromHeader(cookieHeader) {
  if (!cookieHeader) return {};
  return Object.fromEntries(
    cookieHeader.split(/;\s*/).map((c) => {
      const idx = c.indexOf('=');
      if (idx === -1) return [c, ''];
      return [decodeURIComponent(c.slice(0, idx)), decodeURIComponent(c.slice(idx + 1))];
    })
  );
}

function isRequestAuthenticated(req) {
  const cookies = parseCookiesFromHeader(req.headers.cookie);
  const token = cookies[ADMIN_COOKIE_NAME];
  return token && validAdminTokens.has(token);
}

function createFreshState() {
  return {
    sessionId:     uuidv4(),
    phase:         'setup',       // 'setup' | 'active' | 'finished'
    solutionWord:  '',
    revealOrder:   [],            // array of { letter, index } in reveal sequence
    revealedCount: 0,
    currentWords:  [],            // { text, ts } – only words in the live cloud
    allWords:      [],            // { text, ts } – every word ever typed this session
    finishImage:   null,          // base64 data-URL of finish picture
    clearedRounds: [],            // snapshot of currentWords before each clear
    uploadToken:   uuidv4(),      // reusable token for the QR upload link
    uploads:       [],            // { id, filename, originalName, ts } of gallery pictures
    galleryTitle:  'Savanna Cloud', // editable headline for upload + gallery pages
    uploadDescription: 'Add your photos to the shared wall. Pick one or more pictures from your phone and hit upload — they show up live for everyone.', // editable blurb on the upload page
    startedAt:     null,
  };
}

function saveSession(s) {
  const file = path.join(SESSIONS_DIR, `${s.sessionId}.json`);
  fs.writeFileSync(file, JSON.stringify(s, null, 2));
}

function publicState() {
  // Send everything needed by both screens
  return {
    sessionId:     state.sessionId,
    phase:         state.phase,
    solutionWord:  state.solutionWord,
    revealOrder:   state.revealOrder,
    revealedCount: state.revealedCount,
    currentWords:  state.currentWords,
    allWords:      state.allWords,
    finishImage:   state.finishImage,
    uploads:       state.uploads.map((u) => ({ id: u.id, url: `/uploads/${u.filename}`, originalName: u.originalName, ts: u.ts, size: u.size || 0 })),
    galleryTitle:  state.galleryTitle,
    uploadDescription: state.uploadDescription,
    startedAt:     state.startedAt,
  };
}

// ── Socket.IO ─────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  // Determine whether this socket belongs to an authenticated admin
  const cookies = parseCookiesFromHeader(socket.handshake.headers.cookie);
  socket.isAdmin = !!(cookies[ADMIN_COOKIE_NAME] && validAdminTokens.has(cookies[ADMIN_COOKIE_NAME]));
  console.log('Client connected:', socket.id, 'isAdmin=', socket.isAdmin);

  // Send current state immediately on connect
  socket.emit('stateUpdate', publicState());

  // ── Admin: configure session ──────────────────────────────────────────────
  socket.on('setSolution', ({ word, revealOrder }) => {
    if (!socket.isAdmin) { socket.emit('error', 'not-authorized'); return; }
    if (state.phase !== 'setup') return;
    state.solutionWord = word.toUpperCase().trim();

    // Build unique-letter reveal order (spaces excluded).
    // revealOrder is an optional array of unique letter strings in desired order,
    // e.g. ['T','E','A','M'].  If not provided, derive from order of first appearance.
    const unique = [];
    const seen   = new Set();
    for (const ch of state.solutionWord) {
      if (ch !== ' ' && !seen.has(ch)) { seen.add(ch); unique.push(ch); }
    }

    if (revealOrder && Array.isArray(revealOrder) && revealOrder.length === unique.length) {
      state.revealOrder = revealOrder.map((letter) => ({ letter: letter.toUpperCase() }));
    } else {
      state.revealOrder = unique.map((letter) => ({ letter }));
    }

    io.emit('stateUpdate', publicState());
  });

  socket.on('setFinishImage', ({ dataUrl }) => {
    if (!socket.isAdmin) { socket.emit('error', 'not-authorized'); return; }
    state.finishImage = dataUrl;
    io.emit('stateUpdate', publicState());
  });

  socket.on('setGalleryTitle', ({ title }) => {
    if (!socket.isAdmin) { socket.emit('error', 'not-authorized'); return; }
    const clean = (typeof title === 'string' ? title : '').trim().slice(0, 80);
    state.galleryTitle = clean || 'Savanna Cloud';
    io.emit('stateUpdate', publicState());
  });

  socket.on('setUploadDescription', ({ description }) => {
    if (!socket.isAdmin) { socket.emit('error', 'not-authorized'); return; }
    state.uploadDescription = (typeof description === 'string' ? description : '').trim().slice(0, 400);
    io.emit('stateUpdate', publicState());
  });

  // ── Admin: start session (words first, reveal starts later) ───────────────
  socket.on('startSession', () => {
    if (!socket.isAdmin) { socket.emit('error', 'not-authorized'); return; }
    if (state.phase !== 'setup' || !state.solutionWord) return;
    state.phase = 'active';
    state.startedAt = new Date().toISOString();
    state.revealedCount = 0;   // wait for the first reveal until after words are entered
    io.emit('stateUpdate', publicState());
  });

  // ── Admin: add a word to the live cloud ──────────────────────────────────
  socket.on('addWord', ({ text }) => {
    if (state.phase !== 'active') return;
    const entry = { text: text.trim(), ts: new Date().toISOString() };
    state.currentWords.push(entry);
    state.allWords.push(entry);
    io.emit('wordAdded', { word: entry, currentWords: state.currentWords });
  });

  // ── Admin: reveal next letter + clear live cloud ──────────────────────────
  socket.on('revealNext', () => {
    if (!socket.isAdmin) { socket.emit('error', 'not-authorized'); return; }
    if (state.phase !== 'active') return;
    if (state.revealedCount >= state.revealOrder.length) return;

    // Snapshot the current cloud before clearing
    state.clearedRounds.push([...state.currentWords]);
    state.currentWords = [];
    state.revealedCount += 1;

    io.emit('stateUpdate', publicState());
    io.emit('letterRevealed', { revealedCount: state.revealedCount });
  });

  // ── Admin: finish session ─────────────────────────────────────────────────
  socket.on('finishSession', () => {
    if (!socket.isAdmin) { socket.emit('error', 'not-authorized'); return; }
    if (state.phase !== 'active') return;
    state.phase = 'finished';
    saveSession(state);
    io.emit('stateUpdate', publicState());
    io.emit('sessionFinished', { allWords: state.allWords, finishImage: state.finishImage });
  });

  // ── Admin: restart (new session, old one already persisted) ──────────────
  socket.on('restartSession', () => {
    if (!socket.isAdmin) { socket.emit('error', 'not-authorized'); return; }
    state = createFreshState();
    io.emit('stateUpdate', publicState());
    io.emit('sessionRestarted');
  });

  // ── Admin: list saved sessions ────────────────────────────────────────────
  socket.on('listSessions', () => {
    if (!socket.isAdmin) { socket.emit('error', 'not-authorized'); return; }
    const files = fs.readdirSync(SESSIONS_DIR).filter((f) => f.endsWith('.json'));
    const sessions = files.map((f) => {
      const s = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, f)));
      return {
        sessionId:   s.sessionId,
        solutionWord: s.solutionWord,
        startedAt:   s.startedAt,
        wordCount:   s.allWords.length,
      };
    });
    socket.emit('sessionList', sessions);
  });

  // ── Admin: load a past session for review ────────────────────────────────
  socket.on('loadSession', ({ sessionId }) => {
    if (!socket.isAdmin) { socket.emit('error', 'not-authorized'); return; }
    const file = path.join(SESSIONS_DIR, `${sessionId}.json`);
    if (!fs.existsSync(file)) return;
    const s = JSON.parse(fs.readFileSync(file));
    socket.emit('sessionLoaded', s);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// ── Static files ──────────────────────────────────────────────────────────────
// Parse form bodies for login and JSON bodies for uploads (base64 data URLs)
app.use(express.urlencoded({ extended: false }));
app.use(express.json({ limit: '25mb' }));

// Serve uploaded gallery pictures (public)
app.use('/uploads', express.static(UPLOADS_DIR));

// Protect admin assets and /admin route by redirecting to a login page
app.use((req, res, next) => {
  const adminPaths = [
    '/admin', '/admin.html', '/js/admin.js', '/css/admin.css'
  ];
  if (adminPaths.includes(req.path) || req.path.startsWith('/js/admin') || req.path.startsWith('/css/admin')) {
    if (isRequestAuthenticated(req)) return next();
    return res.redirect('/admin-login.html');
  }
  next();
});

// Serve static files after the auth guard so admin files are checked
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (_, res) => res.redirect('/audience.html'));
app.get('/admin', (_, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

// Login endpoint
app.post('/admin-login', (req, res) => {
  const pw = req.body?.password || '';
  if (pw === ADMIN_PASSWORD) {
    const token = uuidv4();
    validAdminTokens.add(token);
    // Set cookie for admin token
    res.cookie(ADMIN_COOKIE_NAME, token, { httpOnly: true, path: '/' });
    return res.redirect('/admin');
  }
  return res.redirect('/admin-login.html?err=1');
});

// Logout
app.get('/admin-logout', (req, res) => {
  const cookies = parseCookiesFromHeader(req.headers.cookie);
  const token = cookies[ADMIN_COOKIE_NAME];
  if (token) validAdminTokens.delete(token);
  res.clearCookie(ADMIN_COOKIE_NAME, { path: '/' });
  res.redirect('/admin-login.html');
});

// ── Gallery uploads API ────────────────────────────────────────────────────────
// Admin: fetch the reusable upload token used to build the QR link
app.get('/api/upload-token', (req, res) => {
  if (!isRequestAuthenticated(req)) return res.status(401).json({ error: 'unauthorized' });
  res.json({ token: state.uploadToken });
});

// Public: current display config (headline title) for upload + gallery pages
app.get('/api/config', (_, res) => {
  res.json({ galleryTitle: state.galleryTitle, uploadDescription: state.uploadDescription });
});

// Public: list uploaded pictures for the gallery
app.get('/api/uploads', (_, res) => {
  res.json(state.uploads.map((u) => ({
    id: u.id,
    url: `/uploads/${u.filename}`,
    originalName: u.originalName,
    ts: u.ts,
    size: u.size || 0,
  })));
});

// Upload a picture (protected by the reusable QR token, not admin login)
const ALLOWED_IMAGE_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
app.post('/api/upload', (req, res) => {
  const { token, dataUrl, name } = req.body || {};
  if (!token || token !== state.uploadToken) return res.status(403).json({ error: 'invalid-token' });
  if (typeof dataUrl !== 'string') return res.status(400).json({ error: 'no-data' });

  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return res.status(400).json({ error: 'bad-format' });
  const mime = match[1];
  const ext = ALLOWED_IMAGE_EXT[mime];
  if (!ext) return res.status(400).json({ error: 'unsupported-type' });

  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > 15 * 1024 * 1024) return res.status(413).json({ error: 'too-large' });

  const id = uuidv4();
  const filename = `${id}.${ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);

  const entry = {
    id,
    filename,
    originalName: typeof name === 'string' ? name.slice(0, 120) : filename,
    ts: new Date().toISOString(),
    size: buffer.length,
  };
  state.uploads.push(entry);

  const publicEntry = { id: entry.id, url: `/uploads/${filename}`, originalName: entry.originalName, ts: entry.ts, size: entry.size };
  io.emit('uploadAdded', publicEntry);
  io.emit('stateUpdate', publicState());
  res.json({ ok: true, upload: publicEntry });
});

// Admin: delete an uploaded picture
app.delete('/api/uploads/:id', (req, res) => {
  if (!isRequestAuthenticated(req)) return res.status(401).json({ error: 'unauthorized' });
  const idx = state.uploads.findIndex((u) => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'not-found' });
  const [removed] = state.uploads.splice(idx, 1);
  try { fs.unlinkSync(path.join(UPLOADS_DIR, removed.filename)); } catch (_) { /* already gone */ }
  io.emit('uploadRemoved', { id: removed.id });
  io.emit('stateUpdate', publicState());
  res.json({ ok: true });
});

// Admin: export the full current session as JSON (words, solution, reveal order, uploads)
app.get('/api/export', (req, res) => {
  if (!isRequestAuthenticated(req)) return res.status(401).json({ error: 'unauthorized' });
  res.json({
    sessionId:     state.sessionId,
    phase:         state.phase,
    solutionWord:  state.solutionWord,
    revealOrder:   state.revealOrder,
    revealedCount: state.revealedCount,
    allWords:      state.allWords,
    currentWords:  state.currentWords,
    finishImage:   state.finishImage,
    uploads:       state.uploads.map((u) => ({ id: u.id, url: `/uploads/${u.filename}`, originalName: u.originalName, ts: u.ts, size: u.size || 0 })),
    startedAt:     state.startedAt,
    exportedAt:    new Date().toISOString(),
  });
});

server.listen(PORT, () => {
  console.log(`\n  Word Cloud Server running at http://localhost:${PORT}`);
  console.log(`  Audience view : http://localhost:${PORT}/audience.html`);
  console.log(`  Admin view    : http://localhost:${PORT}/admin\n`);
});
