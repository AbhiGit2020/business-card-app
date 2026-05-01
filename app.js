// ── Config ──
const CONFIG = {
  VISION_API_KEY: 'AIzaSyBt6kcIYAMY3H6CmKD_FlEMqLBOdkkGDpU',
  OAUTH_CLIENT_ID: '356564967624-454aiiodg41u0l1ialidtmhlpj8erdtp.apps.googleusercontent.com',
  DRIVE_FOLDER_NAME: 'BusinessCards',
  SCOPES: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile'
};

// ── State ──
let state = {
  contacts: [],
  view: 'grid',
  filter: 'all',
  search: '',
  driveFolderId: null,
  driveFolderUrl: null,
  accessToken: null,
  userInfo: null,
  editingId: null,
  pendingImageFile: null,
  pendingImageBase64: null,
  croppedImageBase64: null,
  tokenClient: null,
  zoom: 1
};

// ── Theme ──
function initTheme() {
  const saved = localStorage.getItem('connexa-theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
}
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('connexa-theme', next);
}
initTheme();

// ── Boot ──
renderApp();

// Drag & drop
document.getElementById('uploadZone').addEventListener('dragover', e => { e.preventDefault(); e.currentTarget.classList.add('drag'); });
document.getElementById('uploadZone').addEventListener('dragleave', e => e.currentTarget.classList.remove('drag'));
document.getElementById('uploadZone').addEventListener('drop', e => { e.preventDefault(); e.currentTarget.classList.remove('drag'); const f = e.dataTransfer.files[0]; if (f) handleFile(f); });

// Close overlays
document.getElementById('addOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeAdd(); });
document.getElementById('detailOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeDetail(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeAdd(); closeDetail(); } });

// ── Render ──
function renderApp() {
  const app = document.getElementById('app');
  if (!state.accessToken) { app.innerHTML = renderAuth(); return; }
  app.innerHTML = renderShell();
  renderContacts();
}

function renderAuth() {
  return `
    <header>
      <div class="logo">Conn<em>exa</em></div>
      <button class="theme-toggle" onclick="toggleTheme()" title="Toggle dark mode"></button>
    </header>
    <div class="auth-screen">
      <div class="auth-card">
        <div class="auth-logo">Conn<em>exa</em></div>
        <p class="auth-sub">Your business card contacts, organised and searchable.<br>Stored securely in your Google Drive.</p>
        <button class="google-btn" onclick="signIn()">
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Sign in with Google
        </button>
      </div>
    </div>`;
}

function renderShell() {
  const initials = state.userInfo ? (state.userInfo.name || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : 'U';
  const driveBtn = state.driveFolderUrl
    ? `<a class="drive-link" href="${state.driveFolderUrl}" target="_blank">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
        Drive folder
      </a>` : '';
  return `
    <header>
      <div class="logo">Conn<em>exa</em></div>
      <div class="header-right">
        ${driveBtn}
        <button class="btn btn-primary btn-sm" onclick="openAdd()">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
          Add Card
        </button>
        <div class="user-chip">
          <div class="user-avatar">${initials}</div>
          <span>${state.userInfo?.name || ''}</span>
        </div>
        <button class="theme-toggle" onclick="toggleTheme()" title="Toggle dark mode"></button>
        <button class="icon-btn" onclick="signOut()" title="Sign out">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
        </button>
      </div>
    </header>
    <div class="layout">
      <aside class="sidebar" id="sidebar"></aside>
      <main class="main" id="mainContent"></main>
    </div>`;
}

// ── Sidebar ──
function renderSidebar() {
  const sb = document.getElementById('sidebar');
  if (!sb) return;
  const industries = {}, influences = { high: 0, mid: 0, low: 0 };
  state.contacts.forEach(c => {
    if (c.industry) industries[c.industry] = (industries[c.industry] || 0) + 1;
    if (c.influence) influences[c.influence] = (influences[c.influence] || 0) + 1;
  });

  let html = `
    <div class="sidebar-label" style="margin-top:0;padding-top:0">All</div>
    <div class="nav-item ${state.filter === 'all' ? 'active' : ''}" onclick="setFilter('all')">
      <div class="nav-item-left">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
        All Contacts
      </div>
      <span class="nav-count">${state.contacts.length}</span>
    </div>`;

  if (Object.keys(industries).length) {
    html += `<div class="sidebar-label">Industry</div>`;
    Object.entries(industries).sort((a, b) => b[1] - a[1]).forEach(([ind, count]) => {
      html += `<div class="nav-item ${state.filter === ind ? 'active' : ''}" onclick="setFilter('${escHtml(ind)}')">
        <div class="nav-item-left">
          <span style="width:8px;height:8px;border-radius:50%;background:var(--accent-mid);display:inline-block;flex-shrink:0"></span>
          ${escHtml(ind)}
        </div>
        <span class="nav-count">${count}</span>
      </div>`;
    });
  }

  if (influences.high || influences.mid || influences.low) {
    html += `<div class="sidebar-label">Influence</div>`;
    [['high', 'High'], ['mid', 'Mid'], ['low', 'Low']].forEach(([k, label]) => {
      if (!influences[k]) return;
      html += `<div class="nav-item ${state.filter === k ? 'active' : ''}" onclick="setFilter('${k}')">
        <div class="nav-item-left">${label}</div>
        <span class="nav-count">${influences[k]}</span>
      </div>`;
    });
  }

  sb.innerHTML = html;
}

function setFilter(f) { state.filter = f; renderSidebar(); renderContacts(); }

// ── Contacts ──
function renderContacts() {
  renderSidebar();
  const main = document.getElementById('mainContent');
  if (!main) return;

  const contacts = state.contacts.filter(c => {
    const matchFilter = state.filter === 'all' || c.industry === state.filter || c.influence === state.filter;
    if (!matchFilter) return false;
    if (state.search) {
      const q = state.search;
      return [c.firstName, c.lastName, c.company, c.title, c.industry, c.region, c.notes, c.email]
        .some(v => v && v.toLowerCase().includes(q));
    }
    return true;
  });

  const filterLabel = state.filter === 'all' ? 'All Contacts' : state.filter;
  let html = `
    <div class="main-top">
      <h2 class="main-title">${escHtml(filterLabel)} <span style="font-family:var(--sans);font-size:14px;color:var(--text-hint);font-weight:300">(${contacts.length})</span></h2>
      <div class="main-actions">
        <div style="display:flex;gap:4px">
          <button class="icon-btn ${state.view === 'grid' ? 'active' : ''}" onclick="setView('grid')" title="Grid view">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
          </button>
          <button class="icon-btn ${state.view === 'list' ? 'active' : ''}" onclick="setView('list')" title="List view">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
          </button>
        </div>
      </div>
    </div>

    <div class="main-search-wrap">
      <div class="main-search-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
      </div>
      <input id="mainSearch" type="text" placeholder="Search by name, company, title, region, industry…" value="${escHtml(state.search)}" oninput="state.search=this.value.toLowerCase();renderContacts()">
    </div>`;

  if (!contacts.length) {
    html += `
      <div class="empty">
        <div class="empty-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg></div>
        <h3>${state.contacts.length === 0 ? 'No contacts yet' : 'No results'}</h3>
        <p>${state.contacts.length === 0 ? 'Add your first business card to get started.' : 'Try a different search or filter.'}</p>
        ${state.contacts.length === 0 ? '<button class="btn btn-primary" onclick="openAdd()">Add your first card</button>' : ''}
      </div>`;
  } else if (state.view === 'grid') {
    html += `<div class="grid">${contacts.map(renderCardTile).join('')}</div>`;
  } else {
    html += renderListView(contacts);
  }
  main.innerHTML = html;
  const ms = document.getElementById('mainSearch');
  if (ms) ms.focus();
}

function renderCardTile(c) {
  const imgHtml = c.driveImageUrl
    ? `<img src="${escHtml(c.driveImageUrl)}" alt="Card" loading="lazy">`
    : `<div class="card-img-ph"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg><span>No image</span></div>`;
  const iTag = c.influence ? `<span class="tag tag-${c.influence === 'high' ? 'gold' : c.influence === 'mid' ? 'green' : 'gray'}">${c.influence}</span>` : '';
  const indTag = c.industry ? `<span class="tag tag-green">${escHtml(c.industry)}</span>` : '';
  const rTag = c.region ? `<span class="tag tag-gray">${escHtml(c.region)}</span>` : '';
  return `
    <div class="contact-card" onclick="openDetail('${c.id}')">
      <div class="card-img">${imgHtml}</div>
      <div class="card-body">
        <div class="card-name">${escHtml((c.firstName || '') + ' ' + (c.lastName || ''))}</div>
        <div class="card-role">${escHtml(c.title || '')}</div>
        <div class="card-company">${escHtml(c.company || '')}</div>
        <div class="card-tags">${iTag}${indTag}${rTag}</div>
      </div>
    </div>`;
}

function renderListView(contacts) {
  let html = `
    <div class="list-view">
      <div class="list-header">
        <div></div><div>Name</div><div>Company</div><div>Industry</div><div>Region</div><div>Influence</div>
      </div>`;
  contacts.forEach(c => {
    const img = c.driveImageUrl
      ? `<img src="${escHtml(c.driveImageUrl)}" alt="" loading="lazy">`
      : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text-hint)"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>`;
    const iTag = c.influence ? `<span class="tag tag-${c.influence === 'high' ? 'gold' : c.influence === 'mid' ? 'green' : 'gray'}">${c.influence}</span>` : '—';
    html += `
      <div class="list-row" onclick="openDetail('${c.id}')">
        <div class="list-thumb">${img}</div>
        <div><div class="list-name">${escHtml((c.firstName || '') + ' ' + (c.lastName || ''))}</div><div class="list-sub">${escHtml(c.title || '')}</div></div>
        <div class="list-cell" style="font-family:var(--mono);font-size:11px">${escHtml(c.company || '—')}</div>
        <div class="list-cell">${escHtml(c.industry || '—')}</div>
        <div class="list-cell">${escHtml(c.region || '—')}</div>
        <div class="list-cell">${iTag}</div>
      </div>`;
  });
  return html + `</div>`;
}

function setView(v) { state.view = v; renderContacts(); }

// ── Add / Edit Modal ──
function openAdd() {
  state.editingId = null;
  state.pendingImageFile = null;
  state.pendingImageBase64 = null;
  state.croppedImageBase64 = null;
  state.zoom = 1;
  document.getElementById('modalTitle').textContent = 'Add Contact';
  clearForm();
  clearFile();
  document.getElementById('addOverlay').classList.add('open');
}

function openEdit(id) {
  const c = state.contacts.find(x => x.id === id);
  if (!c) return;
  state.editingId = id;
  state.croppedImageBase64 = null;
  document.getElementById('modalTitle').textContent = 'Edit Contact';
  closeDetail();
  fillForm(c);
  if (c.driveImageUrl) {
    document.getElementById('uploadSection').style.display = 'none';
    document.getElementById('cropSection').style.display = 'none';
    document.getElementById('previewSection').style.display = 'block';
    document.getElementById('previewImg').src = c.driveImageUrl;
  } else {
    clearFile();
  }
  document.getElementById('addOverlay').classList.add('open');
}

function closeAdd() { document.getElementById('addOverlay').classList.remove('open'); }

const FIELDS = ['firstName', 'lastName', 'title', 'company', 'email', 'phone', 'address', 'website', 'industry', 'region', 'influence', 'notes'];
function clearForm() { FIELDS.forEach(f => { const el = document.getElementById('f_' + f); if (el) el.value = ''; }); }
function fillForm(c) { FIELDS.forEach(f => { const el = document.getElementById('f_' + f); if (el) el.value = c[f] || ''; }); }
function getFormData() { const d = {}; FIELDS.forEach(f => { d[f] = (document.getElementById('f_' + f)?.value.trim() || ''); }); return d; }

// ── File & Crop ──
function handleFile(file) {
  if (!file) return;
  state.pendingImageFile = file;
  const reader = new FileReader();
  reader.onload = e => {
    state.pendingImageBase64 = e.target.result.split(',')[1];
    document.getElementById('uploadSection').style.display = 'none';
    document.getElementById('previewSection').style.display = 'none';
    // Show crop tool
    document.getElementById('cropSection').style.display = 'block';
    const cropImg = document.getElementById('cropImg');
    cropImg.src = e.target.result;
    state.zoom = 1;
    document.getElementById('zoomSlider').value = 1;
    document.getElementById('zoomVal').textContent = '1×';
    applyZoom(1);
  };
  reader.readAsDataURL(file);
}

function applyZoom(val) {
  state.zoom = parseFloat(val);
  document.getElementById('zoomVal').textContent = parseFloat(val).toFixed(2) + '×';
  const img = document.getElementById('cropImg');
  if (img) img.style.transform = `scale(${state.zoom})`;
}

function confirmCrop() {
  // Use the current image as-is (base64 already set)
  // For actual pixel crop we use canvas
  const img = document.getElementById('cropImg');
  const canvas = document.createElement('canvas');
  const scale = state.zoom;
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  state.croppedImageBase64 = dataUrl.split(',')[1];

  // Show preview
  document.getElementById('cropSection').style.display = 'none';
  document.getElementById('previewSection').style.display = 'block';
  document.getElementById('previewImg').src = dataUrl;

  // Run OCR on the image
  runVisionOCR(state.croppedImageBase64 || state.pendingImageBase64);
}

function clearFile() {
  state.pendingImageFile = null;
  state.pendingImageBase64 = null;
  state.croppedImageBase64 = null;
  document.getElementById('uploadSection').style.display = 'block';
  document.getElementById('cropSection').style.display = 'none';
  document.getElementById('previewSection').style.display = 'none';
  const fi = document.getElementById('fileInput');
  if (fi) fi.value = '';
}

// ── Vision OCR ──
async function runVisionOCR(base64) {
  document.getElementById('scanBanner').style.display = 'flex';
  try {
    const res = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${CONFIG.VISION_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{ image: { content: base64 }, features: [{ type: 'TEXT_DETECTION', maxResults: 1 }] }]
      })
    });
    const data = await res.json();
    const text = data.responses?.[0]?.fullTextAnnotation?.text || '';
    if (text) parseCardText(text);
    else showToast('No text detected — please fill in manually', true);
  } catch (e) {
    showToast('Vision API error: ' + e.message, true);
  } finally {
    document.getElementById('scanBanner').style.display = 'none';
  }
}

function parseCardText(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // Email
  const emailM = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  if (emailM) setIfEmpty('f_email', emailM[0]);

  // Phone — prefer mobile (M:) or longest number
  const mobileM = text.match(/M\s*:\s*([\+\d\s\-]{7,20})/i);
  if (mobileM) setIfEmpty('f_phone', mobileM[1].trim());
  else {
    const phoneM = text.match(/[\+]?[\d\s\-\(\)\.]{8,18}/);
    if (phoneM) setIfEmpty('f_phone', phoneM[0].trim());
  }

  // Website
  const webM = text.match(/(?:www\.|https?:\/\/)[^\s,\n]+/i);
  if (webM) setIfEmpty('f_website', webM[0].replace(/^https?:\/\//, ''));

  // Filter out non-Latin lines (Chinese/Japanese characters) and short/irrelevant lines
  const latinLines = lines.filter(l => {
    if (/[\u3000-\u9fff\uac00-\ud7af]/.test(l)) return false; // CJK characters
    if (l.includes('@')) return false;
    if (/^[\+\(]/.test(l)) return false;
    if (/^\d/.test(l)) return false;
    if (l.length < 2 || l.length > 60) return false;
    if (/^(T|F|M)\s*:/i.test(l)) return false; // phone labels
    return true;
  });

  let nameSet = false;
  let titleSet = false;
  for (let i = 0; i < latinLines.length; i++) {
    const l = latinLines[i];
    if (!nameSet && /^[A-Z][a-z]/.test(l) && l.split(/\s+/).length >= 2 && l.split(/\s+/).length <= 5 && !/[,#]/.test(l)) {
      const parts = l.split(/\s+/);
      setIfEmpty('f_firstName', parts[0]);
      setIfEmpty('f_lastName', parts.slice(1).join(' '));
      nameSet = true;
    } else if (nameSet && !titleSet && l.length < 60 && !/[,#\d]/.test(l)) {
      setIfEmpty('f_title', l);
      titleSet = true;
    } else if (nameSet && titleSet && !document.getElementById('f_company').value && l.length < 60) {
      setIfEmpty('f_company', l);
    }
  }

  // Address — look for line with #, Floor, Road, Ave, Street, Building
  const addrM = lines.find(l => /(\#\d|floor|road|ave|street|building|district|pvt|pte|ltd)/i.test(l));
  if (addrM) setIfEmpty('f_address', addrM);

  showToast('Card scanned — please verify the details');
}

function setIfEmpty(id, val) { const el = document.getElementById(id); if (el && !el.value) el.value = val; }

// ── Save ──
async function saveContact() {
  const data = getFormData();
  if (!data.firstName && !data.lastName && !data.company) {
    showToast('Enter at least a name or company', true); return;
  }

  const id = state.editingId || ('c_' + Date.now());
  let driveImageUrl = '', driveImageId = '';
  const imageBase64 = state.croppedImageBase64 || state.pendingImageBase64;

  if (imageBase64 && state.pendingImageFile) {
    try {
      showToast('Uploading image to Drive…');
      const r = await uploadImageToDrive(state.pendingImageFile, imageBase64, id);
      driveImageUrl = r.url;
      driveImageId = r.fileId;
    } catch (e) {
      showToast('Image upload failed: ' + e.message, true);
    }
  } else if (state.editingId) {
    const ex = state.contacts.find(c => c.id === state.editingId);
    driveImageUrl = ex?.driveImageUrl || '';
    driveImageId = ex?.driveImageId || '';
  }

  const existingCreatedAt = state.editingId ? state.contacts.find(c => c.id === state.editingId)?.createdAt : null;
  const contact = { id, ...data, driveImageUrl, driveImageId, createdAt: existingCreatedAt || new Date().toISOString() };

  if (state.editingId) state.contacts = state.contacts.map(c => c.id === state.editingId ? contact : c);
  else state.contacts.unshift(contact);

  await saveContactsToDrive();
  closeAdd();
  renderContacts();
  showToast(state.editingId ? 'Contact updated' : 'Contact saved');
}

// ── Detail (full screen split) ──
function openDetail(id) {
  const c = state.contacts.find(x => x.id === id);
  if (!c) return;

  const imgPanel = c.driveImageUrl
    ? `<div class="detail-img-panel" id="imgPanel" onclick="toggleZoom(this)" title="Click to zoom">
        <img src="${escHtml(c.driveImageUrl)}" alt="Business card">
        <div style="position:absolute;bottom:10px;right:10px;background:rgba(0,0,0,0.4);color:white;padding:3px 8px;border-radius:6px;font-size:11px;pointer-events:none">Click to zoom</div>
      </div>`
    : `<div class="detail-img-panel">
        <div class="detail-no-img">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
          No card image
        </div>
      </div>`;

  const contactRows = [
    ['Email', c.email ? `<a href="mailto:${escHtml(c.email)}">${escHtml(c.email)}</a>` : ''],
    ['Phone', c.phone ? `<a href="tel:${escHtml(c.phone)}">${escHtml(c.phone)}</a>` : ''],
    ['Address', c.address ? escHtml(c.address) : ''],
    ['Website', c.website ? `<a href="https://${c.website.replace(/^https?:\/\//, '')}" target="_blank">${escHtml(c.website)}</a>` : ''],
  ].filter(([, v]) => v);

  const iTag = c.influence ? `<span class="tag tag-${c.influence === 'high' ? 'gold' : c.influence === 'mid' ? 'green' : 'gray'}">${c.influence} influence</span>` : '';
  const indTag = c.industry ? `<span class="tag tag-green">${escHtml(c.industry)}</span>` : '';
  const rTag = c.region ? `<span class="tag tag-gray">${escHtml(c.region)}</span>` : '';

  document.getElementById('detailPanel').innerHTML = `
    ${imgPanel}
    <div class="detail-info-panel">
      <div class="detail-info-header">
        <span style="font-size:12px;color:var(--text-hint)">${c.createdAt ? 'Added ' + new Date(c.createdAt).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</span>
        <button class="icon-btn" onclick="closeDetail()">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="detail-info-body">
        <div class="detail-name">${escHtml((c.firstName || '') + ' ' + (c.lastName || ''))}</div>
        <div class="detail-role">${escHtml(c.title || '')}</div>
        <div class="detail-company">${escHtml(c.company || '')}</div>
        <div class="detail-tags">${iTag}${indTag}${rTag}</div>
        ${contactRows.length ? `<div class="detail-section">
          <div class="detail-section-title">Contact</div>
          ${contactRows.map(([l, v]) => `<div class="detail-row"><div class="detail-row-label">${l}</div><div class="detail-row-value">${v}</div></div>`).join('')}
        </div>` : ''}
        ${c.notes ? `<div class="detail-section">
          <div class="detail-section-title">Notes</div>
          <p style="font-size:13px;color:var(--text);line-height:1.7;white-space:pre-wrap">${escHtml(c.notes)}</p>
        </div>` : ''}
      </div>
      <div class="detail-info-footer">
        <button class="btn btn-ghost" style="flex:1" onclick="openEdit('${c.id}')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Edit
        </button>
        <button class="btn btn-danger" style="flex:1" onclick="deleteContact('${c.id}')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          Delete
        </button>
      </div>
    </div>`;

  document.getElementById('detailOverlay').classList.add('open');
}

function toggleZoom(panel) {
  panel.classList.toggle('zoomed');
}

function closeDetail() { document.getElementById('detailOverlay').classList.remove('open'); }

async function deleteContact(id) {
  if (!confirm('Delete this contact? This cannot be undone.')) return;
  const c = state.contacts.find(x => x.id === id);
  if (c?.driveImageId) { try { await deleteDriveFile(c.driveImageId); } catch (e) { } }
  state.contacts = state.contacts.filter(x => x.id !== id);
  await saveContactsToDrive();
  closeDetail();
  renderContacts();
  showToast('Contact deleted');
}

// ── Google Auth ──
function loadScript(src) {
  return new Promise(resolve => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src; s.onload = resolve;
    document.head.appendChild(s);
  });
}

async function signIn() {
  await loadScript('https://accounts.google.com/gsi/client');
  await new Promise(resolve => {
    if (window.gapi?.client) { resolve(); return; }
    loadScript('https://apis.google.com/js/api.js').then(() =>
      gapi.load('client', () => gapi.client.init({}).then(resolve))
    );
  });

  state.tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.OAUTH_CLIENT_ID,
    scope: CONFIG.SCOPES,
    callback: async resp => {
      if (resp.error) { showToast('Sign in failed', true); return; }
      state.accessToken = resp.access_token;
      await fetchUserInfo();
      await ensureDriveFolder();
      await loadContactsFromDrive();
      renderApp();
    }
  });
  state.tokenClient.requestAccessToken();
}

function signOut() {
  if (state.accessToken) google.accounts.oauth2.revoke(state.accessToken, () => { });
  state.accessToken = null; state.contacts = []; state.userInfo = null; state.driveFolderId = null; state.driveFolderUrl = null;
  renderApp();
}

async function fetchUserInfo() {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${state.accessToken}` }
  });
  state.userInfo = await res.json();
}

// ── Drive ──
async function driveApi(path, method = 'GET', body = null) {
  const res = await fetch(`https://www.googleapis.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${state.accessToken}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : null
  });
  if (!res.ok) { const e = await res.text(); throw new Error(`Drive ${method}: ${res.status} ${e}`); }
  return res.status === 204 ? null : res.json();
}

async function ensureDriveFolder() {
  const res = await driveApi(`/drive/v3/files?q=name='${CONFIG.DRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id,webViewLink)`);
  if (res.files?.length) {
    state.driveFolderId = res.files[0].id;
    state.driveFolderUrl = `https://drive.google.com/drive/folders/${res.files[0].id}`;
    return;
  }
  const folder = await driveApi('/drive/v3/files', 'POST', { name: CONFIG.DRIVE_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' });
  state.driveFolderId = folder.id;
  state.driveFolderUrl = `https://drive.google.com/drive/folders/${folder.id}`;
}

async function loadContactsFromDrive() {
  const res = await driveApi(`/drive/v3/files?q='${state.driveFolderId}' in parents and name='contacts.json' and trashed=false&fields=files(id)`);
  if (!res.files?.length) return;
  const content = await fetch(`https://www.googleapis.com/drive/v3/files/${res.files[0].id}?alt=media`, {
    headers: { Authorization: `Bearer ${state.accessToken}` }
  });
  state.contacts = await content.json();
}

async function saveContactsToDrive() {
  const json = JSON.stringify(state.contacts);
  const res = await driveApi(`/drive/v3/files?q='${state.driveFolderId}' in parents and name='contacts.json' and trashed=false&fields=files(id)`);
  if (res.files?.length) {
    await fetch(`https://www.googleapis.com/upload/drive/v3/files/${res.files[0].id}?uploadType=media`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${state.accessToken}`, 'Content-Type': 'application/json' },
      body: json
    });
  } else {
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify({ name: 'contacts.json', parents: [state.driveFolderId] })], { type: 'application/json' }));
    form.append('file', new Blob([json], { type: 'application/json' }));
    await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST', headers: { Authorization: `Bearer ${state.accessToken}` }, body: form
    });
  }
}

async function uploadImageToDrive(file, base64, contactId) {
  const bytes = atob(base64), arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  const blob = new Blob([arr], { type: 'image/jpeg' });
  const filename = `card_${contactId}_${Date.now()}.jpg`;
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify({ name: filename, parents: [state.driveFolderId] })], { type: 'application/json' }));
  form.append('file', blob);
  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST', headers: { Authorization: `Bearer ${state.accessToken}` }, body: form
  });
  const data = await res.json();
  const fileId = data.id;
  await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${state.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'anyone' })
  });
  return { fileId, url: `https://drive.google.com/thumbnail?id=${fileId}&sz=w400` };
}

async function deleteDriveFile(fileId) {
  await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${state.accessToken}` }
  });
}

// ── Utils ──
function escHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

let toastTimer;
function showToast(msg, isError = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (isError ? ' error' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.className = 'toast', 3200);
}