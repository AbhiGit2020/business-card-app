// ── Config ──
const CONFIG = {
  VISION_API_KEY: 'AIzaSyBt6kcIYAMY3H6CmKD_FlEMqLBOdkkGDpU',
  OAUTH_CLIENT_ID: '356564967624-454aiiodg41u0l1ialidtmhlpj8erdtp.apps.googleusercontent.com',
  SCOPES: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile',
  SAVED_FOLDER: 'Connexa/SavedContacts',
  INBOX_FOLDER: 'Connexa/Inbox'
};

// ── State ──
let state = {
  contacts: [],
  unprocessed: [],       // { id, filename, driveFileId, driveImageUrl, scannedData, status }
  view: 'list',
  tab: 'contacts',       // 'contacts' | 'unprocessed'
  filter: 'all',
  search: '',
  sortBy: 'company',
  savedFolderId: null,
  inboxFolderId: null,
  driveFolderUrl: null,
  accessToken: null,
  userInfo: null,
  editingId: null,
  pendingImageFile: null,
  pendingImageBase64: null,
  croppedImageBase64: null,
  tokenClient: null,
  zoom: 1,
  reviewIndex: 0
};

// ── Theme ──
function initTheme() {
  const saved = localStorage.getItem('connexa-theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
}
function toggleTheme() {
  const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('connexa-theme', next);
}
initTheme();

// ── Auto-login: restore token from session ──
async function tryAutoLogin() {
  const savedToken = sessionStorage.getItem('connexa-token');
  if (!savedToken) { renderApp(); return; }
  state.accessToken = savedToken;
  try {
    await fetchUserInfo();
    await ensureFolders();
    await loadContactsFromDrive();
    await loadUnprocessedFromDrive();
    renderApp();
  } catch(e) {
    // Token expired — clear and show login
    sessionStorage.removeItem('connexa-token');
    state.accessToken = null;
    renderApp();
  }
}

// ── Boot ──
tryAutoLogin();

// Drag & drop single (desktop only)
const uploadZone = document.getElementById('uploadZone');
if (uploadZone) {
  uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('drag'); });
  uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag'));
  uploadZone.addEventListener('drop', e => { e.preventDefault(); uploadZone.classList.remove('drag'); const f = e.dataTransfer.files[0]; if (f) handleFile(f); });
}

// Drag & drop bulk (desktop only)
const bulkZone = document.getElementById('bulkZone');
if (bulkZone) {
  bulkZone.addEventListener('dragover', e => { e.preventDefault(); bulkZone.classList.add('drag'); });
  bulkZone.addEventListener('dragleave', () => bulkZone.classList.remove('drag'));
  bulkZone.addEventListener('drop', e => { e.preventDefault(); bulkZone.classList.remove('drag'); handleBulkFiles(e.dataTransfer.files); });
}

// Close overlays
document.getElementById('addOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeAdd(); });
document.getElementById('detailOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeDetail(); });
document.getElementById('bulkOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeBulk(); });
document.getElementById('reviewOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeReview(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeAdd(); closeDetail(); closeBulk(); closeReview(); } });

// ── Render ──
function renderApp() {
  const app = document.getElementById('app');
  if (!state.accessToken) { app.innerHTML = renderAuth(); return; }
  app.innerHTML = renderShell();
  renderMain();
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
        Drive
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
  const uCount = state.unprocessed.length;
  const uCountBadge = uCount > 0 ? `<span class="nav-count has-items">${uCount}</span>` : `<span class="nav-count">0</span>`;

  let html = `
    <div class="sidebar-label" style="margin-top:0;padding-top:0">Views</div>
    <div class="nav-item ${state.tab === 'contacts' && state.filter === 'all' ? 'active' : ''}" onclick="setTab('contacts');setFilter('all')">
      <div class="nav-item-left">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
        All Contacts
      </div>
      <span class="nav-count">${state.contacts.length}</span>
    </div>
    <div class="nav-item unprocessed-nav ${state.tab === 'unprocessed' ? 'active' : ''}" onclick="setTab('unprocessed')">
      <div class="nav-item-left">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
        Unprocessed
      </div>
      ${uCountBadge}
    </div>`;

  if (state.tab === 'contacts') {
    if (Object.keys(industries).length) {
      html += `<div class="sidebar-label">Industry</div>`;
      Object.entries(industries).sort((a, b) => b[1] - a[1]).forEach(([ind, count]) => {
        html += `<div class="nav-item ${state.filter === ind ? 'active' : ''}" onclick="setFilter('${escHtml(ind)}')">
          <div class="nav-item-left"><span style="width:8px;height:8px;border-radius:50%;background:var(--accent-mid);display:inline-block;flex-shrink:0"></span>${escHtml(ind)}</div>
          <span class="nav-count">${count}</span></div>`;
      });
    }
    if (influences.high || influences.mid || influences.low) {
      html += `<div class="sidebar-label">Influence</div>`;
      [['high', 'High'], ['mid', 'Mid'], ['low', 'Low']].forEach(([k, label]) => {
        if (!influences[k]) return;
        html += `<div class="nav-item ${state.filter === k ? 'active' : ''}" onclick="setFilter('${k}')">
          <div class="nav-item-left">${label}</div><span class="nav-count">${influences[k]}</span></div>`;
      });
    }
  }

  sb.innerHTML = html;
}

function setTab(t) { state.tab = t; state.filter = 'all'; renderMain(); }
function setFilter(f) { state.filter = f; renderSidebar(); renderMain(); }

// ── Main router ──
function renderMain() {
  renderSidebar();
  if (state.tab === 'unprocessed') renderUnprocessed();
  else renderContacts();
}

// ── Contacts ──
function renderContacts() {
  const main = document.getElementById('mainContent');
  if (!main) return;

  let contacts = state.contacts.filter(c => {
    const mf = state.filter === 'all' || c.industry === state.filter || c.influence === state.filter;
    if (!mf) return false;
    if (state.search) {
      const q = state.search;
      return [c.firstName, c.lastName, c.company, c.title, c.industry, c.region, c.notes, c.email].some(v => v && v.toLowerCase().includes(q));
    }
    return true;
  });

  // ── Sort ──
  const sortBy = state.sortBy || 'company';
  contacts = [...contacts].sort((a, b) => {
    if (sortBy === 'company') {
      const ca = (a.company || '').toLowerCase();
      const cb = (b.company || '').toLowerCase();
      if (ca !== cb) return ca.localeCompare(cb);
      // Within same company sort by name
      return ((a.firstName || '') + (a.lastName || '')).toLowerCase()
        .localeCompare(((b.firstName || '') + (b.lastName || '')).toLowerCase());
    } else {
      // Sort by name
      const na = ((a.firstName || '') + ' ' + (a.lastName || '')).toLowerCase().trim();
      const nb = ((b.firstName || '') + ' ' + (b.lastName || '')).toLowerCase().trim();
      return na.localeCompare(nb);
    }
  });

  const filterLabel = state.filter === 'all' ? 'All Contacts' : state.filter;
  const sortByCompany = sortBy === 'company';

  let html = `
    <div class="main-top">
      <h2 class="main-title">${escHtml(filterLabel)} <span style="font-family:var(--sans);font-size:14px;color:var(--text-hint);font-weight:300">(${contacts.length})</span></h2>
      <div class="main-actions">
        <!-- Sort toggle -->
        <div class="sort-toggle">
          <button class="sort-btn ${sortByCompany ? 'active' : ''}" onclick="setSort('company')" title="Sort by company">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18M3 10h18M3 3h18"/></svg>
            Company
          </button>
          <button class="sort-btn ${!sortByCompany ? 'active' : ''}" onclick="setSort('name')" title="Sort by name">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h10M4 18h6"/></svg>
            Name
          </button>
        </div>
        <div style="display:flex;gap:4px">
          <button class="icon-btn ${state.view === 'grid' ? 'active' : ''}" onclick="setView('grid')" title="Grid">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
          </button>
          <button class="icon-btn ${state.view === 'list' ? 'active' : ''}" onclick="setView('list')" title="List">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
          </button>
        </div>
      </div>
    </div>
    <div class="main-search-wrap">
      <div class="main-search-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg></div>
      <input id="mainSearch" type="text" placeholder="Search by name, company, title, region, industry…" value="${escHtml(state.search)}" oninput="state.search=this.value.toLowerCase();renderContacts()">
    </div>`;

  if (!contacts.length) {
    html += `<div class="empty">
      <div class="empty-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg></div>
      <h3>${state.contacts.length === 0 ? 'No contacts yet' : 'No results'}</h3>
      <p>${state.contacts.length === 0 ? 'Add your first business card to get started.' : 'Try a different search or filter.'}</p>
      ${state.contacts.length === 0 ? '<button class="btn btn-primary" onclick="openAdd()">Add your first card</button>' : ''}
    </div>`;
  } else if (state.view === 'grid') {
    // Group by company when sorting by company
    if (sortByCompany) {
      const groups = {};
      contacts.forEach(c => {
        const key = c.company || '—';
        if (!groups[key]) groups[key] = [];
        groups[key].push(c);
      });
      html += Object.entries(groups).map(([company, members]) => `
        <div class="company-group">
          <div class="company-group-label">${escHtml(company)}</div>
          <div class="grid">${members.map(renderCardTile).join('')}</div>
        </div>`).join('');
    } else {
      html += `<div class="grid">${contacts.map(renderCardTile).join('')}</div>`;
    }
  } else {
    html += renderListView(contacts, sortByCompany);
  }
  main.innerHTML = html;
}

function setSort(by) { state.sortBy = by; renderContacts(); }

function renderCardTile(c) {
  const imgHtml = c.driveImageUrl
    ? `<img src="${escHtml(c.driveImageUrl)}" alt="Card" loading="lazy">`
    : `<div class="card-img-ph"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg><span>No image</span></div>`;
  const iTag = c.influence ? `<span class="tag tag-${c.influence === 'high' ? 'gold' : c.influence === 'mid' ? 'green' : 'gray'}">${c.influence}</span>` : '';
  const indTag = c.industry ? `<span class="tag tag-green">${escHtml(c.industry)}</span>` : '';
  const rTag = c.region ? `<span class="tag tag-gray">${escHtml(c.region)}</span>` : '';
  const driveLink = c.driveImageId
    ? `<a href="https://drive.google.com/file/d/${c.driveImageId}/view" target="_blank" onclick="event.stopPropagation()" class="card-drive-link" title="View in Google Drive">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
      </a>` : '';
  return `<div class="contact-card" onclick="openDetail('${c.id}')">
    <div class="card-img">${imgHtml}</div>
    <div class="card-body">
      <div class="card-name-row">
        <div class="card-name">${escHtml((c.firstName || '') + ' ' + (c.lastName || ''))}</div>
        ${driveLink}
      </div>
      <div class="card-role">${escHtml(c.title || '')}</div>
      <div class="card-company">${escHtml(c.company || '')}</div>
      <div class="card-tags">${iTag}${indTag}${rTag}</div>
    </div>
  </div>`;
}

function renderListView(contacts, groupByCompany = false) {
  // Group by company if sorting by company
  const renderRows = (rows) => rows.map(c => {
    const img = c.driveImageUrl ? `<img src="${escHtml(c.driveImageUrl)}" alt="" loading="lazy">` : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text-hint)"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>`;
    const iTag = c.influence ? `<span class="tag tag-${c.influence === 'high' ? 'gold' : c.influence === 'mid' ? 'green' : 'gray'}">${c.influence}</span>` : '—';
    const driveLink = c.driveImageId
      ? `<a href="https://drive.google.com/file/d/${c.driveImageId}/view" target="_blank" onclick="event.stopPropagation()" class="list-drive-link" title="View card in Drive">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
        </a>` : '';
    return `<div class="list-row" onclick="openDetail('${c.id}')">
      <div class="list-thumb">${img}</div>
      <div>
        <div class="list-name-row">
          <span class="list-name">${escHtml((c.firstName || '') + ' ' + (c.lastName || ''))}</span>
          ${driveLink}
        </div>
        <div class="list-sub">${escHtml(c.title || '')}</div>
      </div>
      <div class="list-cell" style="font-family:var(--mono);font-size:11px">${escHtml(c.company || '—')}</div>
      <div class="list-cell">${escHtml(c.industry || '—')}</div>
      <div class="list-cell">${escHtml(c.region || '—')}</div>
      <div class="list-cell">${iTag}</div>
    </div>`;
  }).join('');

  if (groupByCompany) {
    const groups = {};
    contacts.forEach(c => {
      const key = c.company || '—';
      if (!groups[key]) groups[key] = [];
      groups[key].push(c);
    });
    return Object.entries(groups).map(([company, members]) => `
      <div class="list-view" style="margin-bottom:12px">
        <div class="list-company-header">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          ${escHtml(company)}
          <span style="font-size:11px;font-weight:400;color:var(--text-hint);margin-left:6px">${members.length} contact${members.length > 1 ? 's' : ''}</span>
        </div>
        <div class="list-header"><div></div><div>Name</div><div>Company</div><div>Industry</div><div>Region</div><div>Influence</div></div>
        ${renderRows(members)}
      </div>`).join('');
  }

  return `<div class="list-view">
    <div class="list-header"><div></div><div>Name</div><div>Company</div><div>Industry</div><div>Region</div><div>Influence</div></div>
    ${renderRows(contacts)}
  </div>`;
}

function setView(v) { state.view = v; renderContacts(); }

// ── Unprocessed tab ──
function renderUnprocessed() {
  const main = document.getElementById('mainContent');
  if (!main) return;

  let html = `
    <div class="main-top">
      <h2 class="main-title">Unprocessed <span style="font-family:var(--sans);font-size:14px;color:var(--text-hint);font-weight:300">(${state.unprocessed.length})</span></h2>
      <div class="main-actions">
        <button class="btn btn-ghost btn-sm" onclick="openBulk()">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
          Bulk Upload
        </button>
        ${state.unprocessed.filter(u => u.status === 'ready').length > 0
          ? `<button class="btn btn-primary btn-sm" onclick="startReview()">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              Review All
            </button>` : ''}
      </div>
    </div>`;

  if (!state.unprocessed.length) {
    html += `<div class="empty">
      <div class="empty-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg></div>
      <h3>No unprocessed cards</h3>
      <p>Bulk upload business card photos and they'll be scanned and queued here for review.</p>
      <button class="btn btn-primary" onclick="openBulk()">Bulk Upload Cards</button>
    </div>`;
  } else {
    html += `<div class="unprocessed-list">`;
    state.unprocessed.forEach((u, idx) => {
      const statusColor = u.status === 'scanning' ? 'status-scanning' : u.status === 'ready' ? 'status-ready' : 'status-error';
      const statusLabel = u.status === 'scanning' ? 'Scanning…' : u.status === 'ready' ? 'Ready to review' : 'Scan failed';
      const name = u.scannedData ? `${u.scannedData.firstName || ''} ${u.scannedData.lastName || ''}`.trim() || 'Unknown' : 'Scanning…';
      const company = u.scannedData?.company || '';
      html += `<div class="unprocessed-card">
        <div class="unprocessed-thumb">
          ${u.driveImageUrl ? `<img src="${escHtml(u.driveImageUrl)}" alt="Card">` : `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text-hint)"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>`}
        </div>
        <div class="unprocessed-info">
          <div class="unprocessed-name">${escHtml(name)}</div>
          <div class="unprocessed-sub">${escHtml(company)}</div>
          <div class="unprocessed-status">
            <span class="status-dot ${statusColor}"></span>
            <span style="color:var(--text-hint)">${statusLabel}</span>
          </div>
        </div>
        <div class="unprocessed-actions">
          ${u.status === 'ready' ? `<button class="btn btn-primary btn-sm" onclick="reviewSingle(${idx})">Review</button>` : ''}
          <button class="btn btn-danger btn-sm" onclick="discardUnprocessed('${u.id}')">Discard</button>
        </div>
      </div>`;
    });
    html += `</div>`;
  }
  main.innerHTML = html;
}

// ── Bulk Upload ──
function openBulk() { document.getElementById('bulkOverlay').classList.add('open'); }
function closeBulk() { document.getElementById('bulkOverlay').classList.remove('open'); }

async function handleBulkFiles(files) {
  if (!files?.length) return;
  const fileArr = Array.from(files);
  document.getElementById('bulkProgress').style.display = 'block';
  const log = document.getElementById('bulkLog');
  log.innerHTML = '';

  for (let i = 0; i < fileArr.length; i++) {
    const file = fileArr[i];
    const pct = Math.round(((i) / fileArr.length) * 100);
    document.getElementById('progressBar').style.width = pct + '%';
    document.getElementById('bulkProgressText').textContent = `Processing ${i + 1} of ${fileArr.length}…`;

    const logItem = document.createElement('div');
    logItem.className = 'log-item';
    logItem.innerHTML = `<span class="spin" style="color:var(--accent)"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 11-9-9"/></svg></span> <span>${escHtml(file.name)}</span>`;
    log.appendChild(logItem);

    try {
      // Read file
      const base64 = await fileToBase64(file);

      // Upload to Inbox
      const uploadRes = await uploadToInbox(file, base64);

      // Add to unprocessed with scanning status
      const entry = { id: 'u_' + Date.now() + '_' + i, filename: file.name, driveFileId: uploadRes.fileId, driveImageUrl: uploadRes.url, scannedData: null, status: 'scanning' };
      state.unprocessed.push(entry);
      renderMain();

      // Scan with Vision API
      const text = await visionOCR(base64);
      entry.scannedData = text ? parseCardTextToObject(text) : {};
      entry.status = 'ready';

      logItem.innerHTML = `<span style="color:var(--accent-mid)">✓</span> <span>${escHtml(file.name)} — ${entry.scannedData.firstName || entry.scannedData.company || 'scanned'}</span>`;
    } catch (e) {
      const entry = state.unprocessed.find(u => u.filename === file.name && u.status === 'scanning');
      if (entry) { entry.status = 'error'; }
      logItem.innerHTML = `<span style="color:var(--danger)">✗</span> <span>${escHtml(file.name)} — ${e.message}</span>`;
    }

    await saveUnprocessedToDrive();
    renderMain();
  }

  document.getElementById('progressBar').style.width = '100%';
  document.getElementById('bulkProgressText').textContent = `Done! ${fileArr.length} card${fileArr.length > 1 ? 's' : ''} scanned.`;
}

// ── Review flow ──
function startReview() {
  const readyItems = state.unprocessed.filter(u => u.status === 'ready');
  if (!readyItems.length) return;
  state.reviewIndex = state.unprocessed.findIndex(u => u.status === 'ready');
  openReviewAt(state.reviewIndex);
}

function reviewSingle(idx) {
  state.reviewIndex = idx;
  openReviewAt(idx);
}

function openReviewAt(idx) {
  const u = state.unprocessed[idx];
  if (!u) return;
  const readyItems = state.unprocessed.filter(u => u.status === 'ready');
  const readyIdx = readyItems.indexOf(u) + 1;

  document.getElementById('reviewTitle').textContent = 'Review Card';
  document.getElementById('reviewCounter').textContent = `${readyIdx} of ${readyItems.length} remaining`;
  document.getElementById('reviewImg').src = u.driveImageUrl || '';
  // Reset zoom
  reviewZoomLevel = 1;
  const rz = document.getElementById('reviewZoomSlider'); if (rz) rz.value = 1;
  const rl = document.getElementById('reviewZoomLabel'); if (rl) rl.textContent = '1×';
  const ri = document.getElementById('reviewImg'); if (ri) ri.style.transform = 'scale(1)';

  const R_FIELDS = ['firstName', 'lastName', 'title', 'function', 'company', 'email', 'phone', 'address', 'website', 'industry', 'region', 'influence', 'notes'];
  R_FIELDS.forEach(f => {
    const el = document.getElementById('r_' + f);
    if (el) el.value = u.scannedData?.[f] || '';
  });
  document.getElementById('reviewOverlay').classList.add('open');
}

function closeReview() { document.getElementById('reviewOverlay').classList.remove('open'); }

function skipReview() {
  const nextIdx = state.unprocessed.findIndex((u, i) => i > state.reviewIndex && u.status === 'ready');
  closeReview();
  if (nextIdx !== -1) {
    state.reviewIndex = nextIdx;
    openReviewAt(nextIdx);
  }
}

async function saveReviewed() {
  const u = state.unprocessed[state.reviewIndex];
  if (!u) return;

  const R_FIELDS = ['firstName', 'lastName', 'title', 'function', 'company', 'email', 'phone', 'address', 'website', 'industry', 'region', 'influence', 'notes'];
  const data = {};
  R_FIELDS.forEach(f => { data[f] = document.getElementById('r_' + f)?.value.trim() || ''; });

  if (!data.firstName && !data.lastName && !data.company) {
    showToast('Enter at least a name or company', true); return;
  }

  // Move image from Inbox to SavedContacts with new filename
  const num = String(state.contacts.length + 1).padStart(2, '0');
  const namePart = [data.firstName, data.lastName].filter(Boolean).join('_').toLowerCase().replace(/[^a-z0-9_]/g, '') || 'contact';
  const newFilename = `${num}_${namePart}.jpg`;

  try {
    showToast('Saving contact…');
    const newFileId = await copyDriveFile(u.driveFileId, newFilename, state.savedFolderId);
    const imageUrl = `https://drive.google.com/uc?export=view&id=${newFileId}`;
    await makeFilePublic(newFileId);
    await deleteDriveFile(u.driveFileId);

    const contact = {
      id: 'c_' + Date.now(),
      ...data,
      driveImageUrl: imageUrl,
      driveImageId: newFileId,
      filename: newFilename,
      createdAt: new Date().toISOString()
    };
    state.contacts.unshift(contact);
    state.unprocessed.splice(state.reviewIndex, 1);

    await saveContactsToDrive();
    await saveUnprocessedToDrive();

    closeReview();
    renderMain();
    showToast(`${data.firstName || data.company} saved to contacts`);

    // Auto-open next ready item
    const nextIdx = state.unprocessed.findIndex(u => u.status === 'ready');
    if (nextIdx !== -1) {
      setTimeout(() => { state.reviewIndex = nextIdx; openReviewAt(nextIdx); }, 400);
    }
  } catch (e) {
    showToast('Save failed: ' + e.message, true);
  }
}

async function discardUnprocessed(id) {
  if (!confirm('Discard this card? The image will be deleted from Drive.')) return;
  const u = state.unprocessed.find(x => x.id === id);
  if (u?.driveFileId) { try { await deleteDriveFile(u.driveFileId); } catch (e) { } }
  state.unprocessed = state.unprocessed.filter(x => x.id !== id);
  await saveUnprocessedToDrive();
  renderMain();
  showToast('Card discarded');
}

// ── Add (single) Modal ──
function openAdd() {
  state.editingId = null; state.pendingImageFile = null; state.pendingImageBase64 = null; state.croppedImageBase64 = null; state.zoom = 1;
  document.getElementById('modalTitle').textContent = 'Add Contact';
  clearForm(); clearFile();
  document.getElementById('addOverlay').classList.add('open');
}

function openEdit(id) {
  const c = state.contacts.find(x => x.id === id);
  if (!c) return;
  state.editingId = id; state.croppedImageBase64 = null;
  document.getElementById('modalTitle').textContent = 'Edit Contact';
  closeDetail(); fillForm(c);
  if (c.driveImageUrl) {
    document.getElementById('uploadSection').style.display = 'none';
    document.getElementById('cropSection').style.display = 'none';
    document.getElementById('previewSection').style.display = 'flex';
    document.getElementById('previewImg').src = c.driveImageUrl;
  } else clearFile();
  document.getElementById('addOverlay').classList.add('open');
}

function closeAdd() { document.getElementById('addOverlay').classList.remove('open'); }

const FIELDS = ['firstName', 'lastName', 'title', 'function', 'company', 'email', 'phone', 'address', 'website', 'industry', 'region', 'influence', 'notes'];
function clearForm() { FIELDS.forEach(f => { const el = document.getElementById('f_' + f); if (el) el.value = ''; }); }
function fillForm(c) { FIELDS.forEach(f => { const el = document.getElementById('f_' + f); if (el) el.value = c[f] || ''; }); }
function getFormData() { const d = {}; FIELDS.forEach(f => { d[f] = document.getElementById('f_' + f)?.value.trim() || ''; }); return d; }

// ── Review zoom ──
let reviewZoomLevel = 1;
function reviewZoom(val) {
  reviewZoomLevel = parseFloat(val);
  document.getElementById('reviewZoomLabel').textContent = reviewZoomLevel.toFixed(1) + '×';
  const img = document.getElementById('reviewImg');
  if (img) img.style.transform = `scale(${reviewZoomLevel})`;
  const viewer = document.getElementById('splitImgViewer');
  if (viewer) viewer.style.alignItems = reviewZoomLevel > 1 ? 'flex-start' : 'center';
}
function reviewZoomIn() {
  const s = document.getElementById('reviewZoomSlider');
  if (s) { s.value = Math.min(4, parseFloat(s.value) + 0.3); reviewZoom(s.value); }
}
function reviewZoomOut() {
  const s = document.getElementById('reviewZoomSlider');
  if (s) { s.value = Math.max(1, parseFloat(s.value) - 0.3); reviewZoom(s.value); }
}

// ── Add panel zoom ──
let addZoomLevel = 1;
function addZoom(val) {
  addZoomLevel = parseFloat(val);
  const img = document.getElementById('previewImg');
  if (img) img.style.transform = `scale(${addZoomLevel})`;
  const viewer = document.getElementById('addImgViewer');
  if (viewer) viewer.style.alignItems = addZoomLevel > 1 ? 'flex-start' : 'center';
}
function addZoomIn() {
  const s = document.getElementById('addZoomSlider');
  if (s) { s.value = Math.min(4, parseFloat(s.value) + 0.3); addZoom(s.value); }
}
function addZoomOut() {
  const s = document.getElementById('addZoomSlider');
  if (s) { s.value = Math.max(1, parseFloat(s.value) - 0.3); addZoom(s.value); }
}

function handleFile(file) {
  if (!file) return;
  state.pendingImageFile = file;
  const reader = new FileReader();
  reader.onload = e => {
    state.pendingImageBase64 = e.target.result.split(',')[1];
    document.getElementById('uploadSection').style.display = 'none';
    document.getElementById('previewSection').style.display = 'none';
    document.getElementById('cropSection').style.display = 'flex';
    const cropImg = document.getElementById('cropImg');
    cropImg.src = e.target.result;
    state.zoom = 1;
    const zs = document.getElementById('zoomSlider'); if (zs) { zs.value = 1; }
    const zv = document.getElementById('zoomVal'); if (zv) zv.textContent = '1×';
    applyZoom(1);
  };
  reader.readAsDataURL(file);
}

function applyZoom(val) {
  state.zoom = parseFloat(val);
  const zv = document.getElementById('zoomVal'); if (zv) zv.textContent = parseFloat(val).toFixed(2) + '×';
  const img = document.getElementById('cropImg');
  if (img) img.style.transform = `scale(${state.zoom})`;
}

function confirmCrop() {
  const img = document.getElementById('cropImg');
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
  canvas.getContext('2d').drawImage(img, 0, 0);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  state.croppedImageBase64 = dataUrl.split(',')[1];
  document.getElementById('cropSection').style.display = 'none';
  document.getElementById('previewSection').style.display = 'flex';
  document.getElementById('previewImg').src = dataUrl;
  // Reset add zoom
  addZoomLevel = 1;
  const s = document.getElementById('addZoomSlider'); if (s) s.value = 1;
  runVisionOCR(state.croppedImageBase64);
}

function clearFile() {
  state.pendingImageFile = null; state.pendingImageBase64 = null; state.croppedImageBase64 = null;
  document.getElementById('uploadSection').style.display = 'block';
  document.getElementById('cropSection').style.display = 'none';
  document.getElementById('previewSection').style.display = 'none';
  const fi = document.getElementById('fileInput'); if (fi) fi.value = '';
  const ci = document.getElementById('cameraInput'); if (ci) ci.value = '';
}

// ── Vision OCR ──
async function visionOCR(base64) {
  const res = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${CONFIG.VISION_API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: [{ image: { content: base64 }, features: [{ type: 'TEXT_DETECTION', maxResults: 1 }] }] })
  });
  const data = await res.json();
  return data.responses?.[0]?.fullTextAnnotation?.text || '';
}

async function runVisionOCR(base64) {
  document.getElementById('scanBanner').style.display = 'flex';
  try {
    const text = await visionOCR(base64);
    if (text) { fillFormFromText(text, 'f_'); showToast('Card scanned — please verify the details'); }
    else showToast('No text detected — please fill in manually', true);
  } catch (e) {
    showToast('Vision API error: ' + e.message, true);
  } finally {
    document.getElementById('scanBanner').style.display = 'none';
  }
}

function parseCardTextToObject(text) {
  const d = {};
  const emailM = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  if (emailM) d.email = emailM[0];
  const mobileM = text.match(/M\s*:\s*([\+\d\s\-]{7,20})/i);
  if (mobileM) d.phone = mobileM[1].trim();
  else { const phoneM = text.match(/[\+]?[\d\s\-\(\)\.]{8,18}/); if (phoneM) d.phone = phoneM[0].trim(); }
  const webM = text.match(/(?:www\.|https?:\/\/)[^\s,\n]+/i);
  if (webM) d.website = webM[0].replace(/^https?:\/\//, '');
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const latinLines = lines.filter(l => !/[\u3000-\u9fff\uac00-\ud7af]/.test(l) && !l.includes('@') && !/^[\+\(]/.test(l) && !/^\d/.test(l) && l.length > 1 && l.length < 60 && !/^(T|F|M)\s*:/i.test(l));
  let nameSet = false, titleSet = false;
  for (const l of latinLines) {
    if (!nameSet && /^[A-Z][a-z]/.test(l) && l.split(/\s+/).length >= 2 && l.split(/\s+/).length <= 5 && !/[,#]/.test(l)) {
      const parts = l.split(/\s+/);
      d.firstName = parts[0]; d.lastName = parts.slice(1).join(' '); nameSet = true;
    } else if (nameSet && !titleSet && l.length < 60 && !/[,#\d]/.test(l)) {
      d.title = l; titleSet = true;
    } else if (nameSet && titleSet && !d.company && l.length < 60) {
      d.company = l;
    }
  }
  const addrM = lines.find(l => /(\#\d|floor|road|ave|street|building|district|pvt|pte|ltd)/i.test(l));
  if (addrM) d.address = addrM;
  return d;
}

function fillFormFromText(text, prefix) {
  const d = parseCardTextToObject(text);
  Object.entries(d).forEach(([k, v]) => {
    const el = document.getElementById(prefix + k);
    if (el && !el.value) el.value = v;
  });
}

// ── Save single contact ──
async function saveContact() {
  const data = getFormData();
  if (!data.firstName && !data.lastName && !data.company) { showToast('Enter at least a name or company', true); return; }

  const id = state.editingId || ('c_' + Date.now());
  let driveImageUrl = '', driveImageId = '';
  const imageBase64 = state.croppedImageBase64 || state.pendingImageBase64;

  if (imageBase64 && state.pendingImageFile) {
    try {
      showToast('Uploading image…');
      const num = String(state.contacts.length + 1).padStart(2, '0');
      const namePart = [data.firstName, data.lastName].filter(Boolean).join('_').toLowerCase().replace(/[^a-z0-9_]/g, '') || 'contact';
      const filename = `${num}_${namePart}.jpg`;
      const r = await uploadToSaved(state.pendingImageFile, imageBase64, filename);
      driveImageUrl = r.url; driveImageId = r.fileId;
    } catch (e) { showToast('Image upload failed: ' + e.message, true); }
  } else if (state.editingId) {
    const ex = state.contacts.find(c => c.id === state.editingId);
    driveImageUrl = ex?.driveImageUrl || ''; driveImageId = ex?.driveImageId || '';
  }

  const createdAt = state.editingId ? state.contacts.find(c => c.id === state.editingId)?.createdAt : new Date().toISOString();
  const contact = { id, ...data, driveImageUrl, driveImageId, createdAt };
  if (state.editingId) state.contacts = state.contacts.map(c => c.id === state.editingId ? contact : c);
  else state.contacts.unshift(contact);

  await saveContactsToDrive();
  closeAdd(); renderMain();
  showToast(state.editingId ? 'Contact updated' : 'Contact saved');
}

// ── Detail ──
function openDetail(id) {
  const c = state.contacts.find(x => x.id === id);
  if (!c) return;
  const imgPanel = c.driveImageUrl
    ? `<div class="detail-img-panel" onclick="this.classList.toggle('zoomed')" title="Click to zoom"><img src="${escHtml(c.driveImageUrl)}" alt="Business card"><div style="position:absolute;bottom:10px;right:10px;background:rgba(0,0,0,0.4);color:white;padding:3px 8px;border-radius:6px;font-size:11px;pointer-events:none">Click to zoom</div></div>`
    : `<div class="detail-img-panel"><div class="detail-no-img"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>No card image</div></div>`;

  const rows = [
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
        <button class="icon-btn" onclick="closeDetail()"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
      </div>
      <div class="detail-info-body">
        <div class="detail-name">${escHtml((c.firstName || '') + ' ' + (c.lastName || ''))}</div>
        <div class="detail-role">${escHtml(c.title || '')}</div>
        ${c.function ? `<div style="font-size:13px;color:var(--text-hint);margin-bottom:2px">${escHtml(c.function)}</div>` : ''}
        <div class="detail-company">${escHtml(c.company || '')}</div>
        <div class="detail-tags">${iTag}${indTag}${rTag}</div>
        ${rows.length ? `<div class="detail-section"><div class="detail-section-title">Contact</div>${rows.map(([l, v]) => `<div class="detail-row"><div class="detail-row-label">${l}</div><div class="detail-row-value">${v}</div></div>`).join('')}</div>` : ''}
        ${c.notes ? `<div class="detail-section"><div class="detail-section-title">Notes</div><p style="font-size:13px;line-height:1.7;white-space:pre-wrap">${escHtml(c.notes)}</p></div>` : ''}
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

function closeDetail() { document.getElementById('detailOverlay').classList.remove('open'); }

async function deleteContact(id) {
  if (!confirm('Delete this contact?')) return;
  const c = state.contacts.find(x => x.id === id);
  if (c?.driveImageId) { try { await deleteDriveFile(c.driveImageId); } catch (e) { } }
  state.contacts = state.contacts.filter(x => x.id !== id);
  await saveContactsToDrive(); closeDetail(); renderMain(); showToast('Contact deleted');
}

// ── Auth ──
function loadScript(src) {
  return new Promise(resolve => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script'); s.src = src; s.onload = resolve; document.head.appendChild(s);
  });
}

async function signIn() {
  await loadScript('https://accounts.google.com/gsi/client');
  await new Promise(resolve => {
    if (window.gapi?.client) { resolve(); return; }
    loadScript('https://apis.google.com/js/api.js').then(() => gapi.load('client', () => gapi.client.init({}).then(resolve)));
  });
  state.tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.OAUTH_CLIENT_ID, scope: CONFIG.SCOPES,
    callback: async resp => {
      if (resp.error) { showToast('Sign in failed', true); return; }
      state.accessToken = resp.access_token;
      sessionStorage.setItem('connexa-token', resp.access_token);
      await fetchUserInfo();
      await ensureFolders();
      await loadContactsFromDrive();
      await loadUnprocessedFromDrive();
      renderApp();
    }
  });
  state.tokenClient.requestAccessToken();
}

function signOut() {
  if (state.accessToken) google.accounts.oauth2.revoke(state.accessToken, () => { });
  sessionStorage.removeItem('connexa-token');
  Object.assign(state, { accessToken: null, contacts: [], unprocessed: [], userInfo: null, savedFolderId: null, inboxFolderId: null, driveFolderUrl: null });
  renderApp();
}

async function fetchUserInfo() {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${state.accessToken}` } });
  state.userInfo = await res.json();
}

// ── Drive ──
async function driveApi(path, method = 'GET', body = null) {
  const res = await fetch(`https://www.googleapis.com${path}`, {
    method, headers: { Authorization: `Bearer ${state.accessToken}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : null
  });
  if (!res.ok) throw new Error(`Drive ${method}: ${res.status}`);
  return res.status === 204 ? null : res.json();
}

async function ensureFolders() {
  // Root Connexa folder
  const rootRes = await driveApi(`/drive/v3/files?q=name='Connexa' and mimeType='application/vnd.google-apps.folder' and trashed=false and 'root' in parents&fields=files(id)`);
  let rootId;
  if (rootRes.files?.length) { rootId = rootRes.files[0].id; }
  else { const f = await driveApi('/drive/v3/files', 'POST', { name: 'Connexa', mimeType: 'application/vnd.google-apps.folder' }); rootId = f.id; }

  // SavedContacts subfolder
  const savedRes = await driveApi(`/drive/v3/files?q=name='SavedContacts' and mimeType='application/vnd.google-apps.folder' and trashed=false and '${rootId}' in parents&fields=files(id)`);
  if (savedRes.files?.length) { state.savedFolderId = savedRes.files[0].id; }
  else { const f = await driveApi('/drive/v3/files', 'POST', { name: 'SavedContacts', mimeType: 'application/vnd.google-apps.folder', parents: [rootId] }); state.savedFolderId = f.id; }

  // Inbox subfolder
  const inboxRes = await driveApi(`/drive/v3/files?q=name='Inbox' and mimeType='application/vnd.google-apps.folder' and trashed=false and '${rootId}' in parents&fields=files(id)`);
  if (inboxRes.files?.length) { state.inboxFolderId = inboxRes.files[0].id; }
  else { const f = await driveApi('/drive/v3/files', 'POST', { name: 'Inbox', mimeType: 'application/vnd.google-apps.folder', parents: [rootId] }); state.inboxFolderId = f.id; }

  state.driveFolderUrl = `https://drive.google.com/drive/folders/${rootId}`;
}

async function loadContactsFromDrive() {
  const res = await driveApi(`/drive/v3/files?q='${state.savedFolderId}' in parents and name='contacts.json' and trashed=false&fields=files(id)`);
  if (!res.files?.length) return;
  const content = await fetch(`https://www.googleapis.com/drive/v3/files/${res.files[0].id}?alt=media`, { headers: { Authorization: `Bearer ${state.accessToken}` } });
  state.contacts = await content.json();
}

async function saveContactsToDrive() {
  const json = JSON.stringify(state.contacts);
  const res = await driveApi(`/drive/v3/files?q='${state.savedFolderId}' in parents and name='contacts.json' and trashed=false&fields=files(id)`);
  if (res.files?.length) {
    await fetch(`https://www.googleapis.com/upload/drive/v3/files/${res.files[0].id}?uploadType=media`, { method: 'PATCH', headers: { Authorization: `Bearer ${state.accessToken}`, 'Content-Type': 'application/json' }, body: json });
  } else {
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify({ name: 'contacts.json', parents: [state.savedFolderId] })], { type: 'application/json' }));
    form.append('file', new Blob([json], { type: 'application/json' }));
    await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', { method: 'POST', headers: { Authorization: `Bearer ${state.accessToken}` }, body: form });
  }
}

async function loadUnprocessedFromDrive() {
  const res = await driveApi(`/drive/v3/files?q='${state.inboxFolderId}' in parents and name='unprocessed.json' and trashed=false&fields=files(id)`);
  if (!res.files?.length) return;
  const content = await fetch(`https://www.googleapis.com/drive/v3/files/${res.files[0].id}?alt=media`, { headers: { Authorization: `Bearer ${state.accessToken}` } });
  state.unprocessed = await content.json();
}

async function saveUnprocessedToDrive() {
  const json = JSON.stringify(state.unprocessed);
  const res = await driveApi(`/drive/v3/files?q='${state.inboxFolderId}' in parents and name='unprocessed.json' and trashed=false&fields=files(id)`);
  if (res.files?.length) {
    await fetch(`https://www.googleapis.com/upload/drive/v3/files/${res.files[0].id}?uploadType=media`, { method: 'PATCH', headers: { Authorization: `Bearer ${state.accessToken}`, 'Content-Type': 'application/json' }, body: json });
  } else {
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify({ name: 'unprocessed.json', parents: [state.inboxFolderId] })], { type: 'application/json' }));
    form.append('file', new Blob([json], { type: 'application/json' }));
    await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', { method: 'POST', headers: { Authorization: `Bearer ${state.accessToken}` }, body: form });
  }
}

async function uploadToInbox(file, base64) {
  return uploadImageToFolder(file, base64, state.inboxFolderId, `inbox_${Date.now()}.jpg`);
}

async function uploadToSaved(file, base64, filename) {
  return uploadImageToFolder(file, base64, state.savedFolderId, filename);
}

async function uploadImageToFolder(file, base64, folderId, filename) {
  const bytes = atob(base64), arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  const blob = new Blob([arr], { type: 'image/jpeg' });
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify({ name: filename, parents: [folderId] })], { type: 'application/json' }));
  form.append('file', blob);
  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', headers: { Authorization: `Bearer ${state.accessToken}` }, body: form });
  const data = await res.json();
  await makeFilePublic(data.id);
  return { fileId: data.id, url: `https://drive.google.com/uc?export=view&id=${data.id}` };
}

async function makeFilePublic(fileId) {
  await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
    method: 'POST', headers: { Authorization: `Bearer ${state.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'anyone' })
  });
}

async function copyDriveFile(fileId, newName, destFolderId) {
  const res = await driveApi(`/drive/v3/files/${fileId}/copy`, 'POST', { name: newName, parents: [destFolderId] });
  return res.id;
}

async function deleteDriveFile(fileId) {
  await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${state.accessToken}` } });
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = e => resolve(e.target.result.split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// ── Utils ──
function escHtml(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

let toastTimer;
function showToast(msg, isError = false) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast show' + (isError ? ' error' : '');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.className = 'toast', 3200);
}
