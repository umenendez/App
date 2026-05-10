// ─────────────────────────────────────────────────────────
// SUPABASE CLIENT
// ─────────────────────────────────────────────────────────
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────
let allAnimes = [];
let activeStatus = null;
let activeGenre = null;
let currentView = 'grid';
let currentPage = 'library';
let editId = null;
let debounceTimer = null;

const STATUS_LIST = ['Visto', 'Viendo', 'No visto', 'Pendiente', 'Abandonado'];
const STATUS_SLUG = s => (s || 'novisto').toLowerCase().replace(' ', '');
const STATUS_CLASS = s => 's-' + STATUS_SLUG(s);
const DOT_CLASS   = s => 'dot-' + STATUS_SLUG(s);
const BAR_CLASS   = s => 'bar-' + STATUS_SLUG(s);

// ─────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────
async function init() {
  showLoading(true);
  const { data, error } = await db
    .from('animes')
    .select('*')
    .order('name', { ascending: true });

  if (error) {
    showLoading(false);
    showToast('Error al conectar con Supabase. Revisa config.js.', 'error');
    console.error(error);
    return;
  }

  allAnimes = data || [];
  showLoading(false);
  buildSidebarFilters();
  render();
}

// ─────────────────────────────────────────────────────────
// FILTERING & SORTING
// ─────────────────────────────────────────────────────────
function getFiltered() {
  const q = document.getElementById('searchInput').value.toLowerCase().trim();
  const sort = document.getElementById('sortSelect').value;

  let list = allAnimes.filter(a => {
    const matchQ = !q ||
      (a.name || '').toLowerCase().includes(q) ||
      (a.descripcion || '').toLowerCase().includes(q) ||
      (a.genre || '').toLowerCase().includes(q);
    const matchS = !activeStatus || (a.status || '') === activeStatus;
    const matchG = !activeGenre || (a.genre || '') === activeGenre;
    return matchQ && matchS && matchG;
  });

  list.sort((a, b) => {
    if (sort === 'name_asc')   return (a.name || '').localeCompare(b.name || '');
    if (sort === 'name_desc')  return (b.name || '').localeCompare(a.name || '');
    if (sort === 'score_desc') return (b.score || 0) - (a.score || 0);
    if (sort === 'score_asc')  return (a.score || 0) - (b.score || 0);
    return 0;
  });

  return list;
}

// ─────────────────────────────────────────────────────────
// RENDER LIBRARY
// ─────────────────────────────────────────────────────────
function render() {
  const list = getFiltered();
  const grid = document.getElementById('animeGrid');
  const empty = document.getElementById('emptyState');
  const badge = document.getElementById('countBadge');

  badge.textContent = list.length + ' títulos';

  if (!list.length) {
    grid.innerHTML = '';
    empty.style.display = 'flex';
    return;
  }
  empty.style.display = 'none';

  grid.innerHTML = list.map((a, i) => buildCard(a, i)).join('');
  buildSidebarFilters();
}

function buildCard(a, i) {
  const slug = STATUS_SLUG(a.status);
  const scoreHtml = a.score > 0
    ? `<div class="score-badge">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>
        ${parseFloat(a.score).toFixed(1)}
      </div>`
    : '';
  const nameHtml = a.link
    ? `<a href="${esc(a.link)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${esc(a.name)}</a>`
    : esc(a.name);

  const delay = Math.min(i * 30, 300);

  return `
  <div class="anime-card" style="animation-delay:${delay}ms" onclick="editAnime('${a.id}')">
    <div class="card-color-bar ${BAR_CLASS(a.status)}"></div>
    <div class="card-body">
      <div class="card-top">
        <div class="card-name">${nameHtml}</div>
        ${scoreHtml}
      </div>
      <div class="card-genre">${esc(a.genre || '—')}</div>
      <div class="card-desc">${esc(a.descripcion || 'Sin descripción.')}</div>
      <div class="card-footer">
        <span class="status-pill ${STATUS_CLASS(a.status)}">${esc(a.status || 'No visto')}</span>
        <div class="card-actions">
          <button class="action-btn" onclick="event.stopPropagation(); editAnime('${a.id}')" title="Editar">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="action-btn delete" onclick="event.stopPropagation(); deleteAnime('${a.id}', '${esc(a.name)}')" title="Eliminar">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          </button>
        </div>
      </div>
    </div>
  </div>`;
}

// ─────────────────────────────────────────────────────────
// SIDEBAR FILTERS
// ─────────────────────────────────────────────────────────
function buildSidebarFilters() {
  // Status chips
  const statusCounts = {};
  STATUS_LIST.forEach(s => statusCounts[s] = 0);
  allAnimes.forEach(a => { if (statusCounts[a.status] !== undefined) statusCounts[a.status]++; });

  document.getElementById('statusFilters').innerHTML = STATUS_LIST.map(s => `
    <button class="filter-chip ${activeStatus === s ? 'active' : ''}" onclick="toggleStatus('${s}')">
      <span class="chip-left">
        <span class="chip-dot ${DOT_CLASS(s)}"></span>${s}
      </span>
      <span class="chip-count">${statusCounts[s]}</span>
    </button>
  `).join('');

  // Genre chips
  const genres = [...new Set(allAnimes.map(a => a.genre).filter(Boolean))].sort();
  const genreCounts = {};
  genres.forEach(g => genreCounts[g] = allAnimes.filter(a => a.genre === g).length);

  document.getElementById('genreFilters').innerHTML = genres.map(g => `
    <button class="filter-chip ${activeGenre === g ? 'active' : ''}" onclick="toggleGenre('${esc(g)}')">
      <span class="chip-left">
        <span class="chip-dot" style="background:var(--text3)"></span>${esc(g)}
      </span>
      <span class="chip-count">${genreCounts[g]}</span>
    </button>
  `).join('');

  // Datalist for form
  document.getElementById('genreDatalist').innerHTML = genres.map(g => `<option value="${esc(g)}">`).join('');
}

function toggleStatus(s) {
  activeStatus = activeStatus === s ? null : s;
  render();
}
function toggleGenre(g) {
  activeGenre = activeGenre === g ? null : g;
  render();
}

// ─────────────────────────────────────────────────────────
// STATS VIEW
// ─────────────────────────────────────────────────────────
function renderStats() {
  const total = allAnimes.length;
  const scored = allAnimes.filter(a => a.score > 0);
  const avgScore = scored.length ? (scored.reduce((s, a) => s + a.score, 0) / scored.length) : 0;
  const topGenre = (() => {
    const cnt = {};
    allAnimes.forEach(a => { if (a.genre) cnt[a.genre] = (cnt[a.genre] || 0) + 1; });
    return Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
  })();
  const vistos = allAnimes.filter(a => a.status === 'Visto').length;

  document.getElementById('statsGrid').innerHTML = `
    <div class="stat-card"><div class="stat-num" style="color:var(--text)">${total}</div><div class="stat-label">Total en biblioteca</div></div>
    <div class="stat-card"><div class="stat-num" style="color:var(--green)">${vistos}</div><div class="stat-label">Completados</div></div>
    <div class="stat-card"><div class="stat-num" style="color:var(--gold)">${avgScore > 0 ? avgScore.toFixed(1) : '—'}</div><div class="stat-label">Puntuación media</div></div>
    <div class="stat-card"><div class="stat-num" style="color:var(--accent);font-size:28px;padding-top:8px">${topGenre}</div><div class="stat-label">Género favorito</div></div>
  `;

  // Status bars
  const statusData = STATUS_LIST.map(s => ({
    label: s,
    count: allAnimes.filter(a => a.status === s).length
  }));
  const maxCount = Math.max(...statusData.map(s => s.count), 1);

  const barsHtml = statusData.map(s => `
    <div class="bar-row">
      <div class="bar-row-label">${s.label}</div>
      <div class="bar-track">
        <div class="bar-fill ${BAR_CLASS(s.label)}" style="width:${Math.round(s.count / maxCount * 100)}%"></div>
      </div>
      <div class="bar-row-count">${s.count}</div>
    </div>
  `).join('');

  // Genre list
  const genres = [...new Set(allAnimes.map(a => a.genre).filter(Boolean))].sort();
  const genreCounts = genres.map(g => ({ g, n: allAnimes.filter(a => a.genre === g).length }))
    .sort((a, b) => b.n - a.n).slice(0, 10);

  const genreHtml = genreCounts.map(({ g, n }) => `
    <div class="genre-item"><span class="genre-item-name">${esc(g)}</span><span class="genre-item-count">${n}</span></div>
  `).join('');

  document.getElementById('chartsRow').innerHTML = `
    <div class="chart-card">
      <div class="chart-title">Por estado</div>
      <div class="bar-chart">${barsHtml}</div>
    </div>
    <div class="chart-card">
      <div class="chart-title">Por género</div>
      <div class="genre-list">${genreHtml || '<p style="color:var(--text3);font-size:13px">Sin datos</p>'}</div>
    </div>
  `;
}

// ─────────────────────────────────────────────────────────
// VIEW SWITCHING
// ─────────────────────────────────────────────────────────
function switchView(view, btn) {
  currentPage = view;
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
  document.getElementById('view-' + view).style.display = 'block';

  if (view === 'stats') renderStats();
}

function setView(mode) {
  currentView = mode;
  document.getElementById('animeGrid').className = 'anime-grid' + (mode === 'list' ? ' list-view' : '');
  document.getElementById('gridBtn').classList.toggle('active', mode === 'grid');
  document.getElementById('listBtn').classList.toggle('active', mode === 'list');
}

// ─────────────────────────────────────────────────────────
// MODAL
// ─────────────────────────────────────────────────────────
function openModal() {
  editId = null;
  document.getElementById('modalHeading').textContent = 'Añadir anime';
  clearForm();
  document.getElementById('modalOverlay').classList.add('open');
  document.getElementById('fName').focus();
}

function editAnime(id) {
  const a = allAnimes.find(x => x.id === id);
  if (!a) return;
  editId = id;
  document.getElementById('modalHeading').textContent = 'Editar anime';
  document.getElementById('fName').value = a.name || '';
  document.getElementById('fScore').value = a.score || '';
  document.getElementById('fGenre').value = a.genre || '';
  document.getElementById('fStatus').value = a.status || 'No visto';
  document.getElementById('fLink').value = a.link || '';
  document.getElementById('fDesc').value = a.descripcion || '';
  document.getElementById('modalOverlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  editId = null;
}

function closeModalOutside(e) {
  if (e.target === document.getElementById('modalOverlay')) closeModal();
}

function clearForm() {
  ['fName', 'fScore', 'fGenre', 'fLink', 'fDesc'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('fStatus').value = 'No visto';
}

// ─────────────────────────────────────────────────────────
// CRUD
// ─────────────────────────────────────────────────────────
async function saveAnime() {
  const name = document.getElementById('fName').value.trim();
  if (!name) { showToast('El título es obligatorio.', 'error'); return; }

  const payload = {
    name,
    score: parseFloat(document.getElementById('fScore').value) || null,
    genre: document.getElementById('fGenre').value.trim() || null,
    status: document.getElementById('fStatus').value,
    link: document.getElementById('fLink').value.trim() || null,
    descripcion: document.getElementById('fDesc').value.trim() || null,
  };

  const saveBtn = document.getElementById('saveBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Guardando…';

  let error;

  if (editId) {
    const res = await db.from('animes').update(payload).eq('id', editId);
    error = res.error;
    if (!error) {
      const idx = allAnimes.findIndex(a => a.id === editId);
      if (idx !== -1) allAnimes[idx] = { ...allAnimes[idx], ...payload };
      showToast('Anime actualizado ✓', 'success');
    }
  } else {
    const res = await db.from('animes').insert([payload]).select();
    error = res.error;
    if (!error && res.data?.length) {
      allAnimes.push(res.data[0]);
      showToast('Anime añadido ✓', 'success');
    }
  }

  saveBtn.disabled = false;
  saveBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Guardar`;

  if (error) { showToast('Error: ' + error.message, 'error'); return; }

  closeModal();
  buildSidebarFilters();
  render();
}

async function deleteAnime(id, name) {
  if (!confirm(`¿Eliminar "${name}"? Esta acción no se puede deshacer.`)) return;

  const { error } = await db.from('animes').delete().eq('id', id);
  if (error) { showToast('Error al eliminar: ' + error.message, 'error'); return; }

  allAnimes = allAnimes.filter(a => a.id !== id);
  showToast('Anime eliminado.', 'success');
  buildSidebarFilters();
  render();
}

// ─────────────────────────────────────────────────────────
// UI HELPERS
// ─────────────────────────────────────────────────────────
function showLoading(show) {
  document.getElementById('loadingState').style.display = show ? 'flex' : 'none';
  document.getElementById('animeGrid').style.display = show ? 'none' : 'grid';
}

function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = 'toast'; }, 3000);
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

function debounceRender() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(render, 200);
}

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─────────────────────────────────────────────────────────
// KEYBOARD
// ─────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    document.getElementById('searchInput').focus();
  }
});

// ─────────────────────────────────────────────────────────
// START
// ─────────────────────────────────────────────────────────
init();
