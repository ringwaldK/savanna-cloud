/* admin.js – Facilitator / Admin View */

const socket = io();

// ── DOM refs ──────────────────────────────────────────────────────────────────
const connBadge        = document.getElementById('connection-status');
const solutionInput    = document.getElementById('solution-input');
const revealOrderGroup = document.getElementById('reveal-order-group');
const revealOrderList  = document.getElementById('reveal-order-list');
const btnResetOrder    = document.getElementById('btn-reset-order');
const btnShuffleOrder  = document.getElementById('btn-shuffle-order');
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

btnShuffleOrder.addEventListener('click', () => {
  if (revealOrder.length < 2) return;
  // Fisher–Yates shuffle of the current unique-letter order
  for (let i = revealOrder.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [revealOrder[i], revealOrder[j]] = [revealOrder[j], revealOrder[i]];
  }
  renderRevealChips();
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

// ── Photo wall QR code ────────────────────────────────────────────────────────
const qrCodeEl    = document.getElementById('qr-code');
const uploadLink  = document.getElementById('upload-link');
const btnCopyLink = document.getElementById('btn-copy-link');
const statUploads = document.getElementById('stat-uploads');
const uploadThumbs = document.getElementById('upload-thumbs');
let qrInstance    = null;

async function initUploadQr() {
  try {
    const res = await fetch('/api/upload-token');
    if (!res.ok) return;
    const { token } = await res.json();
    const url = `${location.origin}/upload.html?token=${encodeURIComponent(token)}`;
    uploadLink.value = url;
    qrCodeEl.innerHTML = '';
    if (window.QRCode) {
      qrInstance = new QRCode(qrCodeEl, {
        text: url,
        width: 180,
        height: 180,
        colorDark: '#101010',
        colorLight: '#ffffff',
      });
    }
  } catch (_) { /* ignore */ }
}

btnCopyLink?.addEventListener('click', async () => {
  if (!uploadLink.value) return;
  try {
    await navigator.clipboard.writeText(uploadLink.value);
    btnCopyLink.textContent = 'Copied!';
    setTimeout(() => { btnCopyLink.textContent = 'Copy link'; }, 1500);
  } catch (_) {
    uploadLink.select();
    document.execCommand('copy');
  }
});

function updateUploadCount(state) {
  const uploads = state?.uploads ?? [];
  const totalBytes = uploads.reduce((sum, u) => sum + (u.size || 0), 0);
  if (statUploads) statUploads.textContent = `${uploads.length} · ${formatBytes(totalBytes)}`;
  renderUploadThumbs(uploads);
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(val >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function renderUploadThumbs(uploads) {
  if (!uploadThumbs) return;
  uploadThumbs.innerHTML = '';
  [...uploads].reverse().forEach((u) => {
    const cell = document.createElement('div');
    cell.className = 'thumb';
    const img = document.createElement('img');
    img.src = u.url;
    img.alt = u.originalName || 'Uploaded picture';
    img.loading = 'lazy';
    const del = document.createElement('button');
    del.className = 'thumb-del';
    del.title = 'Delete picture';
    del.textContent = '×';
    del.addEventListener('click', () => deleteUpload(u.id));
    cell.appendChild(img);
    cell.appendChild(del);
    uploadThumbs.appendChild(cell);
  });
}

async function deleteUpload(id) {
  try {
    const res = await fetch(`/api/uploads/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) return;
    if (currentState?.uploads) {
      currentState.uploads = currentState.uploads.filter((u) => u.id !== id);
    }
  } catch (_) { /* ignore */ }
}

socket.on('uploadAdded', () => {
  if (currentState) {
    currentState.uploads = [...(currentState.uploads || [])];
  }
});
socket.on('stateUpdate', (state) => updateUploadCount(state));

initUploadQr();

// ── Gallery / upload headline ─────────────────────────────────────────────────
const galleryTitleInput = document.getElementById('gallery-title-input');
const btnSaveTitle      = document.getElementById('btn-save-title');
let titleDirty = false;

galleryTitleInput?.addEventListener('input', () => { titleDirty = true; });

btnSaveTitle?.addEventListener('click', () => {
  const title = galleryTitleInput.value.trim();
  socket.emit('setGalleryTitle', { title });
  titleDirty = false;
  btnSaveTitle.textContent = 'Saved!';
  setTimeout(() => { btnSaveTitle.textContent = 'Save'; }, 1500);
});

socket.on('stateUpdate', (state) => {
  if (galleryTitleInput && !titleDirty && typeof state.galleryTitle === 'string') {
    galleryTitleInput.value = state.galleryTitle;
  }
});

// ── Upload page description ───────────────────────────────────────────────────
const uploadDescInput = document.getElementById('upload-desc-input');
const btnSaveDesc     = document.getElementById('btn-save-desc');
let descDirty = false;

uploadDescInput?.addEventListener('input', () => { descDirty = true; });

btnSaveDesc?.addEventListener('click', () => {
  socket.emit('setUploadDescription', { description: uploadDescInput.value });
  descDirty = false;
  btnSaveDesc.textContent = 'Saved!';
  setTimeout(() => { btnSaveDesc.textContent = 'Save description'; }, 1500);
});

socket.on('stateUpdate', (state) => {
  if (uploadDescInput && !descDirty && typeof state.uploadDescription === 'string') {
    uploadDescInput.value = state.uploadDescription;
  }
});

// ── Session export (ZIP) ──────────────────────────────────────────────────────
const btnExport    = document.getElementById('btn-export');
const exportStatus = document.getElementById('export-status');
const exportCanvas = document.getElementById('export-canvas');

function setExportStatus(msg) { if (exportStatus) exportStatus.textContent = msg; }

function renderCloudToCanvas(words) {
  return new Promise((resolve) => {
    const freq = {};
    (words || []).forEach(({ text }) => {
      const key = (text || '').toLowerCase();
      if (key) freq[key] = (freq[key] || 0) + 1;
    });
    const list = Object.entries(freq);
    const ctx = exportCanvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    if (!list.length || !window.WordCloud) { resolve(); return; }
    const maxCount = Math.max(...list.map((e) => e[1]));
    WordCloud(exportCanvas, {
      list,
      weightFactor: (s) => 24 + (s / maxCount) * 120,
      fontFamily: "'Segoe UI', Arial, sans-serif",
      fontWeight: '700',
      color: () => ['#C8102E', '#101820', '#3A3A3A', '#6A6A6A', '#8A0A20'][Math.floor(Math.random() * 5)],
      backgroundColor: '#ffffff',
      rotateRatio: 0.2,
      gridSize: 8,
      wait: 0,
    });
    // wordcloud2 renders synchronously enough for a static canvas; give it a tick
    setTimeout(resolve, 400);
  });
}

async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return res.blob();
}

btnExport?.addEventListener('click', async () => {
  if (!window.JSZip) { setExportStatus('Export library not loaded.'); return; }
  setExportStatus('Building ZIP…');
  btnExport.disabled = true;
  try {
    const res = await fetch('/api/export');
    if (!res.ok) throw new Error('export-failed');
    const data = await res.json();

    const zip = new JSZip();

    // Session metadata
    zip.file('session.json', JSON.stringify(data, null, 2));

    // Solution + reveal order as readable text
    const revealLetters = (data.revealOrder || []).map((r) => r.letter).join(' ');
    const wordsText = (data.allWords || []).map((w) => w.text).join('\n');
    zip.file('solution.txt',
      `Solution word: ${data.solutionWord || '(none)'}\n` +
      `Reveal order : ${revealLetters}\n` +
      `Total words  : ${(data.allWords || []).length}\n`);
    zip.file('words.txt', wordsText);

    // Word cloud image
    await renderCloudToCanvas(data.allWords || data.currentWords || []);
    const cloudBlob = await dataUrlToBlob(exportCanvas.toDataURL('image/png'));
    zip.file('word-cloud.png', cloudBlob);

    // Finish image (if any)
    if (data.finishImage && data.finishImage.startsWith('data:')) {
      const ext = /image\/(\w+)/.exec(data.finishImage)?.[1] || 'png';
      zip.file(`finish-image.${ext}`, await dataUrlToBlob(data.finishImage));
    }

    // Uploaded pictures
    const picsFolder = zip.folder('pictures');
    for (let i = 0; i < (data.uploads || []).length; i++) {
      const u = data.uploads[i];
      try {
        const blob = await (await fetch(u.url)).blob();
        const ext = (u.url.split('.').pop() || 'jpg').split('?')[0];
        const safe = (u.originalName || `picture-${i + 1}`).replace(/[^\w.\-]+/g, '_');
        picsFolder.file(`${String(i + 1).padStart(2, '0')}-${safe}.${ext}`, blob);
      } catch (_) { /* skip unreachable file */ }
    }

    const out = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(out);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    a.download = `session-${data.solutionWord || 'export'}-${stamp}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
    setExportStatus('Downloaded.');
    setTimeout(() => setExportStatus(''), 3000);
  } catch (e) {
    setExportStatus('Export failed.');
  } finally {
    btnExport.disabled = false;
  }
});
