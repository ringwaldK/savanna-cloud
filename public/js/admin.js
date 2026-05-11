/* admin.js – Facilitator / Admin View */

const socket = io();

// ── DOM refs ──────────────────────────────────────────────────────────────────
const connBadge        = document.getElementById('connection-status');
const solutionInput    = document.getElementById('solution-input');
const revealOrderGroup = document.getElementById('reveal-order-group');
const revealOrderList  = document.getElementById('reveal-order-list');
const btnResetOrder    = document.getElementById('btn-reset-order');
const finishFileInput  = document.getElementById('finish-image-input');
const finishPreviewWrap= document.getElementById('finish-preview-wrap');
const finishPreview    = document.getElementById('finish-preview');
const btnClearImage    = document.getElementById('btn-clear-image');
const btnApplySetup    = document.getElementById('btn-apply-setup');
const setupStatus      = document.getElementById('setup-status');

const statPhase        = document.getElementById('stat-phase');
const statSolution     = document.getElementById('stat-solution');
const statRevealed     = document.getElementById('stat-revealed');
const statAllWords     = document.getElementById('stat-all-words');
const statCurrentWords = document.getElementById('stat-current-words');
const adminLetterBoxes = document.getElementById('admin-letter-boxes');

const btnStart         = document.getElementById('btn-start');
const btnReveal        = document.getElementById('btn-reveal');
const btnFinish        = document.getElementById('btn-finish');
const btnRestart       = document.getElementById('btn-restart');

const wordInput        = document.getElementById('word-input');
const btnAddWord       = document.getElementById('btn-add-word');
const wordLogList      = document.getElementById('word-log-list');
const cloudWordCount   = document.getElementById('cloud-word-count');

const btnLoadSessions  = document.getElementById('btn-load-sessions');
const sessionListEl    = document.getElementById('session-list');

// ── Local state ───────────────────────────────────────────────────────────────
let currentState  = null;
let finishDataUrl = null;
let revealOrder   = [];   // array of { index, letter } as user arranges them
let dragSrc       = null;

// ── Connection ────────────────────────────────────────────────────────────────
socket.on('connect', () => {
  connBadge.textContent = 'Online';
  connBadge.className   = 'badge badge--online';
});
socket.on('disconnect', () => {
  connBadge.textContent = 'Offline';
  connBadge.className   = 'badge badge--offline';
});

// ── Reveal order drag-and-drop ───────────────────────────────────────────────
function buildRevealOrderUI(word) {
  // Deduplicate: only one chip per unique letter (spaces excluded)
  const seen = new Set();
  revealOrder = [];
  for (const ch of word.toUpperCase()) {
    if (ch !== ' ' && !seen.has(ch)) {
      seen.add(ch);
      revealOrder.push({ letter: ch });
    }
  }
  renderRevealChips();
  revealOrderGroup.classList.add('visible');
}

function renderRevealChips() {
  revealOrderList.innerHTML = '';
  revealOrder.forEach((item, pos) => {
    const chip = document.createElement('div');
    chip.className   = 'reveal-chip';
    chip.draggable   = true;
    chip.dataset.pos = pos;
    chip.innerHTML   = `<span class="chip-order">${pos + 1}.</span> ${item.letter}`;

    chip.addEventListener('dragstart', (e) => {
      dragSrc = pos;
      chip.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    chip.addEventListener('dragend', () => chip.classList.remove('dragging'));
    chip.addEventListener('dragover', (e) => { e.preventDefault(); chip.classList.add('drag-over'); });
    chip.addEventListener('dragleave', () => chip.classList.remove('drag-over'));
    chip.addEventListener('drop', (e) => {
      e.preventDefault();
      chip.classList.remove('drag-over');
      if (dragSrc === null || dragSrc === pos) return;
      const moved = revealOrder.splice(dragSrc, 1)[0];
      revealOrder.splice(pos, 0, moved);
      dragSrc = null;
      renderRevealChips();
    });

    revealOrderList.appendChild(chip);
  });
}

btnResetOrder.addEventListener('click', () => {
  if (!solutionInput.value.trim()) return;
  buildRevealOrderUI(solutionInput.value.trim());
});

solutionInput.addEventListener('input', () => {
  const w = solutionInput.value.trim().toUpperCase();
  if (w.length > 0) buildRevealOrderUI(w);
  else revealOrderGroup.classList.remove('visible');
});

// ── Finish image ──────────────────────────────────────────────────────────────
finishFileInput.addEventListener('change', () => {
  const file = finishFileInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    finishDataUrl = e.target.result;
    finishPreview.src = finishDataUrl;
    finishPreviewWrap.classList.remove('hidden');
  };
  reader.readAsDataURL(file);
});

btnClearImage.addEventListener('click', () => {
  finishDataUrl = null;
  finishFileInput.value = '';
  finishPreview.src = '';
  finishPreviewWrap.classList.add('hidden');
});

// ── Apply Setup ───────────────────────────────────────────────────────────────
btnApplySetup.addEventListener('click', () => {
  const word = solutionInput.value.trim().toUpperCase();
  if (!word) { flashStatus('Enter a solution word first.', 'error'); return; }
  if (currentState && currentState.phase !== 'setup') {
    flashStatus('Cannot change setup after session has started.', 'error'); return;
  }

  // Send unique letter strings in reveal order
  const orderLetters = revealOrder.map(item => item.letter);

  socket.emit('setSolution', { word, revealOrder: orderLetters });

  if (finishDataUrl) {
    socket.emit('setFinishImage', { dataUrl: finishDataUrl });
  }

  flashStatus(`Solution "${word}" applied.`, 'ok');
});

function flashStatus(msg, type) {
  setupStatus.textContent = msg;
  setupStatus.style.color = type === 'ok' ? '#77dd77' : '#ff7777';
  setTimeout(() => { setupStatus.textContent = ''; }, 3000);
}

// ── Session control buttons ───────────────────────────────────────────────────
btnStart.addEventListener('click', () => {
  if (!currentState?.solutionWord) {
    alert('Apply a solution word first.');
    return;
  }
  socket.emit('startSession');
});

btnReveal.addEventListener('click', () => {
  if (currentState?.revealedCount >= (currentState?.revealOrder?.length ?? 0)) {
    alert('All letters already revealed. Click Finish to end the session.');
    return;
  }
  socket.emit('revealNext');
});

btnFinish.addEventListener('click', () => {
  // Two-step confirm without blocking confirm(); first click arms, second fires
  if (btnFinish.dataset.armed === '1') {
    socket.emit('finishSession');
    btnFinish.dataset.armed = '0';
    btnFinish.textContent = '⬛ Finish Session';
  } else {
    btnFinish.dataset.armed = '1';
    btnFinish.textContent = '⬛ Click again to confirm!';
    setTimeout(() => {
      btnFinish.dataset.armed = '0';
      btnFinish.textContent = '⬛ Finish Session';
    }, 3000);
  }
});

btnRestart.addEventListener('click', () => {
  if (btnRestart.dataset.armed === '1') {
    socket.emit('restartSession');
    solutionInput.value = '';
    finishDataUrl = null;
    finishFileInput.value = '';
    finishPreview.src = '';
    finishPreviewWrap.classList.add('hidden');
    revealOrderGroup.classList.remove('visible');
    revealOrder = [];
    wordLogList.innerHTML = '';
    cloudWordCount.textContent = '0 words';
    btnRestart.dataset.armed = '0';
    btnRestart.textContent = '↺ Restart';
  } else {
    btnRestart.dataset.armed = '1';
    btnRestart.textContent = '↺ Click again to confirm!';
    setTimeout(() => {
      btnRestart.dataset.armed = '0';
      btnRestart.textContent = '↺ Restart';
    }, 3000);
  }
});

// ── Word input ────────────────────────────────────────────────────────────────
function submitWord() {
  const text = wordInput.value.trim();
  if (!text) return;
  socket.emit('addWord', { text });
  wordInput.value = '';
  wordInput.focus();
}

btnAddWord.addEventListener('click', submitWord);
wordInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') submitWord();
});

// ── Saved sessions ────────────────────────────────────────────────────────────
btnLoadSessions.addEventListener('click', () => {
  socket.emit('listSessions');
});

socket.on('sessionList', (sessions) => {
  sessionListEl.innerHTML = '';
  if (!sessions.length) {
    sessionListEl.innerHTML = '<p style="color:#555577;font-size:.8rem;padding:6px 0">No saved sessions yet.</p>';
    return;
  }
  sessions.sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''));
  sessions.forEach((s) => {
    const row = document.createElement('div');
    row.className = 'session-item';
    const dt = s.startedAt ? new Date(s.startedAt).toLocaleString() : 'Unknown date';
    row.innerHTML = `
      <div class="session-item-info">
        <div class="session-item-word">${s.solutionWord || '(no word)'}</div>
        <div class="session-item-meta">${dt} &bull; ${s.wordCount} words</div>
      </div>
      <button class="btn btn--ghost btn--sm" data-id="${s.sessionId}">Load</button>
    `;
    row.querySelector('button').addEventListener('click', () => {
      socket.emit('loadSession', { sessionId: s.sessionId });
    });
    sessionListEl.appendChild(row);
  });
});

socket.on('sessionLoaded', (s) => {
  // Show a summary modal / alert for now
  const words = (s.allWords || []).map(w => w.text).join(', ');
  alert(
    `Session: ${s.solutionWord}\n` +
    `Started: ${s.startedAt ? new Date(s.startedAt).toLocaleString() : 'Unknown'}\n` +
    `Total words: ${s.allWords?.length ?? 0}\n\n` +
    `Words: ${words.length > 300 ? words.slice(0, 300) + '…' : words}`
  );
});

// ── Apply state from server ───────────────────────────────────────────────────
function applyState(state) {
  currentState = state;
  const { phase, solutionWord, revealedCount, currentWords, allWords } = state;

  // Stats
  statPhase.textContent        = phase;
  statSolution.textContent     = solutionWord || '—';
  statRevealed.textContent     = `${revealedCount} / ${state.revealOrder?.length ?? 0}`;
  statAllWords.textContent     = allWords?.length ?? 0;
  statCurrentWords.textContent = currentWords?.length ?? 0;
  cloudWordCount.textContent   = `${currentWords?.length ?? 0} word${currentWords?.length !== 1 ? 's' : ''}`;

  // Admin letter boxes
  buildAdminLetterBoxes(state);

  // Button states
  const isSetup    = phase === 'setup';
  const isActive   = phase === 'active';
  const allRevealed = revealedCount >= (state.revealOrder?.length ?? 0);

  btnStart.disabled  = !isSetup || !solutionWord;
  btnReveal.disabled = !isActive || allRevealed;
  btnFinish.disabled = !isActive;
  wordInput.disabled = !isActive;
  btnAddWord.disabled= !isActive;

  if (isActive) wordInput.focus();
}

function buildAdminLetterBoxes(state) {
  adminLetterBoxes.innerHTML = '';
  const { solutionWord, revealOrder: order, revealedCount } = state;
  if (!solutionWord) return;

  // Build the set of revealed unique letters and the current (latest) one
  const revealedLetters = new Set();
  let currentLetter = null;
  for (let i = 0; i < revealedCount && i < (order?.length ?? 0); i++) {
    revealedLetters.add(order[i].letter.toUpperCase());
    if (i === revealedCount - 1) currentLetter = order[i].letter.toUpperCase();
  }

  solutionWord.split('').forEach((char) => {
    if (char === ' ') {
      const spacer = document.createElement('div');
      spacer.style.cssText = 'width:10px;height:44px;flex-shrink:0;';
      adminLetterBoxes.appendChild(spacer);
      return;
    }
    const upper = char.toUpperCase();
    const div = document.createElement('div');
    div.className = 'admin-letter-box';
    if (revealedLetters.has(upper)) {
      div.textContent = upper;
      div.classList.add('revealed');
      if (upper === currentLetter) div.classList.add('current');
    }
    adminLetterBoxes.appendChild(div);
  });
}

// ── Word log helpers ──────────────────────────────────────────────────────────
function addWordToLog(word) {
  const li = document.createElement('li');
  const ts = new Date(word.ts).toLocaleTimeString();
  li.innerHTML = `<span>${escapeHtml(word.text)}</span><span class="word-ts">${ts}</span>`;
  wordLogList.prepend(li);
}

function rebuildWordLog(words) {
  wordLogList.innerHTML = '';
  // show most recent first
  [...words].reverse().forEach((w) => addWordToLog(w));
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Socket events ─────────────────────────────────────────────────────────────
socket.on('stateUpdate', (state) => {
  applyState(state);
  rebuildWordLog(state.currentWords || []);
});

socket.on('wordAdded', ({ word, currentWords }) => {
  if (!currentState) return;
  currentState.currentWords = currentWords;
  currentState.allWords = [...(currentState.allWords || []), word];
  statCurrentWords.textContent = currentWords.length;
  statAllWords.textContent     = currentState.allWords.length;
  cloudWordCount.textContent   = `${currentWords.length} word${currentWords.length !== 1 ? 's' : ''}`;
  addWordToLog(word);
});

socket.on('letterRevealed', ({ revealedCount }) => {
  if (!currentState) return;
  currentState.revealedCount = revealedCount;
  currentState.currentWords  = [];
  wordLogList.innerHTML = '';
  cloudWordCount.textContent = '0 words';
  statCurrentWords.textContent = 0;
  statRevealed.textContent = `${revealedCount} / ${currentState.revealOrder?.length ?? 0}`;
  buildAdminLetterBoxes(currentState);
  btnReveal.disabled = revealedCount >= (currentState.revealOrder?.length ?? 0);
});

socket.on('sessionFinished', () => {
  if (!currentState) return;
  currentState.phase = 'finished';
  btnStart.disabled  = true;
  btnReveal.disabled = true;
  btnFinish.disabled = true;
  wordInput.disabled = true;
  btnAddWord.disabled= true;
  statPhase.textContent = 'finished';
});

socket.on('sessionRestarted', () => {
  currentState = null;
  wordLogList.innerHTML = '';
  cloudWordCount.textContent = '0 words';
  statPhase.textContent        = 'setup';
  statSolution.textContent     = '—';
  statRevealed.textContent     = '0 / 0';
  statAllWords.textContent     = '0';
  statCurrentWords.textContent = '0';
  adminLetterBoxes.innerHTML   = '';
  btnStart.disabled  = true;
  btnReveal.disabled = true;
  btnFinish.disabled = true;
  wordInput.disabled = true;
  btnAddWord.disabled= true;
});
