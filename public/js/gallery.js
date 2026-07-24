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

// ── Slideshow ─────────────────────────────────────────────────────────────────
const slideshow      = document.getElementById('slideshow');
const slideshowImg   = document.getElementById('slideshow-img');
const slideshowCap   = document.getElementById('slideshow-caption');
const btnSlideshow   = document.getElementById('btn-slideshow');
const btnExit        = document.getElementById('slideshow-exit');
const btnPrev        = document.getElementById('slideshow-prev');
const btnNext        = document.getElementById('slideshow-next');
const btnToggle      = document.getElementById('slideshow-toggle');
const SLIDE_INTERVAL = 4000;

let slideIndex = 0;
let slideTimer = null;
let slidePaused = false;

function slideList() {
  // oldest → newest for a natural progression
  return uploads;
}

function showSlide(i) {
  const list = slideList();
  if (!list.length) return;
  slideIndex = (i + list.length) % list.length;
  const u = list[slideIndex];
  slideshowImg.src = u.url;
  slideshowImg.alt = u.originalName || '';
  slideshowCap.textContent = u.originalName || '';
}

function nextSlide() { showSlide(slideIndex + 1); }
function prevSlide() { showSlide(slideIndex - 1); }

function scheduleSlide() {
  clearTimeout(slideTimer);
  if (slidePaused) return;
  slideTimer = setTimeout(() => { nextSlide(); scheduleSlide(); }, SLIDE_INTERVAL);
}

function startSlideshow() {
  if (!uploads.length) return;
  slideIndex = 0;
  slidePaused = false;
  btnToggle.textContent = '❚❚';
  slideshow.classList.remove('hidden');
  showSlide(0);
  scheduleSlide();
}

function stopSlideshow() {
  clearTimeout(slideTimer);
  slideshow.classList.add('hidden');
  slideshowImg.src = '';
}

function togglePause() {
  slidePaused = !slidePaused;
  btnToggle.textContent = slidePaused ? '▶' : '❚❚';
  if (slidePaused) clearTimeout(slideTimer); else scheduleSlide();
}

btnSlideshow.addEventListener('click', startSlideshow);
btnExit.addEventListener('click', stopSlideshow);
btnToggle.addEventListener('click', togglePause);
btnPrev.addEventListener('click', () => { prevSlide(); scheduleSlide(); });
btnNext.addEventListener('click', () => { nextSlide(); scheduleSlide(); });

document.addEventListener('keydown', (e) => {
  if (slideshow.classList.contains('hidden')) return;
  if (e.key === 'Escape') stopSlideshow();
  else if (e.key === 'ArrowRight') { nextSlide(); scheduleSlide(); }
  else if (e.key === 'ArrowLeft') { prevSlide(); scheduleSlide(); }
  else if (e.key === ' ') { e.preventDefault(); togglePause(); }
});

loadInitial();
