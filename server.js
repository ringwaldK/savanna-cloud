const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const SESSIONS_DIR = path.join(__dirname, 'sessions');

// Ensure sessions directory exists
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR);

// ── In-memory session state ───────────────────────────────────────────────────
let state = createFreshState();

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
    startedAt:     state.startedAt,
  };
}

// ── Socket.IO ─────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Send current state immediately on connect
  socket.emit('stateUpdate', publicState());

  // ── Admin: configure session ──────────────────────────────────────────────
  socket.on('setSolution', ({ word, revealOrder }) => {
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
    state.finishImage = dataUrl;
    io.emit('stateUpdate', publicState());
  });

  // ── Admin: start session (reveals first letter) ───────────────────────────
  socket.on('startSession', () => {
    if (state.phase !== 'setup' || !state.solutionWord) return;
    state.phase = 'active';
    state.startedAt = new Date().toISOString();
    state.revealedCount = 1;   // reveal the very first letter on start
    io.emit('stateUpdate', publicState());
    io.emit('letterRevealed', { revealedCount: state.revealedCount });
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
    if (state.phase !== 'active') return;
    state.phase = 'finished';
    saveSession(state);
    io.emit('stateUpdate', publicState());
    io.emit('sessionFinished', { allWords: state.allWords, finishImage: state.finishImage });
  });

  // ── Admin: restart (new session, old one already persisted) ──────────────
  socket.on('restartSession', () => {
    state = createFreshState();
    io.emit('stateUpdate', publicState());
    io.emit('sessionRestarted');
  });

  // ── Admin: list saved sessions ────────────────────────────────────────────
  socket.on('listSessions', () => {
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
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (_, res) => res.redirect('/audience.html'));
app.get('/admin', (_, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

server.listen(PORT, () => {
  console.log(`\n  Word Cloud Server running at http://localhost:${PORT}`);
  console.log(`  Audience view : http://localhost:${PORT}/audience.html`);
  console.log(`  Admin view    : http://localhost:${PORT}/admin\n`);
});
