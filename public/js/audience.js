/* audience.js – Projector / Audience View */

const socket = io();

// ── DOM refs ──────────────────────────────────────────────────────────────────
const answerBoxes = document.getElementById('answer-boxes');
const answerLabel = document.getElementById('answer-label');
const answerPanel = document.getElementById('answer-panel');
const panelDivider = document.getElementById('panel-divider');
const cloudCanvas = document.getElementById('cloud-canvas');
const cloudWrapper = document.getElementById('cloud-wrapper');
const finishOverlay = document.getElementById('finish-overlay');
const finishImg = document.getElementById('finish-img');
const phaseBanner = document.getElementById('phase-banner');

// ── Local state ───────────────────────────────────────────────────────────────
let currentState = null;
let renderTimer = null;
let isDraggingDivider = false;
let resizeRaf = null;
let pendingPanelWidth = null;

const MIN_ANSWER_PANEL_WIDTH = 200;
const MIN_CLOUD_PANEL_WIDTH = 220;
const DIVIDER_WIDTH = 10;

function getCloudRenderWords() {
    if (!currentState) return [];
    return currentState.phase === 'finished' ? (currentState.allWords || []) : (currentState.currentWords || []);
}

function refreshCloudForCurrentState(animate = false) {
    if (!currentState) return;
    const words = getCloudRenderWords();
    renderCloud(words, animate);
}

function applyPanelWidth(widthPx) {
    const maxWidth = window.innerWidth - MIN_CLOUD_PANEL_WIDTH - DIVIDER_WIDTH;
    const clamped = Math.max(MIN_ANSWER_PANEL_WIDTH, Math.min(widthPx, maxWidth));
    answerPanel.style.width = `${clamped}px`;
    answerPanel.style.flex = '0 0 auto';
    refreshCloudForCurrentState(false);
}

function schedulePanelResize(widthPx) {
    pendingPanelWidth = widthPx;
    if (resizeRaf) return;
    resizeRaf = window.requestAnimationFrame(() => {
        resizeRaf = null;
        if (pendingPanelWidth != null) {
            applyPanelWidth(pendingPanelWidth);
        }
    });
}

// ── Canvas sizing ─────────────────────────────────────────────────────────────
function sizeCanvas() {
    const rect = cloudWrapper.getBoundingClientRect();
    cloudCanvas.width = Math.floor(rect.width);
    cloudCanvas.height = Math.floor(rect.height);
}

window.addEventListener('resize', () => {
    sizeCanvas();
    if (currentState) refreshCloudForCurrentState(false);
});

if (answerPanel) {
    applyPanelWidth(answerPanel.getBoundingClientRect().width);
}

panelDivider.addEventListener('mousedown', (e) => {
    e.preventDefault();
    isDraggingDivider = true;
    document.body.classList.add('resizing');
});

document.addEventListener('mousemove', (e) => {
    if (!isDraggingDivider) return;
    schedulePanelResize(e.clientX);
});

document.addEventListener('mouseup', () => {
    if (!isDraggingDivider) return;
    isDraggingDivider = false;
    document.body.classList.remove('resizing');
});

// ── Render word cloud ─────────────────────────────────────────────────────────
function wordListToFreq(words) {
    const freq = {};
    words.forEach(({ text }) => {
        const key = text.toLowerCase();
        freq[key] = (freq[key] || 0) + 1;
    });
    return Object.entries(freq).map(([text, count]) => [text, count]);
}

function renderCloud(words, animate = true) {
    clearTimeout(renderTimer);
    sizeCanvas();

    const list = wordListToFreq(words);
    if (!list.length) {
        const ctx = cloudCanvas.getContext('2d');
        ctx.clearRect(0, 0, cloudCanvas.width, cloudCanvas.height);
        return;
    }

    // Sort descending so most frequent words get best placement
    list.sort((a, b) => b[1] - a[1]);

    const maxCount = list[0][1];
    const minFont = 22;
    const maxFont = Math.min(Math.floor(cloudCanvas.height * 0.2), 160);

    // Darker tones so words pop on a light background
    const palette = [
        '#8C9273', '#717B66', '#90997F', '#7F8B82', '#6D7A6A',
        '#7A6654', '#705848', '#8E7463', '#6F5B4C',
        '#5F4D42', '#7C7C7A', '#6A6C6E', '#8D908F',
        '#494949', '#5E5E5A'
    ];

    WordCloud(cloudCanvas, {
        list,
        weightFactor: (size) => {
            const norm = size / maxCount;
            return minFont + norm * (maxFont - minFont);
        },
        fontFamily: "'Segoe UI', Arial, sans-serif",
        fontWeight: '700',
        color: () => palette[Math.floor(Math.random() * palette.length)],
        rotateRatio: 0.25,
        rotationSteps: 2,
        backgroundColor: 'transparent',
        drawMask: false,
        shuffle: true,
        wait: animate ? 15 : 0,
        gridSize: Math.round(cloudCanvas.width / 80),
        origin: [cloudCanvas.width / 2, cloudCanvas.height / 2],
    });
}

// ── Build answer boxes ────────────────────────────────────────────────────────
function buildBoxes(word, revealOrder, revealedCount) {
    answerBoxes.innerHTML = '';
    if (!word) {
        answerLabel.textContent = '?';
        return;
    }

    answerLabel.textContent = 'Lösung';

    // revealOrder contains unique letters in reveal sequence.
    // Build the set of currently revealed letters and the "current" (latest) letter.
    const revealedLetters = new Set();
    let currentLetter = null;
    for (let i = 0; i < revealedCount && i < revealOrder.length; i++) {
        revealedLetters.add(revealOrder[i].letter.toUpperCase());
        if (i === revealedCount - 1) currentLetter = revealOrder[i].letter.toUpperCase();
    }

    // Create a box or spacer for each character
    word.split('').forEach((char) => {
        if (char === ' ') {
            // Render as invisible spacer – no box
            const spacer = document.createElement('div');
            spacer.className = 'letter-space';
            answerBoxes.appendChild(spacer);
            return;
        }

        const upper = char.toUpperCase();
        const div = document.createElement('div');
        div.className = 'letter-box';

        if (revealedLetters.has(upper)) {
            div.textContent = upper;
            if (upper === currentLetter) {
                div.classList.add('revealed', 'current');
            } else {
                div.classList.add('revealed');
            }
        }

        answerBoxes.appendChild(div);
    });
}

// ── Apply full state ──────────────────────────────────────────────────────────
function applyState(state) {
    currentState = state;

    const { phase, solutionWord, revealOrder, revealedCount, currentWords, allWords, finishImage } = state;

    // Answer boxes
    buildBoxes(solutionWord, revealOrder, revealedCount);

    // Phase banner
    if (phase === 'setup') {
        phaseBanner.textContent = 'Warten bis Session beginnt…';
        phaseBanner.classList.remove('hidden');
    } else {
        phaseBanner.classList.add('hidden');
    }

    // Word cloud & finish
    if (phase === 'finished') {
        finishOverlay.classList.remove('hidden');
        if (finishImage) {
            finishImg.src = finishImage;
        } else {
            finishImg.src = '';
            finishOverlay.classList.add('hidden'); // no image, just hide overlay
        }
        // Render final cloud from ALL words
        renderCloud(allWords, true);
    } else {
        finishOverlay.classList.add('hidden');
        renderCloud(currentWords, false);
    }
}

// ── Socket events ─────────────────────────────────────────────────────────────
socket.on('stateUpdate', (state) => {
    applyState(state);
});

socket.on('wordAdded', ({ currentWords }) => {
    if (!currentState) return;
    currentState.currentWords = currentWords;
    // Debounce rapid adds – re-render after 400 ms of silence
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => renderCloud(currentWords, true), 400);
});

socket.on('letterRevealed', ({ revealedCount }) => {
    if (!currentState) return;
    currentState.revealedCount = revealedCount;
    currentState.currentWords = [];

    // Animate reveal: briefly remove then re-add the newly revealed box class
    buildBoxes(currentState.solutionWord, currentState.revealOrder, revealedCount);

    // Clear cloud canvas immediately
    const ctx = cloudCanvas.getContext('2d');
    ctx.clearRect(0, 0, cloudCanvas.width, cloudCanvas.height);
});

socket.on('sessionFinished', ({ allWords, finishImage }) => {
    if (!currentState) return;
    currentState.phase = 'finished';
    currentState.allWords = allWords;
    currentState.finishImage = finishImage;
    applyState(currentState);
});

socket.on('sessionRestarted', () => {
    currentState = null;
    answerBoxes.innerHTML = '';
    answerLabel.textContent = '?';
    finishOverlay.classList.add('hidden');
    phaseBanner.textContent = 'Warten bis Session beginnt…';
    phaseBanner.classList.remove('hidden');
    const ctx = cloudCanvas.getContext('2d');
    ctx.clearRect(0, 0, cloudCanvas.width, cloudCanvas.height);
});
