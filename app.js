// ─────────────────────────────────────────────────────────
// AniTrack — app.js
// Supabase + Jikan API (portadas automáticas)
// ─────────────────────────────────────────────────────────

// ── Init Supabase ──────────────────────────────────────────
let db;
try {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY ||
      SUPABASE_URL.includes('TU_') || SUPABASE_ANON_KEY.includes('TU_')) {
    throw new Error('config');
  }
  db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch (e) {
  document.getElementById('animeGrid').innerHTML =
    `<div class="loading-state">
       <div style="font-size:32px">⚙️</div>
       <p style="color:var(--text)">Configura Supabase en config.js</p>
       <span>Añade tu SUPABASE_URL y SUPABASE_ANON_KEY</span>
     </div>`;
}

// ── Poster cache (sessionStorage) ────────────────────────
const POSTER_CACHE_KEY = 'anitrack_posters';
let posterCache = {};
try { posterCache = JSON.parse(sessionStorage.getItem(POSTER_CACHE_KEY) || '{}'); } catch {}
function savePosterCache() {
  try { sessionStorage.setItem(POSTER_CACHE_KEY, JSON.stringify(posterCache)); } catch {}
}

// Obtiene la URL de portada desde Jikan (MAL)
async function fetchPoster(title) {
  if (posterCache[title] !== undefined) return posterCache[title];

  const query = encodeURIComponent(title.trim());
  try {
    const res = await fetch(`https://api.jikan.moe/v4/anime?q=${query}&limit=1&sfw`);
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    const img = data.data?.[0]?.images?.jpg?.large_image_url
              || data.data?.[0]?.images?.jpg?.image_url
              || null;
    posterCache[title] = img;
    savePosterCache();
    return img;
  } catch {
    posterCache[title] = null;
    savePosterCache();
    return null;
  }
}

// ── State ─────────────────────────────────────────────────
let allAnimes   = [];
let filterStatus = 'all';
let filterGenre  = null;
let searchQuery  = '';
let sortMode     = 'name';
let viewMode     = 'grid';   // grid | list
let editingId    = null;

// ── DOM refs ─────────────────────────────────────────────
const grid        = document.getElementById('animeGrid');
const emptyState  = document.getElementById('emptyState');
const searchInput = document.getElementById('searchInput');
const sortSelect  = document.getElementById('sortSelect');

// ── Load data ─────────────────────────────────────────────
async function loadAnimes() {
  if (!db) return;
  const { data, error } = await db
    .from('animes')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) { showToast('Error al cargar datos'); return; }
  allAnimes = data || [];
  renderAll();
}

// ── Render ─────────────────────────────────────────────────
function getFiltered() {
  let list = [...allAnimes];

  if (filterStatus !== 'all') {
    list = list.filter(a => a.status === filterStatus);
  }
  if (filterGenre) {
    list = list.filter(a => a.genre && a.genre.toLowerCase().includes(filterGenre.toLowerCase()));
  }
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter(a =>
      (a.name || '').toLowerCase().includes(q) ||
      (a.genre || '').toLowerCase().includes(q) ||
      (a.descripcion || '').toLowerCase().includes(q)
    );
  }

  list.sort((a, b) => {
    if (sortMode === 'name')       return (a.name||'').localeCompare(b.name||'');
    if (sortMode === 'score_desc') return (b.score||0) - (a.score||0);
    if (sortMode === 'score_asc')  return (a.score||0) - (b.score||0);
    if (sortMode === 'recent')     return new Date(b.created_at) - new Date(a.created_at);
    return 0;
  });
  return list;
}

function renderAll() {
  updateCounts();
  updateGenreFilters();
  updateStats();
  renderGrid();
  updateActiveFilters();
}

async function renderGrid() {
  const list = getFiltered();

  if (!list.length) {
    grid.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }
  emptyState.classList.add('hidden');

  // Render placeholders immediately
  grid.innerHTML = list.map(a => cardHTML(a, null)).join('');

  // Fetch posters in batches (respect Jikan rate limit: ~3 req/s)
  const BATCH = 3;
  const DELAY = 400; // ms between batches

  for (let i = 0; i < list.length; i += BATCH) {
    const batch = list.slice(i, i + BATCH);
    await Promise.all(batch.map(async a => {
      const url = await fetchPoster(a.name);
      const posterEl = document.getElementById(`poster-${a.id}`);
      if (posterEl && url) {
        posterEl.innerHTML = `<img src="${url}" alt="${escHtml(a.name)}" loading="lazy" onerror="this.parentElement.innerHTML=initials('${escHtml(a.name)}')" />`;
      }
    }));
    if (i + BATCH < list.length) await sleep(DELAY);
  }
}

function cardHTML(a, posterUrl) {
  const statusClass = statusCssClass(a.status);
  const posterContent = posterUrl
    ? `<img src="${escHtml(posterUrl)}" alt="${escHtml(a.name)}" loading="lazy" onerror="this.parentElement.innerHTML=initials('${escHtml(a.name)}')" />`
    : `<div class="card-poster-placeholder">${getInitials(a.name)}</div>`;

  if (viewMode === 'list') {
    return `
    <div class="anime-card" onclick="openDetail('${a.id}')">
      <div class="card-poster" id="poster-${a.id}">${posterContent}</div>
      <div class="card-info">
        <span class="card-name">${escHtml(a.name)}</span>
        <span class="card-genre">${escHtml(a.genre || '—')}</span>
        <span class="list-score">${a.score != null ? a.score : '—'}</span>
        <span class="list-status">
          <span class="list-status-dot">
            <span class="list-dot" style="background:${statusColor(a.status)}"></span>
            ${escHtml(a.status || '—')}
          </span>
        </span>
      </div>
    </div>`;
  }

  return `
  <div class="anime-card" onclick="openDetail('${a.id}')">
    <div class="card-poster" id="poster-${a.id}">
      ${posterContent}
      <span class="card-status-badge ${statusClass}">${escHtml(a.status || '')}</span>
      ${a.score != null ? `<span class="card-score-badge">★ ${a.score}</span>` : ''}
    </div>
    <div class="card-info">
      <span class="card-name">${escHtml(a.name)}</span>
      <span class="card-genre">${escHtml(a.genre || '')}</span>
    </div>
  </div>`;
}

// ── Counts & filters ──────────────────────────────────────
function updateCounts() {
  const count = s => allAnimes.filter(a => a.status === s).length;
  document.getElementById('count-all').textContent       = allAnimes.length;
  document.getElementById('count-visto').textContent     = count('Visto');
  document.getElementById('count-viendo').textContent    = count('Viendo');
  document.getElementById('count-pendiente').textContent = count('Pendiente');
  document.getElementById('count-novisto').textContent   = count('No visto');
  document.getElementById('count-abandonado').textContent= count('Abandonado');
}

function updateStats() {
  document.getElementById('stat-total').textContent = allAnimes.length;
  const scores = allAnimes.map(a => a.score).filter(s => s != null);
  const avg = scores.length ? (scores.reduce((s,v) => s+v, 0) / scores.length).toFixed(1) : '—';
  document.getElementById('stat-score').textContent = avg;
}

function updateGenreFilters() {
  const genres = [...new Set(
    allAnimes.flatMap(a => (a.genre || '').split(',').map(g => g.trim()).filter(Boolean))
  )].sort();

  const container = document.getElementById('genreFilters');
  container.innerHTML = `<p class="nav-label">Género</p>` +
    genres.map(g => `<button class="genre-btn${filterGenre === g ? ' active' : ''}" onclick="setGenre('${escHtml(g)}')">${escHtml(g)}</button>`).join('');
}

function updateActiveFilters() {
  const el = document.getElementById('activeFilters');
  const pills = [];
  if (filterStatus !== 'all') pills.push({ label: filterStatus, clear: () => setStatus('all') });
  if (filterGenre)            pills.push({ label: filterGenre,  clear: () => setGenre(null) });
  if (searchQuery)            pills.push({ label: `"${searchQuery}"`, clear: () => { searchInput.value=''; setSearch(''); } });
  el.innerHTML = pills.map((p,i) =>
    `<div class="filter-pill">${escHtml(p.label)}<button onclick="clearFilter(${i})">×</button></div>`
  ).join('');
  window._filterClears = pills.map(p => p.clear);
}

window.clearFilter = i => { window._filterClears?.[i]?.(); };

// ── Filter setters ────────────────────────────────────────
window.setStatus = function(s) {
  filterStatus = s;
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.filter === s);
  });
  renderAll();
};

window.setGenre = function(g) {
  filterGenre = g === filterGenre ? null : g;
  renderAll();
};

function setSearch(q) { searchQuery = q; renderAll(); }

// ── Detail modal ──────────────────────────────────────────
window.openDetail = async function(id) {
  const a = allAnimes.find(x => x.id === id);
  if (!a) return;
  editingId = id;

  document.getElementById('detailName').textContent   = a.name || '';
  document.getElementById('detailGenre').textContent  = a.genre || '';
  document.getElementById('detailDesc').textContent   = a.descripcion || 'Sin descripción.';
  document.getElementById('detailScore').textContent  = a.score != null ? `★ ${a.score}` : '';
  const statusEl = document.getElementById('detailStatus');
  statusEl.textContent = a.status || '';
  statusEl.className = `detail-status ${statusCssClass(a.status)}`;

  const linkEl = document.getElementById('detailLink');
  if (a.link) { linkEl.href = a.link; linkEl.style.display = ''; }
  else linkEl.style.display = 'none';

  const img = document.getElementById('detailImg');
  const poster = posterCache[a.name] || await fetchPoster(a.name);
  img.src = poster || '';
  img.style.display = poster ? '' : 'none';

  document.getElementById('detailOverlay').classList.remove('hidden');
};

document.getElementById('closeDetail').onclick = () => {
  document.getElementById('detailOverlay').classList.add('hidden');
};
document.getElementById('detailOverlay').onclick = e => {
  if (e.target === document.getElementById('detailOverlay'))
    document.getElementById('detailOverlay').classList.add('hidden');
};

document.getElementById('detailEdit').onclick = () => {
  document.getElementById('detailOverlay').classList.add('hidden');
  openEditModal(editingId);
};

document.getElementById('detailDelete').onclick = async () => {
  if (!confirm('¿Eliminar este anime?')) return;
  const { error } = await db.from('animes').delete().eq('id', editingId);
  if (error) { showToast('Error al eliminar'); return; }
  allAnimes = allAnimes.filter(a => a.id !== editingId);
  document.getElementById('detailOverlay').classList.add('hidden');
  renderAll();
  showToast('Anime eliminado');
};

// ── Add / Edit modal ──────────────────────────────────────
document.getElementById('openModal').onclick = () => openAddModal();
document.getElementById('closeModal').onclick  = closeModal;
document.getElementById('cancelModal').onclick = closeModal;
document.getElementById('modalOverlay').onclick = e => {
  if (e.target === document.getElementById('modalOverlay')) closeModal();
};

function openAddModal() {
  editingId = null;
  document.getElementById('modalTitle').textContent = 'Nuevo Anime';
  document.getElementById('editId').value = '';
  ['fName','fScore','fGenre','fLink','fDesc'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('fStatus').value = 'No visto';
  document.getElementById('modalOverlay').classList.remove('hidden');
  setTimeout(() => document.getElementById('fName').focus(), 50);
}

function openEditModal(id) {
  const a = allAnimes.find(x => x.id === id);
  if (!a) return;
  editingId = id;
  document.getElementById('modalTitle').textContent = 'Editar Anime';
  document.getElementById('editId').value    = a.id;
  document.getElementById('fName').value     = a.name || '';
  document.getElementById('fScore').value    = a.score ?? '';
  document.getElementById('fGenre').value    = a.genre || '';
  document.getElementById('fStatus').value   = a.status || 'No visto';
  document.getElementById('fLink').value     = a.link || '';
  document.getElementById('fDesc').value     = a.descripcion || '';
  document.getElementById('modalOverlay').classList.remove('hidden');
}

function closeModal() { document.getElementById('modalOverlay').classList.add('hidden'); }

document.getElementById('saveAnime').onclick = async () => {
  const name = document.getElementById('fName').value.trim();
  if (!name) { showToast('El nombre es obligatorio'); return; }

  const payload = {
    name,
    score:      parseFloat(document.getElementById('fScore').value) || null,
    genre:      document.getElementById('fGenre').value.trim() || null,
    status:     document.getElementById('fStatus').value,
    link:       document.getElementById('fLink').value.trim() || null,
    descripcion:document.getElementById('fDesc').value.trim() || null,
  };

  const id = document.getElementById('editId').value;
  if (id) {
    const { error } = await db.from('animes').update(payload).eq('id', id);
    if (error) { showToast('Error al guardar'); return; }
    const idx = allAnimes.findIndex(a => a.id === id);
    if (idx >= 0) allAnimes[idx] = { ...allAnimes[idx], ...payload };
    // Invalidate poster cache if name changed
    if (allAnimes[idx] && allAnimes[idx].name !== name) delete posterCache[allAnimes[idx].name];
    showToast('Anime actualizado ✓');
  } else {
    const { data, error } = await db.from('animes').insert(payload).select().single();
    if (error) { showToast('Error al guardar'); return; }
    allAnimes.unshift(data);
    showToast('Anime añadido ✓');
  }

  closeModal();
  renderAll();
};

// ── Sidebar nav ───────────────────────────────────────────
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.onclick = () => setStatus(btn.dataset.filter);
});

// ── Sort & view ───────────────────────────────────────────
sortSelect.onchange = () => { sortMode = sortSelect.value; renderAll(); };

document.getElementById('gridBtn').onclick = () => {
  viewMode = 'grid';
  grid.classList.remove('list-view');
  document.getElementById('gridBtn').classList.add('active');
  document.getElementById('listBtn').classList.remove('active');
  renderGrid();
};
document.getElementById('listBtn').onclick = () => {
  viewMode = 'list';
  grid.classList.add('list-view');
  document.getElementById('listBtn').classList.add('active');
  document.getElementById('gridBtn').classList.remove('active');
  renderGrid();
};

// ── Search ────────────────────────────────────────────────
searchInput.addEventListener('input', () => setSearch(searchInput.value.trim()));

document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    searchInput.focus();
  }
  if (e.key === 'Escape') {
    closeModal();
    document.getElementById('detailOverlay').classList.add('hidden');
    document.getElementById('sidebar').classList.remove('open');
  }
});

// ── Hamburger ─────────────────────────────────────────────
document.getElementById('hamburger').onclick = () => {
  document.getElementById('sidebar').classList.toggle('open');
};

// ── Toast ─────────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2500);
}

// ── Helpers ───────────────────────────────────────────────
function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function getInitials(name) {
  return (name || '?').split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase();
}
// Used inline in onerror
window.initials = n => `<div class="card-poster-placeholder">${getInitials(n)}</div>`;

function statusCssClass(s) {
  const map = { 'Visto':'status-visto','Viendo':'status-viendo','Pendiente':'status-pendiente','No visto':'status-novisto','Abandonado':'status-abandonado' };
  return map[s] || '';
}
function statusColor(s) {
  const map = { 'Visto':'#4ade80','Viendo':'#60a5fa','Pendiente':'#fbbf24','No visto':'#94a3b8','Abandonado':'#f87171' };
  return map[s] || '#94a3b8';
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Boot ──────────────────────────────────────────────────
loadAnimes();
