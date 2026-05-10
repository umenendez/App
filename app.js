// ─────────────────────────────────────────────────────────
// AniTrack — app.js
// ─────────────────────────────────────────────────────────

// ── Init Supabase ─────────────────────────────────────────
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

// ── Normalizar status con símbolos del CSV ─────────────────
function normalizeStatus(raw) {
  if (!raw) return 'No visto';
  const s = String(raw).trim();
  const map = {
    '✔': 'Visto',   '✔️': 'Visto',
    '📉': 'Abandonado',
    '-': 'Viendo',
    '✖': 'No visto', '✖️': 'No visto',
    '@': 'Pendiente',
    'visto': 'Visto', 'viendo': 'Viendo',
    'pendiente': 'Pendiente', 'no visto': 'No visto',
    'abandonado': 'Abandonado', 'dropeado': 'Abandonado',
  };
  return map[s] || map[s.toLowerCase()] || s;
}

// ── Poster cache ──────────────────────────────────────────
const POSTER_CACHE_KEY = 'anitrack_posters_v2';
let posterCache = {};
try { posterCache = JSON.parse(sessionStorage.getItem(POSTER_CACHE_KEY) || '{}'); } catch {}
function savePosterCache() {
  try { sessionStorage.setItem(POSTER_CACHE_KEY, JSON.stringify(posterCache)); } catch {}
}

// Obtiene portada: 1) image_url manual, 2) og:image del link, 3) Jikan
async function fetchPoster(anime) {
  if (anime.image_url) return anime.image_url;

  const cacheKey = anime.id;
  if (posterCache[cacheKey] !== undefined) return posterCache[cacheKey];

  // 2. og:image del link (animeflv, etc.)
  if (anime.link) {
    try {
      const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(anime.link)}`;
      const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(6000) });
      if (res.ok) {
        const json = await res.json();
        const html = json.contents || '';
        const match = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
                   || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
        if (match && match[1] && match[1].startsWith('http')) {
          posterCache[cacheKey] = match[1];
          savePosterCache();
          return match[1];
        }
      }
    } catch {}
  }

  // 3. Jikan (MAL) como fallback
  try {
    const query = encodeURIComponent((anime.name || '').trim());
    const res = await fetch(`https://api.jikan.moe/v4/anime?q=${query}&limit=1&sfw`,
                            { signal: AbortSignal.timeout(6000) });
    if (res.ok) {
      const data = await res.json();
      const img = data.data?.[0]?.images?.jpg?.large_image_url
                || data.data?.[0]?.images?.jpg?.image_url
                || null;
      posterCache[cacheKey] = img;
      savePosterCache();
      return img;
    }
  } catch {}

  posterCache[cacheKey] = null;
  savePosterCache();
  return null;
}

// ── State ─────────────────────────────────────────────────
let allAnimes    = [];
let filterStatus = 'all';
let filterGenre  = null;
let searchQuery  = '';
let sortMode     = 'name';
let viewMode     = 'grid';
let editingId    = null;

// ── DOM refs ──────────────────────────────────────────────
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
  allAnimes = (data || []).map(a => ({ ...a, status: normalizeStatus(a.status) }));
  renderAll();
}

// ── Render ────────────────────────────────────────────────
function getFiltered() {
  let list = [...allAnimes];
  if (filterStatus !== 'all') list = list.filter(a => a.status === filterStatus);
  if (filterGenre) list = list.filter(a => a.genre && a.genre.toLowerCase().includes(filterGenre.toLowerCase()));
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
  grid.innerHTML = list.map(a => cardHTML(a, null)).join('');

  const BATCH = 3, DELAY = 500;
  for (let i = 0; i < list.length; i += BATCH) {
    const batch = list.slice(i, i + BATCH);
    await Promise.all(batch.map(async a => {
      const url = await fetchPoster(a);
      const el = document.getElementById(`poster-${a.id}`);
      if (el && url) {
        el.innerHTML = `<img src="${escHtml(url)}" alt="${escHtml(a.name)}" loading="lazy" onerror="this.parentElement.innerHTML=fallbackPoster('${escAttr(a.name)}')" />`;
      }
    }));
    if (i + BATCH < list.length) await sleep(DELAY);
  }
}

function cardHTML(a) {
  const sc = statusCssClass(a.status);
  const placeholder = `<div class="card-poster-placeholder">${getInitials(a.name)}</div>`;
  const visitBtn = a.link
    ? `<a class="card-visit-btn" href="${escHtml(a.link)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">▶ Ver</a>`
    : '';

  if (viewMode === 'list') {
    return `
    <div class="anime-card" onclick="openDetail('${a.id}')">
      <div class="card-poster" id="poster-${a.id}">${placeholder}</div>
      <div class="card-info">
        <span class="card-name">${escHtml(a.name)}</span>
        <span class="card-genre">${escHtml(a.genre || '—')}</span>
        <span class="list-score">${a.score != null ? a.score : '—'}</span>
        <span class="list-status">
          <span class="list-dot" style="background:${statusColor(a.status)}"></span>
          <span class="${sc}">${escHtml(a.status)}</span>
        </span>
        ${a.link ? `<a class="list-visit-btn" href="${escHtml(a.link)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Ver →</a>` : '<span></span>'}
      </div>
    </div>`;
  }

  return `
  <div class="anime-card" onclick="openDetail('${a.id}')">
    <div class="card-poster" id="poster-${a.id}">
      ${placeholder}
      <div class="card-overlay">${visitBtn}</div>
      <span class="card-status-badge ${sc}">${escHtml(a.status)}</span>
      ${a.score != null ? `<span class="card-score-badge">★ ${a.score}</span>` : ''}
    </div>
    <div class="card-info">
      <span class="card-name">${escHtml(a.name)}</span>
      <span class="card-genre">${escHtml(a.genre || '')}</span>
    </div>
  </div>`;
}

// ── Counts ────────────────────────────────────────────────
function updateCounts() {
  const c = s => allAnimes.filter(a => a.status === s).length;
  document.getElementById('count-all').textContent        = allAnimes.length;
  document.getElementById('count-visto').textContent      = c('Visto');
  document.getElementById('count-viendo').textContent     = c('Viendo');
  document.getElementById('count-pendiente').textContent  = c('Pendiente');
  document.getElementById('count-novisto').textContent    = c('No visto');
  document.getElementById('count-abandonado').textContent = c('Abandonado');
}

function updateStats() {
  document.getElementById('stat-total').textContent = allAnimes.length;
  const scores = allAnimes.map(a => a.score).filter(s => s != null);
  const avg = scores.length ? (scores.reduce((s,v) => s+v, 0) / scores.length).toFixed(1) : '—';
  document.getElementById('stat-score').textContent = avg;
}

// Filtra géneros basura (como ")" o entradas de 1 carácter)
function isValidGenre(g) {
  if (!g || g.length < 2) return false;
  // Debe contener al menos una letra
  return /[a-záéíóúüñA-ZÁÉÍÓÚÜÑ]/u.test(g);
}

function updateGenreFilters() {
  const genres = [...new Set(
    allAnimes.flatMap(a =>
      (a.genre || '').split(',').map(g => g.trim()).filter(isValidGenre)
    )
  )].sort();

  const container = document.getElementById('genreFilters');
  container.innerHTML = `<p class="nav-label">Género</p>` +
    genres.map(g =>
      `<button class="genre-btn${filterGenre === g ? ' active' : ''}" onclick="setGenre('${escAttr(g)}')">${escHtml(g)}</button>`
    ).join('');
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
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === s));
  renderAll();
};
window.setGenre = function(g) {
  filterGenre = (g && g !== filterGenre) ? g : null;
  renderAll();
};
function setSearch(q) { searchQuery = q; renderAll(); }

// ── Detail modal ──────────────────────────────────────────
window.openDetail = async function(id) {
  const a = allAnimes.find(x => x.id === id);
  if (!a) return;
  editingId = id;

  document.getElementById('detailName').textContent  = a.name || '';
  document.getElementById('detailGenre').textContent = a.genre || '';
  document.getElementById('detailDesc').textContent  = a.descripcion || 'Sin descripción.';
  document.getElementById('detailScore').textContent = a.score != null ? `★ ${a.score}` : '';
  const statusEl = document.getElementById('detailStatus');
  statusEl.textContent = a.status || '';
  statusEl.className   = `detail-status ${statusCssClass(a.status)}`;

  const linkEl = document.getElementById('detailLink');
  if (a.link) { linkEl.href = a.link; linkEl.style.display = ''; }
  else linkEl.style.display = 'none';

  const img = document.getElementById('detailImg');
  img.src = ''; img.style.display = 'none';
  const poster = await fetchPoster(a);
  if (poster) { img.src = poster; img.style.display = ''; }

  document.getElementById('detailOverlay').classList.remove('hidden');
};

document.getElementById('closeDetail').onclick = () =>
  document.getElementById('detailOverlay').classList.add('hidden');
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
document.getElementById('openModal').onclick   = () => openAddModal();
document.getElementById('closeModal').onclick  = closeModal;
document.getElementById('cancelModal').onclick = closeModal;
document.getElementById('modalOverlay').onclick = e => {
  if (e.target === document.getElementById('modalOverlay')) closeModal();
};

function openAddModal() {
  editingId = null;
  document.getElementById('modalTitle').textContent = 'Nuevo Anime';
  document.getElementById('editId').value = '';
  ['fName','fScore','fGenre','fLink','fImage','fDesc'].forEach(id => document.getElementById(id).value = '');
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
  document.getElementById('fImage').value    = a.image_url || '';
  document.getElementById('fDesc').value     = a.descripcion || '';
  document.getElementById('modalOverlay').classList.remove('hidden');
}

function closeModal() { document.getElementById('modalOverlay').classList.add('hidden'); }

document.getElementById('saveAnime').onclick = async () => {
  const name = document.getElementById('fName').value.trim();
  if (!name) { showToast('El nombre es obligatorio'); return; }

  const payload = {
    name,
    score:      parseScore(document.getElementById('fScore').value),
    genre:      document.getElementById('fGenre').value.trim() || null,
    status:     document.getElementById('fStatus').value,
    link:       document.getElementById('fLink').value.trim() || null,
    image_url:  document.getElementById('fImage').value.trim() || null,
    descripcion:document.getElementById('fDesc').value.trim() || null,
  };

  const id = document.getElementById('editId').value;
  if (id) {
    const { error } = await db.from('animes').update(payload).eq('id', id);
    if (error) { showToast('Error: ' + error.message); return; }
    const idx = allAnimes.findIndex(a => a.id === id);
    if (idx >= 0) allAnimes[idx] = { ...allAnimes[idx], ...payload };
    delete posterCache[id]; savePosterCache();
    showToast('Anime actualizado ✓');
  } else {
    const { data, error } = await db.from('animes').insert(payload).select().single();
    if (error) { showToast('Error: ' + error.message); return; }
    allAnimes.unshift({ ...data, status: normalizeStatus(data.status) });
    showToast('Anime añadido ✓');
  }
  closeModal();
  renderAll();
};

// ── Sidebar, sort, view ───────────────────────────────────
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.onclick = () => setStatus(btn.dataset.filter);
});
sortSelect.onchange = () => { sortMode = sortSelect.value; renderAll(); };

document.getElementById('gridBtn').onclick = () => {
  viewMode = 'grid'; grid.classList.remove('list-view');
  document.getElementById('gridBtn').classList.add('active');
  document.getElementById('listBtn').classList.remove('active');
  renderGrid();
};
document.getElementById('listBtn').onclick = () => {
  viewMode = 'list'; grid.classList.add('list-view');
  document.getElementById('listBtn').classList.add('active');
  document.getElementById('gridBtn').classList.remove('active');
  renderGrid();
};

searchInput.addEventListener('input', () => setSearch(searchInput.value.trim()));

document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); searchInput.focus(); }
  if (e.key === 'Escape') {
    closeModal();
    document.getElementById('detailOverlay').classList.add('hidden');
    document.getElementById('sidebar').classList.remove('open');
  }
});

document.getElementById('hamburger').onclick = () =>
  document.getElementById('sidebar').classList.toggle('open');

// ── Toast ─────────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 3000);
}

// ── Helpers ───────────────────────────────────────────────
function escHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escAttr(s) {
  return String(s||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
}
function getInitials(name) {
  return (name||'?').split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase();
}
window.fallbackPoster = n => `<div class="card-poster-placeholder">${getInitials(n)}</div>`;

function statusCssClass(s) {
  return { 'Visto':'status-visto','Viendo':'status-viendo','Pendiente':'status-pendiente','No visto':'status-novisto','Abandonado':'status-abandonado' }[s] || 'status-novisto';
}
function statusColor(s) {
  return { 'Visto':'#4ade80','Viendo':'#60a5fa','Pendiente':'#fbbf24','No visto':'#94a3b8','Abandonado':'#f87171' }[s] || '#94a3b8';
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function parseScore(val) {
  if (val === '' || val == null) return null;
  const n = parseFloat(String(val).replace(',','.'));
  return isNaN(n) ? null : Math.min(10, Math.max(0, n));
}

// ── Boot ──────────────────────────────────────────────────
loadAnimes();
