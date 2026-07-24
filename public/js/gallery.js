/* gallery.js – public photo wall */

const socket   = io();
const grid     = document.getElementById('grid');
const countEl  = document.getElementById('count');
const emptyEl  = document.getElementById('empty');
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightbox-img');
const lightboxClose = document.getElementById('lightbox-close');
const headlineEl = document.getElementById('headline');

let uploads = [];

function applyHeadline(title) {
  if (headlineEl && typeof title === 'string' && title.trim()) {
    headlineEl.textContent = title;
  }
}

function render() {
  grid.innerHTML = '';
  emptyEl.style.display = uploads.length ? 'none' : 'block';
  countEl.textContent = uploads.length;

  // newest first
  [...uploads].reverse().forEach((u) => {
    const fig = document.createElement('figure');
    fig.className = 'tile';
    const img = document.createElement('img');
    img.src = u.url;
    img.alt = u.originalName || 'Uploaded picture';
    img.loading = 'lazy';
    img.addEventListener('click', () => openLightbox(u.url, img.alt));
    const cap = document.createElement('figcaption');
    cap.textContent = u.originalName || '';
    fig.appendChild(img);
    if (u.originalName) fig.appendChild(cap);
    grid.appendChild(fig);
  });
}

function openLightbox(src, alt) {
  lightboxImg.src = src;
  lightboxImg.alt = alt || '';
  lightbox.classList.remove('hidden');
}
function closeLightbox() {
  lightbox.classList.add('hidden');
  lightboxImg.src = '';
}
lightboxClose.addEventListener('click', closeLightbox);
lightbox.addEventListener('click', (e) => { if (e.target === lightbox) closeLightbox(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLightbox(); });

async function loadInitial() {
  try {
    const res = await fetch('/api/uploads');
    uploads = await res.json();
    render();
  } catch (_) { /* ignore */ }
  try {
    const cfg = await (await fetch('/api/config')).json();
    applyHeadline(cfg.galleryTitle);
  } catch (_) { /* ignore */ }
}

socket.on('uploadAdded', (entry) => {
  uploads.push(entry);
  render();
});

socket.on('stateUpdate', (state) => {
  if (Array.isArray(state.uploads)) {
    uploads = state.uploads;
    render();
  }
  applyHeadline(state.galleryTitle);
});

loadInitial();
