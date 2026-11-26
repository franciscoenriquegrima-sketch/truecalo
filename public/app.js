const state = {
  users: [],
  currentUser: null,
  items: [],
  trades: [],
  filters: {
    q: '',
    category: 'Todas',
    type: 'todos',
    status: 'disponible'
  },
  activeTab: 'received',
  uploadedImageDataUrl: ''
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
  $('#statAvailable').textContent = stats.availableItems;
  $('#statSecondLife').textContent = stats.secondLifeItems;
  $('#statGifts').textContent = stats.giftsCount;
  $('#statUsers').textContent = stats.totalUsers;
}

async function loadItems() {
  const params = new URLSearchParams();
  if (state.filters.q) params.set('q', state.filters.q);
  if (state.filters.category !== 'Todas') params.set('category', state.filters.category);
  if (state.filters.type !== 'todos') params.set('type', state.filters.type);
  if (state.filters.status) params.set('status', state.filters.status);

  state.items = await api(`/api/items?${params.toString()}`);
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
  avatar.style.background = state.currentUser.avatarColor || '#2d6a4f';
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
    .map(item => {
      const isDone = item.status === 'intercambiado';
      const typeLabel = item.type === 'regalo' ? 'Regalo' : 'Trueque';
      const typeClass = item.type === 'regalo' ? 'tag-regalo' : 'tag-trueque';
      const media = item.imageUrl
        ? `<img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.title)}" loading="lazy" onerror="this.outerHTML='<div class=\\'card-placeholder\\'>📦</div>'" />`
        : `<div class="card-placeholder">📦</div>`;

      return `
        <article class="card" data-item-id="${item.id}">
          <div class="card-media">
            ${media}
            <div class="card-badges">
              <span class="tag ${typeClass}">${typeLabel}</span>
              ${isDone ? '<span class="tag tag-done">Segunda vida ✓</span>' : ''}
            </div>
          </div>
          <div class="card-body">
            <div class="card-meta">
              <span>${escapeHtml(item.category)}</span>
              <span>${escapeHtml(item.condition)}</span>
            </div>
            <h3 class="card-title">${escapeHtml(item.title)}</h3>
            <p class="card-looking">
              ${item.type === 'regalo' ? '🎁 Gratis para quien lo necesite' : `🔄 Busca: ${escapeHtml(item.lookingFor)}`}
            </p>
            <div class="card-footer">
              <span class="owner-chip">
                <span class="avatar" style="width:22px;height:22px;font-size:0.7rem;background:${escapeHtml(item.ownerAvatarColor)}">${getInitials(item.ownerName)}</span>
                ${escapeHtml(item.ownerName)}
              </span>
              <span>📍 ${escapeHtml(item.location)}</span>
            </div>
          </div>
        </article>
      `;
    })
    .join('');
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

  const mediaHtml = item.imageUrl
    ? `<img class="detail-img" src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.title)}" />`
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
    const offerOptions = myAvailable.length
      ? myAvailable.map(m => `<option value="${m.id}">${escapeHtml(m.title)}</option>`).join('')
      : '';

    actionHtml = `
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
      <div class="owner-chip">
        <span class="avatar" style="background:${escapeHtml(item.ownerAvatarColor)}">${getInitials(item.ownerName)}</span>
        <span>Publicado por <strong>${escapeHtml(item.ownerName)}</strong></span>
      </div>
      ${actionHtml}
    </div>
  `;

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
}

function openPublishModal(itemToEdit = null) {
  state.uploadedImageDataUrl = '';
  $('#imageFileHint').textContent = 'Sin archivo seleccionado';
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
      $$('.modal-backdrop:not(.hidden)').forEach(m => closeModal(m.id));
    }
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
  $('#searchInput').addEventListener('input', e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.filters.q = e.target.value;
      loadItems();
    }, 220);
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

  $('#btnEmptyReset').addEventListener('click', () => {
    state.filters = { q: '', category: 'Todas', type: 'todos', status: 'disponible' };
    $('#searchInput').value = '';
    $('#typeFilter').value = 'todos';
    $('#statusFilter').value = 'disponible';
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

  $('#itemImageFile').addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      state.uploadedImageDataUrl = reader.result;
      $('#imageFileHint').textContent = file.name;
      $('#imagePreview').src = reader.result;
      $('#imagePreview').classList.remove('hidden');
    };
    reader.readAsDataURL(file);
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
      imageUrl: state.uploadedImageDataUrl || $('#itemImageUrl').value.trim()
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

  $('#userSwitcher').addEventListener('change', async e => {
    const found = state.users.find(u => u.id === e.target.value);
    if (found) {
      state.currentUser = found;
      localStorage.setItem('truecalo_user_id', found.id);
      renderUserNav();
      await loadTrades();
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

init();
initCookieConsent();
