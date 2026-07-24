/* upload.js – QR-accessed picture upload page (multiple files) */

const params    = new URLSearchParams(location.search);
const token     = params.get('token') || '';
const fileInput = document.getElementById('file-input');
const dropzone  = document.getElementById('dropzone');
const previewWrap = document.getElementById('preview-wrap');
const previewGrid = document.getElementById('preview-grid');
const nameInput = document.getElementById('name-input');
const btnUpload = document.getElementById('btn-upload');
const statusEl  = document.getElementById('status');

let files = [];   // array of { dataUrl, name }

function setStatus(msg, type) {
  statusEl.textContent = msg;
  statusEl.className = 'status' + (type ? ` status--${type}` : '');
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve({ dataUrl: e.target.result, name: file.name });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function renderPreviews() {
  previewGrid.innerHTML = '';
  files.forEach((f) => {
    const img = document.createElement('img');
    img.src = f.dataUrl;
    img.alt = f.name || 'Preview';
    previewGrid.appendChild(img);
  });
  previewWrap.classList.toggle('hidden', files.length === 0);
  btnUpload.disabled = files.length === 0 || !token;
  btnUpload.textContent = files.length > 1 ? `Upload ${files.length} photos` : 'Upload';
}

if (!token) {
  setStatus('Missing access token. Scan the QR code again.', 'error');
  dropzone.classList.add('disabled');
}

fileInput.addEventListener('change', async () => {
  const chosen = Array.from(fileInput.files || []).filter((f) => f.type.startsWith('image/'));
  if (!chosen.length) {
    setStatus('Please choose image files.', 'error');
    return;
  }
  setStatus('');
  try {
    const read = await Promise.all(chosen.map(readFile));
    files = files.concat(read);
    renderPreviews();
  } catch (_) {
    setStatus('Could not read one of the files.', 'error');
  }
});

btnUpload.addEventListener('click', async () => {
  if (!files.length || !token) return;
  btnUpload.disabled = true;
  const total = files.length;
  let done = 0;
  let failed = 0;

  for (const f of files) {
    setStatus(`Uploading ${done + 1} / ${total}…`);
    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, dataUrl: f.dataUrl, name: nameInput.value.trim() || f.name }),
      });
      if (!res.ok) failed++; else done++;
    } catch (_) {
      failed++;
    }
  }

  files = [];
  fileInput.value = '';
  renderPreviews();

  if (failed && !done) {
    setStatus('Upload failed. Try again.', 'error');
  } else {
    setStatus(
      failed ? `Uploaded ${done}, ${failed} failed. Add more?` : `Uploaded ${done} photo${done !== 1 ? 's' : ''}! 💥 Add more?`,
      failed ? 'error' : 'ok'
    );
  }
});
