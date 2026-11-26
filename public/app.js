const state = {
  users: [],
  currentUser: null,
  items: [],
  myAvailableItems: [],
  trades: [],
  filters: {
    q: '',
    category: 'Todas',
    type: 'todos',
    status: 'disponible',
    nearMe: false
  },
  activeTab: 'received',
  uploadedImageDataUrl: '',
  uploadedImages: [],
  uploadedThumbDataUrl: '',
  uploadedBlurDataUrl: ''
};

// Helpers
const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showToast(message, isError = false) {
  const container = $('#toastContainer');
  const el = document.createElement('div');
  el.className = `toast ${isError ? 'error' : ''}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3400);
}

async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error en la petición');
  return data;
}

function openModal(id) {
  $(`#${id}`).classList.remove('hidden');
}

function closeModal(id) {
  $(`#${id}`).classList.add('hidden');
  if (id === 'detailModal' && window.location.pathname.startsWith('/objeto/')) {
    history.pushState({}, '', '/');
    document.title = 'truecalo — Plataforma de trueque y segunda vida entre vecinos';
  }
}

function getInitials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0].toUpperCase())
    .join('') || '?';
}

function normalizeText(str = '') {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function computeBestMatch(targetItem, myItems) {
  if (!targetItem || targetItem.type !== 'trueque' || targetItem.status !== 'disponible') return null;
  if (!state.currentUser || targetItem.ownerId === state.currentUser.id || !myItems.length) return null;

  const looking = normalizeText(`${targetItem.lookingFor} ${targetItem.title} ${targetItem.category}`);
  const targetCity = normalizeText((targetItem.location || '').split(/[·,-]/)[0].trim());

  let best = null;
  for (const mine of myItems) {
    const myWords = normalizeText(`${mine.title} ${mine.category}`)
      .split(/\s+/)
      .filter(w => w.length >= 4);

    let hits = 0;
    for (const w of myWords) {
      if (looking.includes(w)) hits++;
    }

    const sameCity = targetCity && normalizeText(mine.location || '').includes(targetCity);
    if (hits > 0 || (mine.category === targetItem.category && sameCity)) {
      const score = Math.min(98, 72 + hits * 12 + (sameCity ? 8 : 0));
      if (!best || score > best.score) {
        best = { score, myItem: mine };
      }
    }
  }
  return best;
}

function formatRelativeDate(iso) {
  if (!iso) return 'Reciente';
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.max(0, Math.floor(diffMs / 86400000));
  if (days === 0) return 'Hoy';
  if (days === 1) return 'Ayer';
  if (days < 30) return `Hace ${days} días`;
  const months = Math.floor(days / 30);
  return months === 1 ? 'Hace 1 mes' : `Hace ${months} meses`;
}

// Init & Data Loading
async function init() {
  const urlParams = new URLSearchParams(window.location.search);
  const initialQuery = urlParams.get('q');
  if (initialQuery) {
    state.filters.q = initialQuery;
    $('#searchInput').value = initialQuery;
  }

  bindEvents();
  await loadUsers();
  await Promise.all([loadStats(), loadItems(), loadTrades()]);

  if (urlParams.get('welcome') === '1' && state.currentUser) {
    showToast(`¡Bienvenido/a ${state.currentUser.name}! Tu membresía de por vida (20 €) está activa.`);
    history.replaceState({}, '', '/');
  }

  const match = window.location.pathname.match(/^\/objeto\/([^/]+)$/);
  if (match) {
    openItemDetail(decodeURIComponent(match[1]));
  }
}

async function loadUsers() {
  state.users = await api('/api/users');
  const savedId = localStorage.getItem('truecalo_user_id');
  state.currentUser =
    state.users.find(u => u.id === savedId) || state.users[0] || null;
  if (state.currentUser) {
    localStorage.setItem('truecalo_user_id', state.currentUser.id);
  }
  renderUserNav();
  renderUserSwitcher();
}

async function loadStats() {
  const stats = await api('/api/stats');
  $('#statCompletedTrades').textContent = stats.completedTrades.toLocaleString('es-ES');
  $('#statGifts').textContent = stats.giftsCount.toLocaleString('es-ES');
  $('#statUsers').textContent = stats.totalUsers.toLocaleString('es-ES');
}

function getUserCityKeyword() {
  const raw = state.currentUser?.city || '';
  return raw.split(/[·,-]/)[0].trim();
}

async function loadItems() {
  renderSkeletons();
  const params = new URLSearchParams();
  if (state.filters.q) params.set('q', state.filters.q);
  if (state.filters.category !== 'Todas') params.set('category', state.filters.category);
  if (state.filters.type !== 'todos') params.set('type', state.filters.type);
  if (state.filters.status) params.set('status', state.filters.status);
  if (state.filters.nearMe) {
    const city = getUserCityKeyword();
    if (city && city.toLowerCase() !== 'sin ubicación') {
      params.set('location', city);
    }
  }

  state.items = await api(`/api/items?${params.toString()}`);
  if (state.currentUser) {
    state.myAvailableItems = await api(
      `/api/items?ownerId=${encodeURIComponent(state.currentUser.id)}&status=disponible`
    );
  } else {
    state.myAvailableItems = [];
  }
  renderItems();
}

async function loadTrades() {
  if (!state.currentUser) return;
  state.trades = await api(`/api/trades?userId=${encodeURIComponent(state.currentUser.id)}`);
  const pendingReceived = state.trades.filter(
    t => t.receiverId === state.currentUser.id && t.status === 'pendiente'
  ).length;
  const badge = $('#tradesBadge');
  badge.textContent = pendingReceived;
  badge.classList.toggle('hidden', pendingReceived === 0);
}

// Rendering
function renderUserNav() {
  if (!state.currentUser) return;
  const suffix = state.currentUser.lifetimeMember ? ' ★' : '';
  $('#navUserName').textContent = state.currentUser.name + suffix;
  const avatar = $('#navAvatar');
  avatar.textContent = getInitials(state.currentUser.name);
  avatar.style.background = state.currentUser.avatarColor || '#4F46E5';

  const summaryEl = $('#profileRepSummary');
  if (summaryEl) {
    const badges = (state.currentUser.badges || [])
      .map(b => `<span class="rep-badge">${escapeHtml(b)}</span>`)
      .join('');
    summaryEl.innerHTML = `
      <div class="reputation-line">
        <span class="stars">★★★★★</span>
        <strong>${(state.currentUser.rating ?? 5).toFixed(1)}</strong>
        <span class="rep-sep">·</span>
        <span>${state.currentUser.completedTrades || 0} trueques completados</span>
      </div>
      ${badges ? `<div class="badges-row">${badges}</div>` : ''}
    `;
  }
}

function renderUserSwitcher() {
  const sel = $('#userSwitcher');
  sel.innerHTML = state.users
    .map(
      u =>
        `<option value="${u.id}" ${u.id === state.currentUser?.id ? 'selected' : ''}>${escapeHtml(u.name)} (${escapeHtml(u.city)})</option>`
    )
    .join('');
}

function renderSkeletons(count = 6) {
  const grid = $('#itemsGrid');
  $('#emptyState').classList.add('hidden');
  grid.innerHTML = Array.from({ length: count })
    .map(
      () => `
      <div class="card card-skeleton" aria-hidden="true">
        <div class="skeleton-media skeleton-pulse"></div>
        <div class="card-body">
          <div class="skeleton-line skeleton-pulse" style="width:72%;height:18px"></div>
          <div class="skeleton-line skeleton-pulse" style="width:48%;height:14px"></div>
          <div class="skeleton-line skeleton-pulse" style="width:100%;height:52px;margin-top:6px"></div>
        </div>
      </div>
    `
    )
    .join('');
}

function getCardThumbUrl(item) {
  if (item.thumbImageUrl) return item.thumbImageUrl;
  if (item.imageUrl && item.imageUrl.includes('images.unsplash.com')) {
    return item.imageUrl.replace(/w=\d+/, 'w=600').replace(/q=\d+/, 'q=75');
  }
  return item.imageUrl || '';
}

function getBlurPlaceholder(item) {
  if (item.blurImageUrl) return item.blurImageUrl;
  if (item.imageUrl && item.imageUrl.includes('images.unsplash.com')) {
    return item.imageUrl.replace(/w=\d+/, 'w=40').replace(/q=\d+/, 'q=10');
  }
  return '';
}

function renderItems() {
  const grid = $('#itemsGrid');
  const empty = $('#emptyState');

  if (!state.items.length) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  grid.innerHTML = state.items
    .map((item, idx) => {
      const isDone = item.status === 'intercambiado';
      const typeLabel = item.type === 'regalo' ? '🎁 REGALO' : '🔄 TRUEQUE';
      const typeClass = item.type === 'regalo' ? 'tag-regalo' : 'tag-trueque';
      const blurSrc = getBlurPlaceholder(item);
      const cardSrc = getCardThumbUrl(item);
      const priorityAttrs = idx === 0
        ? 'fetchpriority="high" decoding="async"'
        : 'loading="lazy" decoding="async" fetchpriority="low"';
      const media = cardSrc
        ? `${blurSrc ? `<img class="card-blur-img" src="${escapeHtml(blurSrc)}" alt="" aria-hidden="true" />` : '<div class="card-blur-overlay"></div>'}<img class="card-full-img" src="${escapeHtml(cardSrc)}" alt="Imagen de ${escapeHtml(item.title)}" ${priorityAttrs} onload="this.parentElement.classList.add('is-loaded')" onerror="this.parentElement.classList.add('is-loaded');this.outerHTML='<div class=\\'card-placeholder\\'>📦</div>'" />`
        : `<div class="card-placeholder">📦</div>`;

      return `
        <article class="card" data-item-id="${item.id}" aria-labelledby="item-${escapeHtml(item.id)}">
          <div class="card-media ${cardSrc ? '' : 'is-loaded'}">
            ${media}
            <div class="card-badges">
              <span class="tag ${typeClass}">${typeLabel}</span>
              ${isDone ? '<span class="tag tag-done">Segunda vida ✓</span>' : ''}
            </div>
          </div>
          <div class="card-body">
            <h3 class="card-title" id="item-${escapeHtml(item.id)}">${escapeHtml(item.title)}</h3>
            <p class="card-location" aria-label="Ubicación ${escapeHtml(item.location)}">📍 ${escapeHtml(item.location)}</p>
            <div class="card-condition-row">
              <span class="condition-pill">${escapeHtml(item.condition)}</span>
              <span class="category-pill-mini">${escapeHtml(item.category)}</span>
            </div>
            <div class="card-looking-box">
              <span class="looking-label">${item.type === 'regalo' ? 'Modalidad' : 'Busca'}</span>
              <p class="card-looking-val">
                ${item.type === 'regalo' ? '🎁 Gratis para quien lo necesite' : escapeHtml(item.lookingFor)}
              </p>
            </div>
            ${(() => {
              const match = computeBestMatch(item, state.myAvailableItems);
              if (!match) return '';
              return `
                <div class="match-banner">
                  <div class="match-top">
                    <span>🤖 Coincidencia</span>
                    <strong>${match.score}%</strong>
                  </div>
                  <div class="match-track">
                    <div class="match-fill" style="width:${match.score}%"></div>
                  </div>
                  <span class="match-sub">Tu ${escapeHtml(match.myItem.title)} encaja con este trueque</span>
                </div>
              `;
            })()}
            <div class="card-trust-strip" aria-label="Métricas de confianza">
              <span class="trust-pill">⭐ ${(item.ownerRating ?? 5).toFixed(1)}</span>
              <span class="trust-pill">🏅 ${escapeHtml(item.ownerLevel || 'Nivel 1 · Nuevo')}</span>
              <span class="trust-pill">♻️ ${item.ownerCompletedTrades || 0} trueques</span>
            </div>
            <div class="card-footer">
              <span class="owner-chip">
                <span class="avatar" style="width:32px;height:32px;font-size:0.78rem;background:${escapeHtml(item.ownerAvatarColor)}">${getInitials(item.ownerName)}</span>
                <span class="owner-name-text">${escapeHtml(item.ownerName)}</span>
              </span>
              <button type="button" class="btn-card-view" aria-label="Ver detalles de ${escapeHtml(item.title)}">Ver artículo</button>
            </div>
          </div>
        </article>
      `;
    })
    .join('');
}

function attachPanPinchZoom(wrap, img) {
  let scale = 1;
  let tx = 0;
  let ty = 0;
  let lastTap = 0;
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let pinchStartDist = 0;
  let pinchStartScale = 1;

  const badge = wrap.querySelector('.zoom-level-badge');

  function clampTranslate(nextTx, nextTy, s) {
    const rect = wrap.getBoundingClientRect();
    const maxX = Math.max(0, (rect.width * (s - 1)) / 2);
    const maxY = Math.max(0, (rect.height * (s - 1)) / 2);
    return [
      Math.min(maxX, Math.max(-maxX, nextTx)),
      Math.min(maxY, Math.max(-maxY, nextTy))
    ];
  }

  function applyTransform(animate = false) {
    [tx, ty] = clampTranslate(tx, ty, scale);
    img.style.transition = animate ? 'transform 0.25s ease' : 'none';
    img.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`;
    wrap.classList.toggle('is-zoomed', scale > 1.02);
    wrap.style.touchAction = scale > 1.02 ? 'none' : 'pan-y';
    if (badge) badge.textContent = scale > 1.02 ? `🔍 ${scale.toFixed(1)}× (doble toque para reiniciar)` : '🔍 Pellizca o doble toque';
  }

  function setScale(nextScale, animate = false) {
    scale = Math.min(4, Math.max(1, nextScale));
    if (scale === 1) {
      tx = 0;
      ty = 0;
    }
    applyTransform(animate);
  }

  wrap.addEventListener('dblclick', e => {
    e.preventDefault();
    if (scale > 1.2) {
      setScale(1, true);
    } else {
      setScale(2.4, true);
    }
  });

  wrap.addEventListener('wheel', e => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.25 : -0.25;
    setScale(scale + delta, false);
  }, { passive: false });

  wrap.addEventListener('mousedown', e => {
    if (scale <= 1.02) return;
    dragging = true;
    startX = e.clientX - tx;
    startY = e.clientY - ty;
  });

  window.addEventListener('mousemove', e => {
    if (!dragging) return;
    tx = e.clientX - startX;
    ty = e.clientY - startY;
    applyTransform(false);
  });

  window.addEventListener('mouseup', () => {
    dragging = false;
  });

  wrap.addEventListener('touchstart', e => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStartDist = Math.hypot(dx, dy);
      pinchStartScale = scale;
      dragging = false;
    } else if (e.touches.length === 1) {
      const now = Date.now();
      if (now - lastTap < 280) {
        e.preventDefault();
        setScale(scale > 1.2 ? 1 : 2.4, true);
        lastTap = 0;
        return;
      }
      lastTap = now;
      if (scale > 1.02) {
        dragging = true;
        startX = e.touches[0].clientX - tx;
        startY = e.touches[0].clientY - ty;
      }
    }
  }, { passive: false });

  wrap.addEventListener('touchmove', e => {
    if (e.touches.length === 2 && pinchStartDist > 0) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      setScale(pinchStartScale * (dist / pinchStartDist), false);
    } else if (e.touches.length === 1 && dragging && scale > 1.02) {
      e.preventDefault();
      tx = e.touches[0].clientX - startX;
      ty = e.touches[0].clientY - startY;
      applyTransform(false);
    }
  }, { passive: false });

  wrap.addEventListener('touchend', () => {
    dragging = false;
    pinchStartDist = 0;
  });

  applyTransform(false);
}

async function openItemDetail(itemId) {
  const item = state.items.find(i => i.id === itemId) || (await api(`/api/items`)).find(i => i.id === itemId);
  if (!item) return;

  const isMine = state.currentUser && item.ownerId === state.currentUser.id;
  const isAvailable = item.status === 'disponible';

  // Fetch my available items so I can offer one
  let myAvailable = [];
  if (state.currentUser && !isMine && isAvailable && item.type === 'trueque') {
    myAvailable = await api(
      `/api/items?ownerId=${encodeURIComponent(state.currentUser.id)}&status=disponible`
    );
  }

  const gallery = Array.isArray(item.images) && item.images.length
    ? item.images
    : item.imageUrl
      ? [item.imageUrl]
      : [];

  const mediaHtml = gallery.length
    ? `
      <div class="detail-gallery-wrap">
        <button type="button" class="btn-fullscreen btn-touch" id="btnOpenFullscreen" aria-label="Ampliar imagen" title="Ampliar imagen">🔍</button>
        <div class="detail-gallery" id="detailGallery">
          ${gallery
            .map(
              (src, i) => `
            <div class="detail-slide detail-zoom-wrap" data-slide="${i}" title="Pellizca, arrastra o haz doble clic para ampliar">
              <img class="detail-img" src="${escapeHtml(src)}" alt="${escapeHtml(item.title)} (${i + 1})" ${i > 0 ? 'loading="lazy"' : ''} decoding="async" draggable="false" onerror="this.outerHTML='<div class=\\'detail-img card-placeholder\\'>📦</div>'" />
              <span class="zoom-level-badge">🔍 Pellizca o doble toque</span>
            </div>
          `
            )
            .join('')}
        </div>
        ${
          gallery.length > 1
            ? `<div class="gallery-dots" id="galleryDots">${gallery
                .map((_, i) => `<button type="button" class="gallery-dot ${i === 0 ? 'active' : ''}" data-dot="${i}" aria-label="Foto ${i + 1}"></button>`)
                .join('')}</div>`
            : ''
        }
      </div>
    `
    : `<div class="detail-img card-placeholder">📦</div>`;

  let actionHtml = '';
  if (!isAvailable) {
    actionHtml = `<div class="propose-box"><strong>Este objeto ya encontró una segunda vida.</strong></div>`;
  } else if (isMine) {
    actionHtml = `
      <div class="propose-box">
        <p style="margin-top:0">Este objeto es tuyo.</p>
        <div class="trade-actions">
          <button class="btn btn-outline btn-sm" id="btnEditThisItem">Editar</button>
          <button class="btn btn-outline btn-sm" id="btnMarkDoneItem">Marcar como intercambiado</button>
          <button class="btn btn-danger btn-sm" id="btnDeleteThisItem">Eliminar</button>
        </div>
      </div>
    `;
  } else {
    const bestMatch = computeBestMatch(item, myAvailable);
    const offerOptions = myAvailable.length
      ? myAvailable
          .map(
            m =>
              `<option value="${m.id}" ${bestMatch?.myItem.id === m.id ? 'selected' : ''}>${escapeHtml(m.title)}</option>`
          )
          .join('')
      : '';

    const matchHtml = bestMatch
      ? `
        <div class="match-banner">
          <div class="match-top">
            <span>🤖 Coincidencia</span>
            <strong>${bestMatch.score}%</strong>
          </div>
          <div class="match-track">
            <div class="match-fill" style="width:${bestMatch.score}%"></div>
          </div>
          <span class="match-sub">Tu ${escapeHtml(bestMatch.myItem.title)} encaja con este trueque</span>
        </div>
      `
      : '';

    actionHtml = `
      ${matchHtml}
      <form class="propose-box form-stack" id="proposeTradeForm">
        <h3 style="margin:0">${item.type === 'regalo' ? 'Solicitar este regalo' : 'Proponer un trueque'}</h3>
        ${
          item.type === 'trueque'
            ? `
          <label>
            <span>¿Qué objeto tuyo ofreces a cambio?</span>
            <select id="offeredItemSelect">
              <option value="">Acordar por mensaje / varios objetos</option>
              ${offerOptions}
            </select>
          </label>
        `
            : ''
        }
        <label>
          <span>Mensaje para ${escapeHtml(item.ownerName)} *</span>
          <textarea id="tradeMessageInput" rows="3" required placeholder="${
            item.type === 'regalo'
              ? 'Hola! Me vendría genial para...'
              : 'Hola! Te propongo cambiarlo por...'
          }"></textarea>
        </label>
        <button type="submit" class="btn btn-primary">${
          item.type === 'regalo' ? 'Enviar solicitud' : 'Enviar propuesta de trueque'
        }</button>
      </form>
    `;
  }

  const badgesHtml = (item.ownerBadges || [])
    .map(b => `<span class="rep-badge">${escapeHtml(b)}</span>`)
    .join('');

  $('#detailContent').innerHTML = `
    <div>${mediaHtml}</div>
    <div class="detail-info">
      <div class="card-meta">
        <span>${escapeHtml(item.category)} · ${escapeHtml(item.condition)}</span>
        <span>📍 ${escapeHtml(item.location)}</span>
      </div>
      <h2>${escapeHtml(item.title)}</h2>
      <p class="card-looking">
        ${item.type === 'regalo' ? '🎁 Regalo gratuito' : `🔄 Busca: ${escapeHtml(item.lookingFor)}`}
      </p>
      <p class="detail-desc">${escapeHtml(item.description)}</p>
      <div class="trust-box">
        <div class="owner-chip">
          <span class="avatar" style="background:${escapeHtml(item.ownerAvatarColor)}">${getInitials(item.ownerName)}</span>
          <div>
            <div>Publicado por <strong>${escapeHtml(item.ownerName)}</strong></div>
            <div class="reputation-line">
              <span>⭐ <strong>${(item.ownerRating ?? 5).toFixed(1)}</strong></span>
              <span class="rep-sep">·</span>
              <span>🏅 <strong>${escapeHtml(item.ownerLevel || 'Nivel 1 · Nuevo')}</strong></span>
              <span class="rep-sep">·</span>
              <span>♻️ <strong>${item.ownerCompletedTrades || 0}</strong> trueques realizados</span>
            </div>
            ${badgesHtml ? `<div class="badges-row">${badgesHtml}</div>` : ''}
          </div>
        </div>
        <div class="trust-history" id="ownerHistoryBox">Cargando historial de intercambios...</div>
      </div>
      ${actionHtml}
    </div>
  `;

  $$('#detailGallery .detail-zoom-wrap').forEach(zoomWrap => {
    const zoomImg = zoomWrap.querySelector('.detail-img');
    if (zoomImg) attachPanPinchZoom(zoomWrap, zoomImg);
  });

  const galleryEl = $('#detailGallery');
  if (galleryEl) {
    $('#galleryDots')?.addEventListener('click', e => {
      const dot = e.target.closest('.gallery-dot');
      if (!dot) return;
      const idx = Number(dot.dataset.dot);
      galleryEl.scrollTo({ left: idx * galleryEl.clientWidth, behavior: 'smooth' });
    });
    galleryEl.addEventListener('scroll', () => {
      const idx = Math.round(galleryEl.scrollLeft / Math.max(1, galleryEl.clientWidth));
      $$('#galleryDots .gallery-dot').forEach((d, i) => d.classList.toggle('active', i === idx));
    });

    $('#btnOpenFullscreen')?.addEventListener('click', () => {
      const stage = $('#lightboxStage');
      stage.innerHTML = `
        <div class="detail-gallery lightbox-gallery" id="lightboxGallery">
          ${gallery
            .map(
              (src, i) => `
            <div class="detail-slide detail-zoom-wrap">
              <img class="lightbox-img" src="${escapeHtml(src)}" alt="${escapeHtml(item.title)} (${i + 1})" loading="lazy" decoding="async" draggable="false" />
              <span class="zoom-level-badge">🔍 Pellizca o doble toque</span>
            </div>
          `
            )
            .join('')}
        </div>
      `;
      $('#lightboxModal').classList.remove('hidden');
      const activeIdx = Math.round(galleryEl.scrollLeft / Math.max(1, galleryEl.clientWidth));
      const lbGallery = $('#lightboxGallery');
      if (lbGallery && activeIdx > 0) {
        lbGallery.scrollLeft = activeIdx * lbGallery.clientWidth;
      }
      $$('#lightboxGallery .detail-zoom-wrap').forEach(zw => {
        const zi = zw.querySelector('.lightbox-img');
        if (zi) attachPanPinchZoom(zw, zi);
      });
    });
  }

  if (isMine && isAvailable) {
    $('#btnEditThisItem')?.addEventListener('click', () => {
      closeModal('detailModal');
      openPublishModal(item);
    });
    $('#btnMarkDoneItem')?.addEventListener('click', async () => {
      await api(`/api/items/${item.id}`, {
        method: 'PUT',
        body: JSON.stringify({ userId: state.currentUser.id, status: 'intercambiado' })
      });
      showToast('¡Genial! Objeto marcado con segunda vida.');
      closeModal('detailModal');
      await Promise.all([loadStats(), loadItems()]);
    });
    $('#btnDeleteThisItem')?.addEventListener('click', async () => {
      await api(`/api/items/${item.id}?userId=${encodeURIComponent(state.currentUser.id)}`, {
        method: 'DELETE'
      });
      showToast('Objeto eliminado.');
      closeModal('detailModal');
      await Promise.all([loadStats(), loadItems(), loadTrades()]);
    });
  }

  $('#proposeTradeForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const offeredItemId = $('#offeredItemSelect')?.value || null;
    const message = $('#tradeMessageInput').value.trim();
    try {
      await api('/api/trades', {
        method: 'POST',
        body: JSON.stringify({
          targetItemId: item.id,
          offeredItemId,
          proposerId: state.currentUser.id,
          message
        })
      });
      showToast('¡Propuesta enviada! Puedes seguirla en "Mis trueques".');
      closeModal('detailModal');
      await loadTrades();
    } catch (err) {
      showToast(err.message, true);
    }
  });

  openModal('detailModal');
  if (window.location.pathname !== `/objeto/${item.id}`) {
    history.pushState({}, '', `/objeto/${encodeURIComponent(item.id)}`);
  }
  document.title = `${item.title} — ${item.type === 'regalo' ? 'Regalo' : 'Trueque'} en truecalo`;

  api(`/api/users/${encodeURIComponent(item.ownerId)}/history`)
    .then(data => {
      const box = $('#ownerHistoryBox');
      if (!box) return;
      if (!data.recentTrades?.length) {
        box.innerHTML = `<span class="history-empty">📜 Historial: ${item.ownerCompletedTrades || 0} intercambios completados en la comunidad.</span>`;
        return;
      }
      box.innerHTML = `
        <strong>📜 Últimos intercambios:</strong>
        <ul class="history-list">
          ${data.recentTrades
            .map(
              t =>
                `<li>✓ ${escapeHtml(t.targetTitle)} ⇄ ${escapeHtml(t.offeredTitle)} (${formatRelativeDate(t.date)})</li>`
            )
            .join('')}
        </ul>
      `;
    })
    .catch(() => {});
}

function openPublishModal(itemToEdit = null) {
  state.uploadedImageDataUrl = '';
  state.uploadedImages = [];
  state.uploadedThumbDataUrl = '';
  state.uploadedBlurDataUrl = '';
  $('#imageFileHint').textContent = '600×450 / 1200×900 px · Máx. 300 KB · WebP/AVIF';
  $('#itemImageFile').value = '';

  if (itemToEdit) {
    $('#publishModalTitle').textContent = 'Editar objeto';
    $('#btnSubmitPublish').textContent = 'Guardar cambios';
    $('#editItemId').value = itemToEdit.id;
    $('#itemTitle').value = itemToEdit.title;
    $('#itemCategory').value = itemToEdit.category;
    $('#itemCondition').value = itemToEdit.condition;
    $('#itemType').value = itemToEdit.type;
    $('#itemLocation').value = itemToEdit.location;
    $('#itemLookingFor').value = itemToEdit.lookingFor;
    $('#itemDescription').value = itemToEdit.description;
    $('#itemImageUrl').value = itemToEdit.imageUrl || '';
    if (itemToEdit.imageUrl) {
      $('#imagePreview').src = itemToEdit.imageUrl;
      $('#imagePreview').classList.remove('hidden');
    } else {
      $('#imagePreview').classList.add('hidden');
    }
  } else {
    $('#publishModalTitle').textContent = 'Publicar un objeto';
    $('#btnSubmitPublish').textContent = 'Publicar objeto';
    $('#publishForm').reset();
    $('#editItemId').value = '';
    $('#itemLocation').value = state.currentUser?.city || '';
    $('#imagePreview').classList.add('hidden');
  }
  toggleLookingForVisibility();
  openModal('publishModal');
}

function toggleLookingForVisibility() {
  const isGift = $('#itemType').value === 'regalo';
  $('#lookingForGroup').classList.toggle('hidden', isGift);
}

async function renderTradesModal() {
  await loadTrades();
  const content = $('#tradesContent');
  const me = state.currentUser;

  if (state.activeTab === 'myitems') {
    const myItems = await api(`/api/items?ownerId=${encodeURIComponent(me.id)}`);
    if (!myItems.length) {
      content.innerHTML = `<p class="modal-subtitle">Todavía no has publicado ningún objeto.</p>`;
      return;
    }
    content.innerHTML = myItems
      .map(
        i => `
        <div class="trade-card">
          <div class="trade-header">
            <strong>${escapeHtml(i.title)}</strong>
            <span class="tag ${i.status === 'intercambiado' ? 'tag-done' : 'tag-trueque'}">${escapeHtml(i.status)}</span>
          </div>
          <p style="margin:6px 0;color:var(--muted);font-size:0.88rem">${escapeHtml(i.category)} · ${escapeHtml(i.condition)} · 📍 ${escapeHtml(i.location)}</p>
          <div class="trade-actions">
            <button class="btn btn-outline btn-sm" data-action="edit-item" data-id="${i.id}">Editar</button>
            <button class="btn btn-danger btn-sm" data-action="delete-item" data-id="${i.id}">Eliminar</button>
          </div>
        </div>
      `
      )
      .join('');
    return;
  }

  const list = state.trades.filter(t =>
    state.activeTab === 'received' ? t.receiverId === me.id : t.proposerId === me.id
  );

  if (!list.length) {
    content.innerHTML = `<p class="modal-subtitle">No tienes propuestas ${
      state.activeTab === 'received' ? 'recibidas' : 'enviadas'
    } por ahora.</p>`;
    return;
  }

  content.innerHTML = list
    .map(t => {
      const targetTitle = t.targetItem ? t.targetItem.title : 'Objeto eliminado';
      const offeredTitle = t.offeredItem ? t.offeredItem.title : 'Acuerdo por mensaje';
      const isReceiver = t.receiverId === me.id;
      const otherName = isReceiver ? t.proposerName : t.receiverName;

      let buttons = '';
      if (t.status === 'pendiente' && isReceiver) {
        buttons = `
          <button class="btn btn-primary btn-sm" data-trade-action="aceptar" data-id="${t.id}">✓ Aceptar trueque</button>
          <button class="btn btn-danger btn-sm" data-trade-action="rechazar" data-id="${t.id}">Rechazar</button>
        `;
      } else if (t.status === 'pendiente' && !isReceiver) {
        buttons = `<button class="btn btn-outline btn-sm" data-trade-action="cancelar" data-id="${t.id}">Cancelar propuesta</button>`;
      } else if (t.status === 'aceptado') {
        buttons = `<button class="btn btn-primary btn-sm" data-trade-action="completar" data-id="${t.id}">🎉 Marcar entrega completada</button>`;
      }

      const msgs = (t.messages || [])
        .map(m => {
          const sender = m.senderId === me.id ? 'Tú' : otherName;
          return `<div class="msg-item"><strong>${escapeHtml(sender)}:</strong> ${escapeHtml(m.text)}</div>`;
        })
        .join('');

      return `
        <div class="trade-card">
          <div class="trade-header">
            <span>Con <strong>${escapeHtml(otherName)}</strong></span>
            <span class="tag">${escapeHtml(t.status.toUpperCase())}</span>
          </div>
          <div class="trade-items">
            <span>📦 ${escapeHtml(targetTitle)}</span>
            <span>⇄</span>
            <span>🎁 ${escapeHtml(offeredTitle)}</span>
          </div>
          <div class="trade-messages">${msgs}</div>
          <form class="msg-form" data-msg-trade="${t.id}">
            <input type="text" placeholder="Escribe un mensaje para acordar la entrega..." required />
            <button type="submit" class="btn btn-outline btn-sm">Enviar</button>
          </form>
          ${buttons ? `<div class="trade-actions">${buttons}</div>` : ''}
        </div>
      `;
    })
    .join('');
}

// Events
function bindEvents() {
  // Close modals
  $$('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });
  $$('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', e => {
      if (e.target === backdrop) closeModal(backdrop.id);
    });
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      $('#lightboxModal')?.classList.add('hidden');
      $$('.modal-backdrop:not(.hidden)').forEach(m => closeModal(m.id));
    }
  });

  $('#btnCloseLightbox')?.addEventListener('click', () => {
    $('#lightboxModal').classList.add('hidden');
  });
  $('#lightboxModal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) $('#lightboxModal').classList.add('hidden');
  });

  window.addEventListener('popstate', () => {
    const match = window.location.pathname.match(/^\/objeto\/([^/]+)$/);
    if (match) {
      openItemDetail(decodeURIComponent(match[1]));
    } else {
      $('#detailModal').classList.add('hidden');
      document.title = 'truecalo — Plataforma de trueque y segunda vida entre vecinos';
    }
  });

  // Search & filters
  let searchTimer;
  function handleSearchInput(val) {
    $('#searchInput').value = val;
    $('#heroSearchInput').value = val;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.filters.q = val;
      loadItems();
    }, 220);
  }

  $('#searchInput').addEventListener('input', e => handleSearchInput(e.target.value));
  $('#heroSearchInput').addEventListener('input', e => handleSearchInput(e.target.value));
  $('#heroSearchInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('catalogo')?.scrollIntoView({ behavior: 'smooth' });
    }
  });
  $('#btnHeroSearch').addEventListener('click', () => {
    handleSearchInput($('#heroSearchInput').value);
    document.getElementById('catalogo')?.scrollIntoView({ behavior: 'smooth' });
  });

  $('#heroQuickTags')?.addEventListener('click', e => {
    const tag = e.target.closest('.quick-tag');
    if (!tag) return;
    const query = tag.dataset.query || '';
    $('#searchInput').value = query;
    $('#heroSearchInput').value = query;
    state.filters.q = query;
    loadItems();
    document.getElementById('catalogo')?.scrollIntoView({ behavior: 'smooth' });
  });

  $('#categoryPills').addEventListener('click', e => {
    const pill = e.target.closest('.pill');
    if (!pill) return;
    $$('#categoryPills .pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    state.filters.category = pill.dataset.category;
    loadItems();
  });

  $('#typeFilter').addEventListener('change', e => {
    state.filters.type = e.target.value;
    loadItems();
  });

  $('#statusFilter').addEventListener('change', e => {
    state.filters.status = e.target.value;
    loadItems();
  });

  $('#btnNearMe').addEventListener('click', () => {
    const city = getUserCityKeyword();
    if (!state.filters.nearMe && (!city || city.toLowerCase() === 'sin ubicación')) {
      showToast('Añade tu ciudad en tu perfil para ver objetos cerca de ti.', true);
      openModal('profileModal');
      return;
    }
    state.filters.nearMe = !state.filters.nearMe;
    const btn = $('#btnNearMe');
    btn.classList.toggle('active', state.filters.nearMe);
    btn.textContent = state.filters.nearMe
      ? `📍 Cerca de ${city} ✕`
      : '📍 Ver objetos cerca de mí';
    const heading = $('#catalogHeading');
    if (heading) {
      heading.textContent = state.filters.nearMe ? `🔥 Cerca de ${city}` : '🔥 Cerca de ti';
    }
    loadItems();
  });

  $('#btnEmptyReset').addEventListener('click', () => {
    state.filters = { q: '', category: 'Todas', type: 'todos', status: 'disponible', nearMe: false };
    $('#searchInput').value = '';
    $('#typeFilter').value = 'todos';
    $('#statusFilter').value = 'disponible';
    $('#btnNearMe').classList.remove('active');
    $('#btnNearMe').textContent = '📍 Ver objetos cerca de mí';
    $$('#categoryPills .pill').forEach(p => p.classList.toggle('active', p.dataset.category === 'Todas'));
    loadItems();
  });

  // Grid click
  $('#itemsGrid').addEventListener('click', e => {
    const card = e.target.closest('.card');
    if (card) openItemDetail(card.dataset.itemId);
  });

  // Publish modal
  $('#btnOpenPublish').addEventListener('click', () => openPublishModal());
  $('#btnHeroPublish').addEventListener('click', () => openPublishModal());
  $('#itemType').addEventListener('change', toggleLookingForVisibility);

  $('#itemImageUrl').addEventListener('input', e => {
    const url = e.target.value.trim();
    if (url) {
      $('#imagePreview').src = url;
      $('#imagePreview').classList.remove('hidden');
    } else if (!state.uploadedImageDataUrl) {
      $('#imagePreview').classList.add('hidden');
    }
  });

  function encodeWithinLimit(img, maxW, maxH, maxBytes) {
    const scale = Math.min(1, maxW / img.width, maxH / img.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);

    // Prefer AVIF if browser supports encoding it, else WebP
    const testAvif = canvas.toDataURL('image/avif', 0.8);
    const mime = testAvif.startsWith('data:image/avif') ? 'image/avif' : 'image/webp';

    let dataUrl = '';
    for (const q of [0.82, 0.7, 0.58, 0.45, 0.35]) {
      dataUrl = canvas.toDataURL(mime, q);
      const bytes = Math.ceil((dataUrl.length * 3) / 4);
      if (bytes <= maxBytes) break;
    }
    return {
      dataUrl,
      bytes: Math.ceil((dataUrl.length * 3) / 4),
      width: canvas.width,
      height: canvas.height,
      format: mime === 'image/avif' ? 'AVIF' : 'WebP'
    };
  }

  $('#itemImageFile').addEventListener('change', async e => {
    const files = Array.from(e.target.files || []).slice(0, 6);
    if (!files.length) return;
    const maxBytes = 300 * 1024;
    const encodedList = [];
    let firstThumb = '';
    let firstBlur = '';

    for (let i = 0; i < files.length; i++) {
      const dataUrl = await new Promise(resolve => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.readAsDataURL(files[i]);
      });
      const img = await new Promise(resolve => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.src = dataUrl;
      });
      const detail = encodeWithinLimit(img, 1200, 900, maxBytes);
      if (detail.bytes > maxBytes) {
        showToast(`La imagen "${files[i].name}" supera 300 KB tras optimizarla.`, true);
        continue;
      }
      encodedList.push(detail.dataUrl);
      if (i === 0) {
        firstThumb = encodeWithinLimit(img, 600, 450, 120 * 1024).dataUrl;
        firstBlur = encodeWithinLimit(img, 32, 24, 15 * 1024).dataUrl;
      }
    }

    if (!encodedList.length) return;
    state.uploadedImages = encodedList;
    state.uploadedImageDataUrl = encodedList[0];
    state.uploadedThumbDataUrl = firstThumb;
    state.uploadedBlurDataUrl = firstBlur;
    $('#imageFileHint').textContent = `${encodedList.length} foto(s) optimizada(s) en WebP/AVIF`;
    $('#imagePreview').src = encodedList[0];
    $('#imagePreview').classList.remove('hidden');
  });

  $('#publishForm').addEventListener('submit', async e => {
    e.preventDefault();
    const editId = $('#editItemId').value;
    const payload = {
      ownerId: state.currentUser.id,
      userId: state.currentUser.id,
      title: $('#itemTitle').value,
      category: $('#itemCategory').value,
      condition: $('#itemCondition').value,
      type: $('#itemType').value,
      location: $('#itemLocation').value,
      lookingFor: $('#itemLookingFor').value,
      description: $('#itemDescription').value,
      imageUrl: state.uploadedImageDataUrl || $('#itemImageUrl').value.trim(),
      images: state.uploadedImages.length
        ? state.uploadedImages
        : ($('#itemImageUrl').value.trim() ? [$('#itemImageUrl').value.trim()] : []),
      thumbImageUrl: state.uploadedThumbDataUrl || '',
      blurImageUrl: state.uploadedBlurDataUrl || ''
    };

    try {
      if (editId) {
        await api(`/api/items/${editId}`, { method: 'PUT', body: JSON.stringify(payload) });
        showToast('Objeto actualizado correctamente.');
      } else {
        await api('/api/items', { method: 'POST', body: JSON.stringify(payload) });
        showToast('¡Objeto publicado! Ya puede verlo la comunidad.');
      }
      closeModal('publishModal');
      await Promise.all([loadStats(), loadItems()]);
    } catch (err) {
      showToast(err.message, true);
    }
  });

  // Trades modal
  $('#btnOpenTrades').addEventListener('click', () => {
    openModal('tradesModal');
    renderTradesModal();
  });

  $$('#tradesModal .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('#tradesModal .tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.activeTab = tab.dataset.tab;
      renderTradesModal();
    });
  });

  $('#tradesContent').addEventListener('click', async e => {
    const tradeBtn = e.target.closest('[data-trade-action]');
    if (tradeBtn) {
      try {
        await api(`/api/trades/${tradeBtn.dataset.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            action: tradeBtn.dataset.tradeAction,
            userId: state.currentUser.id
          })
        });
        showToast('Estado del trueque actualizado.');
        await Promise.all([loadStats(), loadItems(), renderTradesModal()]);
      } catch (err) {
        showToast(err.message, true);
      }
      return;
    }

    const itemBtn = e.target.closest('[data-action]');
    if (itemBtn) {
      const id = itemBtn.dataset.id;
      if (itemBtn.dataset.action === 'delete-item') {
        await api(`/api/items/${id}?userId=${encodeURIComponent(state.currentUser.id)}`, {
          method: 'DELETE'
        });
        showToast('Objeto eliminado.');
        await Promise.all([loadStats(), loadItems(), renderTradesModal()]);
      } else if (itemBtn.dataset.action === 'edit-item') {
        const all = await api(`/api/items?ownerId=${encodeURIComponent(state.currentUser.id)}`);
        const found = all.find(i => i.id === id);
        if (found) {
          closeModal('tradesModal');
          openPublishModal(found);
        }
      }
    }
  });

  $('#tradesContent').addEventListener('submit', async e => {
    const form = e.target.closest('[data-msg-trade]');
    if (!form) return;
    e.preventDefault();
    const input = form.querySelector('input');
    const text = input.value.trim();
    if (!text) return;
    try {
      await api(`/api/trades/${form.dataset.msgTrade}/messages`, {
        method: 'POST',
        body: JSON.stringify({ senderId: state.currentUser.id, text })
      });
      input.value = '';
      await renderTradesModal();
    } catch (err) {
      showToast(err.message, true);
    }
  });

  // Profile modal
  $('#btnOpenProfile').addEventListener('click', () => openModal('profileModal'));
  $('#navPerfil')?.addEventListener('click', () => openModal('profileModal'));

  $('#navInicio')?.addEventListener('click', e => {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  $('#navExplorar')?.addEventListener('click', () => {
    state.filters.type = 'todos';
    $('#typeFilter').value = 'todos';
    loadItems();
  });

  $('#navRegalos')?.addEventListener('click', () => {
    state.filters.type = 'regalo';
    $('#typeFilter').value = 'regalo';
    loadItems();
  });

  // Mobile bottom navigation
  $('#mobNavHome')?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  $('#mobNavSearch')?.addEventListener('click', () => {
    $('#searchInput')?.focus();
    document.getElementById('catalogo')?.scrollIntoView({ behavior: 'smooth' });
  });
  $('#mobNavPublish')?.addEventListener('click', () => openPublishModal());
  $('#mobNavTrades')?.addEventListener('click', () => {
    openModal('tradesModal');
    renderTradesModal();
  });
  $('#mobNavProfile')?.addEventListener('click', () => openModal('profileModal'));

  $('#userSwitcher').addEventListener('change', async e => {
    const found = state.users.find(u => u.id === e.target.value);
    if (found) {
      state.currentUser = found;
      localStorage.setItem('truecalo_user_id', found.id);
      renderUserNav();
      if (state.filters.nearMe) {
        const city = getUserCityKeyword();
        $('#btnNearMe').textContent = `📍 Cerca de ${city} ✕`;
      }
      await Promise.all([loadItems(), loadTrades()]);
      showToast(`Ahora estás usando el perfil de ${found.name}`);
      closeModal('profileModal');
    }
  });

  $('#newUserForm').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const user = await api('/api/users', {
        method: 'POST',
        body: JSON.stringify({
          name: $('#newUserName').value,
          city: $('#newUserCity').value,
          bio: $('#newUserBio').value
        })
      });
      state.users.push(user);
      state.currentUser = user;
      localStorage.setItem('truecalo_user_id', user.id);
      renderUserNav();
      renderUserSwitcher();
      await Promise.all([loadStats(), loadTrades()]);
      $('#newUserForm').reset();
      closeModal('profileModal');
      showToast(`¡Bienvenido/a a truecalo, ${user.name}!`);
    } catch (err) {
      showToast(err.message, true);
    }
  });
}

// Cookie Consent & Google AdSense
const ADSENSE_CLIENT = 'ca-pub-0000000000000000';
const CONSENT_STORAGE_KEY = 'truecalo_cookie_consent';
let adsenseLoaded = false;

function getCookieConsent() {
  try {
    const raw = localStorage.getItem(CONSENT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveCookieConsent(adsAllowed) {
  const consent = {
    essential: true,
    ads: Boolean(adsAllowed),
    updatedAt: new Date().toISOString()
  };
  localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(consent));
  document.cookie = `truecalo_consent=${consent.ads ? 'all' : 'essential'}; path=/; max-age=31536000; SameSite=Lax`;
  applyCookieConsent(consent);
  $('#cookieBanner').classList.add('hidden');
  closeModal('cookieModal');
}

function applyCookieConsent(consent) {
  const isPlaceholder = ADSENSE_CLIENT === 'ca-pub-0000000000000000';
  if (isPlaceholder) return;

  window.adsbygoogle = window.adsbygoogle || [];
  window.adsbygoogle.requestNonPersonalizedAds = consent.ads ? 0 : 1;

  if (!adsenseLoaded) {
    adsenseLoaded = true;
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`;
    script.crossOrigin = 'anonymous';
    document.head.appendChild(script);

    const unit = $('#adsenseUnit');
    const placeholder = $('#adPlaceholder');
    if (unit && placeholder) {
      placeholder.classList.add('hidden');
      unit.classList.remove('hidden');
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch {}
    }
  }
}

function initCookieConsent() {
  const existing = getCookieConsent();
  if (!existing) {
    $('#cookieBanner').classList.remove('hidden');
  } else {
    $('#consentAdsToggle').checked = Boolean(existing.ads);
    applyCookieConsent(existing);
  }

  $('#btnCookieAccept').addEventListener('click', () => {
    saveCookieConsent(true);
    showToast('Preferencias de cookies guardadas (todas aceptadas).');
  });

  $('#btnCookieReject').addEventListener('click', () => {
    saveCookieConsent(false);
    showToast('Solo se usarán cookies técnicas necesarias.');
  });

  $('#btnCookieConfig').addEventListener('click', () => {
    const current = getCookieConsent();
    $('#consentAdsToggle').checked = current ? Boolean(current.ads) : false;
    openModal('cookieModal');
  });

  $('#btnManageCookies').addEventListener('click', () => {
    const current = getCookieConsent();
    $('#consentAdsToggle').checked = current ? Boolean(current.ads) : false;
    openModal('cookieModal');
  });

  $('#btnSaveCookiePrefs').addEventListener('click', () => {
    saveCookieConsent($('#consentAdsToggle').checked);
    showToast('Preferencias de cookies actualizadas.');
  });

  $('#btnAcceptAllModal').addEventListener('click', () => {
    $('#consentAdsToggle').checked = true;
    saveCookieConsent(true);
    showToast('Todas las cookies aceptadas.');
  });
}

// Accessibility Preferences
const A11Y_STORAGE_KEY = 'truecalo_a11y';

function applyA11yPrefs(prefs) {
  const root = document.documentElement;
  root.classList.toggle('a11y-large-text', Boolean(prefs.largeText));
  root.classList.toggle('a11y-high-contrast', Boolean(prefs.highContrast));
  root.classList.toggle('a11y-reduced-motion', Boolean(prefs.reducedMotion));
}

function initAccessibility() {
  let prefs = { largeText: false, highContrast: false, reducedMotion: false };
  try {
    const saved = localStorage.getItem(A11Y_STORAGE_KEY);
    if (saved) prefs = { ...prefs, ...JSON.parse(saved) };
  } catch {}

  const btnLarge = $('#btnA11yLargeText');
  const btnContrast = $('#btnA11yHighContrast');
  const btnSpeech = $('#btnA11ySpeech');
  const btnMotion = $('#btnA11yReducedMotion');
  const btnNavHelp = $('#btnA11yNavHelp');
  const navHelpBox = $('#a11yNavHelpBox');

  function syncUI() {
    applyA11yPrefs(prefs);
    btnLarge?.classList.toggle('active', prefs.largeText);
    btnContrast?.classList.toggle('active', prefs.highContrast);
    btnMotion?.classList.toggle('active', prefs.reducedMotion);
  }

  function save() {
    localStorage.setItem(A11Y_STORAGE_KEY, JSON.stringify(prefs));
    syncUI();
  }

  syncUI();

  $('#btnA11yFloat')?.addEventListener('click', () => openModal('a11yModal'));
  btnLarge?.addEventListener('click', () => {
    prefs.largeText = !prefs.largeText;
    save();
  });
  btnContrast?.addEventListener('click', () => {
    prefs.highContrast = !prefs.highContrast;
    save();
  });
  btnMotion?.addEventListener('click', () => {
    prefs.reducedMotion = !prefs.reducedMotion;
    save();
  });

  btnNavHelp?.addEventListener('click', () => {
    const isHidden = navHelpBox?.classList.toggle('hidden');
    btnNavHelp.classList.toggle('active', !isHidden);
  });

  btnSpeech?.addEventListener('click', () => {
    if (!('speechSynthesis' in window)) {
      showToast('Tu navegador no soporta lectura de texto por voz.', true);
      return;
    }
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      btnSpeech.classList.remove('active');
      showToast('Lectura de texto detenida.');
      return;
    }
    const itemsText = state.items
      .slice(0, 5)
      .map(i => `${i.title}, en ${i.location}.`)
      .join(' ');
    const summary = `Bienvenido a TRUECALO. Si te interesa, cámbialo. Hay ${state.items.length} objetos mostrados. ${itemsText}`;
    const utter = new SpeechSynthesisUtterance(summary);
    utter.lang = 'es-ES';
    utter.onend = () => btnSpeech.classList.remove('active');
    btnSpeech.classList.add('active');
    window.speechSynthesis.speak(utter);
  });

  $('#btnA11yReset')?.addEventListener('click', () => {
    prefs = { largeText: false, highContrast: false, reducedMotion: false };
    window.speechSynthesis?.cancel();
    btnSpeech?.classList.remove('active');
    save();
    showToast('Opciones de accesibilidad restablecidas.');
  });
}

function initDarkMode() {
  const btn = $('#btnDarkMode');
  const saved = localStorage.getItem('truecalo_dark_mode');
  let isDark = saved !== null
    ? saved === '1'
    : window.matchMedia?.('(prefers-color-scheme: dark)').matches;

  function apply() {
    document.documentElement.classList.toggle('dark', isDark);
    if (btn) btn.textContent = isDark ? '☀️' : '🌙';
  }

  apply();
  btn?.addEventListener('click', () => {
    isDark = !isDark;
    localStorage.setItem('truecalo_dark_mode', isDark ? '1' : '0');
    apply();
  });
}

init();
initCookieConsent();
initAccessibility();
initDarkMode();
