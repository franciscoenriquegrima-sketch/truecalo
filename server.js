const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { readDb, writeDb, generateId } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  next();
});

// Simple in-memory rate limiter for API routes
const rateBuckets = new Map();
function rateLimit(maxRequests, windowMs = 60000) {
  return (req, res, next) => {
    const key = `${req.ip || 'local'}:${maxRequests}`;
    const now = Date.now();
    const entry = rateBuckets.get(key);
    if (!entry || now > entry.resetAt) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    entry.count++;
    if (entry.count > maxRequests) {
      return res.status(429).json({ error: 'Demasiadas peticiones. Espera un momento e inténtalo de nuevo.' });
    }
    next();
  };
}

app.use('/api/', rateLimit(120, 60000));
app.use('/api/register', rateLimit(15, 60000));
app.use('/api/login', rateLimit(15, 60000));

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

function computeBadges(user, db) {
  const badges = [];
  const completed = user.completedTrades || 0;
  const userItems = db ? db.items.filter(i => i.ownerId === user.id) : [];
  const hasGifts = userItems.some(i => i.type === 'regalo');

  if (completed >= 100) badges.push('🏆 100 intercambios');
  if (completed >= 10) badges.push('🥇 Trueque Experto');
  if (completed >= 1 || userItems.length >= 1) badges.push('♻️ Eco Amigo');
  if (hasGifts) badges.push('🎁 Donante Solidario');

  return badges;
}

function sanitizeUser(user, db = null) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    city: user.city,
    bio: user.bio,
    avatarColor: user.avatarColor,
    lifetimeMember: Boolean(user.lifetimeMember),
    rating: typeof user.rating === 'number' ? Number(user.rating.toFixed(1)) : 5.0,
    completedTrades: user.completedTrades || 0,
    badges: computeBadges(user, db),
    createdAt: user.createdAt
  };
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, key] = stored.split(':');
  const hashBuf = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(key, 'hex');
  return hashBuf.length === keyBuf.length && crypto.timingSafeEqual(hashBuf, keyBuf);
}

function isSafeImageUrl(url) {
  if (!url) return true;
  if (url.length > 1500000) return false;
  if (/^data:image\/(png|jpeg|jpg|webp|avif|gif);base64,[A-Za-z0-9+/=]+$/i.test(url)) {
    return true;
  }
  if (url.length > 2048) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function safeJsonLd(obj) {
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

function clampStr(str, max) {
  return typeof str === 'string' ? str.trim().slice(0, max) : '';
}

function escapeXml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function getBaseUrl(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/+$/, '');
  const host = req.get('host') || '';
  const safeHost = /^[a-zA-Z0-9.-]+(:\d+)?$/.test(host) ? host : `localhost:${PORT}`;
  const proto = req.protocol === 'https' ? 'https' : 'http';
  return `${proto}://${safeHost}`;
}

// SEO: robots.txt
app.get('/robots.txt', (req, res) => {
  const baseUrl = getBaseUrl(req);
  res.type('text/plain').send(
    `User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${baseUrl}/sitemap.xml\n`
  );
});

// SEO: dynamic sitemap.xml
app.get('/sitemap.xml', (req, res) => {
  const db = readDb();
  const baseUrl = getBaseUrl(req);
  const today = new Date().toISOString().split('T')[0];
  const urls = [
    {
      loc: `${baseUrl}/`,
      lastmod: today,
      changefreq: 'daily',
      priority: '1.0'
    },
    ...['privacidad', 'cookies', 'terminos', 'contacto', 'registro', 'juegos'].map(page => ({
      loc: `${baseUrl}/${page}`,
      lastmod: today,
      changefreq: 'monthly',
      priority: page === 'registro' ? '0.9' : '0.5'
    })),
    ...db.items
      .filter(i => i.status === 'disponible')
      .map(i => ({
        loc: `${baseUrl}/objeto/${encodeURIComponent(i.id)}`,
        lastmod: (i.createdAt || new Date().toISOString()).split('T')[0],
        changefreq: 'weekly',
        priority: '0.8'
      }))
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map(
      u =>
        `  <url>\n    <loc>${escapeXml(u.loc)}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`
    )
    .join('\n')}\n</urlset>`;

  res.type('application/xml').send(xml);
});

// Clean routes for AdSense-required legal, contact, registration & games pages
['privacidad', 'cookies', 'terminos', 'contacto', 'registro', 'juegos'].forEach(page => {
  app.get(`/${page}`, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', `${page}.html`));
  });
});

// Home route with dynamic base URL for SEO tags
app.get('/', (req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  const baseUrl = getBaseUrl(req);
  const html = fs
    .readFileSync(indexPath, 'utf8')
    .replaceAll('http://localhost:3000', baseUrl);
  res.send(html);
});

// SEO: dynamic meta + JSON-LD for individual item URLs (/objeto/:id)
app.get('/objeto/:id', (req, res) => {
  const db = readDb();
  const item = db.items.find(i => i.id === req.params.id);
  const indexPath = path.join(__dirname, 'public', 'index.html');
  const baseUrl = getBaseUrl(req);
  let html = fs
    .readFileSync(indexPath, 'utf8')
    .replaceAll('http://localhost:3000', baseUrl);

  if (!item) {
    return res.status(404).send(html);
  }

  const itemUrl = `${baseUrl}/objeto/${encodeURIComponent(item.id)}`;
  const title = `${item.title} — ${item.type === 'regalo' ? 'Regalo' : 'Trueque'} en truecalo`;
  const desc = `${item.description.slice(0, 145)}${item.description.length > 145 ? '...' : ''}`;
  const productLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: item.title,
    description: item.description,
    category: item.category,
    url: itemUrl,
    ...(item.imageUrl && !item.imageUrl.startsWith('data:') ? { image: item.imageUrl } : {}),
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'EUR',
      availability:
        item.status === 'disponible'
          ? 'https://schema.org/InStock'
          : 'https://schema.org/OutOfStock'
    }
  };

  html = html
    .replace(/<title>.*?<\/title>/, `<title>${escapeXml(title)}</title>`)
    .replace(
      /<meta name="description" content=".*?" \/>/,
      `<meta name="description" content="${escapeXml(desc)}" />`
    )
    .replace(
      /<link rel="canonical" href=".*?" \/>/,
      `<link rel="canonical" href="${escapeXml(itemUrl)}" />`
    )
    .replace(
      /<meta property="og:title" content=".*?" \/>/,
      `<meta property="og:title" content="${escapeXml(title)}" />`
    )
    .replace(
      /<meta property="og:description" content=".*?" \/>/,
      `<meta property="og:description" content="${escapeXml(desc)}" />`
    )
    .replace(
      /<meta property="og:url" content=".*?" \/>/,
      `<meta property="og:url" content="${escapeXml(itemUrl)}" />`
    )
    .replace(
      '</head>',
      `  <script type="application/ld+json">${safeJsonLd(productLd)}</script>\n</head>`
    );

  res.send(html);
});

const AVATAR_COLORS = ['#2d6a4f', '#b5651d', '#3d5a80', '#6d597a', '#b56576', '#355070'];

function pickColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// Health & stats
app.get('/api/stats', (req, res) => {
  const db = readDb();
  const availableItems = db.items.filter(i => i.status === 'disponible').length;
  const userCompleted = db.users.reduce((sum, u) => sum + (u.completedTrades || 0), 0);
  const tradeCompleted = db.trades.filter(t => t.status === 'completado' || t.status === 'aceptado').length;
  const completedTrades = Math.max(userCompleted, tradeCompleted);
  const secondLifeItems = db.items.filter(i => i.status === 'intercambiado').length;
  const giftsCount = db.items.filter(i => i.type === 'regalo').length;

  res.json({
    availableItems,
    completedTrades,
    secondLifeItems,
    giftsCount,
    totalUsers: db.users.length
  });
});

// Users
app.get('/api/users', (req, res) => {
  const db = readDb();
  res.json(db.users.map(u => sanitizeUser(u, db)));
});

app.post('/api/register', (req, res) => {
  const { name, email, city, password, bio, paymentMethod } = req.body || {};
  if (!name || !name.trim() || !email || !email.trim() || !password || password.length < 6) {
    return res.status(400).json({ error: 'Nombre, correo válido y contraseña (mín. 6 caracteres) son obligatorios.' });
  }

  const db = readDb();
  const normalizedEmail = email.trim().toLowerCase();
  if (db.users.some(u => (u.email || '').toLowerCase() === normalizedEmail)) {
    return res.status(409).json({ error: 'Ya existe una cuenta registrada con ese correo.' });
  }

  const cleanName = name.trim();
  const user = {
    id: generateId('usr_'),
    name: cleanName,
    email: normalizedEmail,
    passwordHash: hashPassword(password),
    city: (city || 'Sin ubicación').trim(),
    bio: (bio || 'Miembro de por vida en TRUECALO.').trim(),
    avatarColor: pickColor(cleanName),
    lifetimeMember: true,
    plan: 'lifetime_20eur',
    paidAmount: 20,
    currency: 'EUR',
    paymentMethod: paymentMethod || 'tarjeta',
    rating: 5.0,
    ratingCount: 0,
    completedTrades: 0,
    createdAt: new Date().toISOString()
  };

  db.users.push(user);
  writeDb(db);
  res.status(201).json(sanitizeUser(user));
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Introduce correo y contraseña.' });
  }
  const db = readDb();
  const normalizedEmail = email.trim().toLowerCase();
  const user = db.users.find(u => (u.email || '').toLowerCase() === normalizedEmail);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
  }
  res.json(sanitizeUser(user));
});

app.post('/api/users', (req, res) => {
  const { name, city, bio } = req.body || {};
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'El nombre es obligatorio.' });
  }
  const db = readDb();
  const cleanName = name.trim();
  const user = {
    id: generateId('usr_'),
    name: cleanName,
    city: (city || 'Sin ubicación').trim(),
    bio: (bio || 'Listo para dar una segunda vida a mis cosas.').trim(),
    avatarColor: pickColor(cleanName),
    createdAt: new Date().toISOString()
  };
  db.users.push(user);
  writeDb(db);
  res.status(201).json(sanitizeUser(user));
});

app.put('/api/users/:id', (req, res) => {
  const { name, city, bio } = req.body || {};
  const db = readDb();
  const user = db.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });

  if (name && name.trim()) user.name = name.trim();
  if (typeof city === 'string') user.city = city.trim() || 'Sin ubicación';
  if (typeof bio === 'string') user.bio = bio.trim();

  writeDb(db);
  res.json(sanitizeUser(user));
});

// Items
app.get('/api/items', (req, res) => {
  const db = readDb();
  const { q, category, type, status, ownerId, location } = req.query;

  let items = db.items.map(item => {
    const owner = db.users.find(u => u.id === item.ownerId);
    return {
      ...item,
      ownerName: owner ? owner.name : 'Usuario',
      ownerAvatarColor: owner ? owner.avatarColor : '#4F46E5',
      ownerRating: owner && typeof owner.rating === 'number' ? Number(owner.rating.toFixed(1)) : 5.0,
      ownerCompletedTrades: owner ? (owner.completedTrades || 0) : 0,
      ownerBadges: owner ? computeBadges(owner, db) : []
    };
  });

  if (status && status !== 'todos') {
    items = items.filter(i => i.status === status);
  }
  if (category && category !== 'Todas') {
    items = items.filter(i => i.category === category);
  }
  if (type && type !== 'todos') {
    items = items.filter(i => i.type === type);
  }
  if (ownerId) {
    items = items.filter(i => i.ownerId === ownerId);
  }
  if (location && location.trim()) {
    const locTerm = location.trim().toLowerCase();
    items = items.filter(i => (i.location || '').toLowerCase().includes(locTerm));
  }
  if (q && q.trim()) {
    const term = q.trim().toLowerCase();
    items = items.filter(i =>
      i.title.toLowerCase().includes(term) ||
      i.description.toLowerCase().includes(term) ||
      i.lookingFor.toLowerCase().includes(term) ||
      i.location.toLowerCase().includes(term)
    );
  }

  items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(items);
});

app.post('/api/items', (req, res) => {
  const { ownerId, title, description, category, condition, type, lookingFor, location, imageUrl, thumbImageUrl, blurImageUrl } = req.body || {};
  if (!ownerId || !title || !title.trim() || !description || !description.trim()) {
    return res.status(400).json({ error: 'Faltan campos obligatorios (título, descripción y usuario).' });
  }
  const cleanImg = (imageUrl || '').trim();
  const cleanThumb = (thumbImageUrl || '').trim();
  const cleanBlur = (blurImageUrl || '').trim();
  if (!isSafeImageUrl(cleanImg) || !isSafeImageUrl(cleanThumb) || !isSafeImageUrl(cleanBlur)) {
    return res.status(400).json({ error: 'La URL de la imagen no es válida.' });
  }

  const db = readDb();
  const owner = db.users.find(u => u.id === ownerId);
  if (!owner) return res.status(404).json({ error: 'Usuario no encontrado.' });

  const itemType = type === 'regalo' ? 'regalo' : 'trueque';
  const newItem = {
    id: generateId('itm_'),
    ownerId,
    title: clampStr(title, 100),
    description: clampStr(description, 2000),
    category: clampStr(category || 'Otros', 50),
    condition: clampStr(condition || 'Buen estado', 40),
    type: itemType,
    lookingFor: itemType === 'regalo'
      ? '¡Gratis! Segunda vida para quien lo necesite'
      : clampStr(lookingFor || 'Abierto a propuestas interesantes', 200),
    location: clampStr(location || owner.city || 'Sin ubicación', 100),
    imageUrl: cleanImg,
    thumbImageUrl: cleanThumb,
    blurImageUrl: cleanBlur,
    status: 'disponible',
    createdAt: new Date().toISOString()
  };

  db.items.push(newItem);
  writeDb(db);

  res.status(201).json({
    ...newItem,
    ownerName: owner.name,
    ownerAvatarColor: owner.avatarColor
  });
});

app.put('/api/items/:id', (req, res) => {
  const db = readDb();
  const item = db.items.find(i => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Objeto no encontrado.' });

  const { userId, title, description, category, condition, type, lookingFor, location, imageUrl, thumbImageUrl, blurImageUrl, status } = req.body || {};
  if (!userId || item.ownerId !== userId) {
    return res.status(403).json({ error: 'No tienes permiso para editar este objeto.' });
  }

  if (title && title.trim()) item.title = clampStr(title, 100);
  if (description && description.trim()) item.description = clampStr(description, 2000);
  if (category) item.category = clampStr(category, 50);
  if (condition) item.condition = clampStr(condition, 40);
  if (type === 'trueque' || type === 'regalo') item.type = type;
  if (typeof lookingFor === 'string') item.lookingFor = clampStr(lookingFor, 200);
  if (typeof location === 'string') item.location = clampStr(location, 100);
  if (typeof imageUrl === 'string') {
    const cleanImg = imageUrl.trim();
    if (!isSafeImageUrl(cleanImg)) {
      return res.status(400).json({ error: 'La URL de la imagen no es válida.' });
    }
    item.imageUrl = cleanImg;
  }
  if (typeof thumbImageUrl === 'string') {
    const cleanThumb = thumbImageUrl.trim();
    if (!isSafeImageUrl(cleanThumb)) {
      return res.status(400).json({ error: 'La URL de miniatura no es válida.' });
    }
    item.thumbImageUrl = cleanThumb;
  }
  if (typeof blurImageUrl === 'string') {
    const cleanBlur = blurImageUrl.trim();
    if (!isSafeImageUrl(cleanBlur)) {
      return res.status(400).json({ error: 'La URL de vista previa no es válida.' });
    }
    item.blurImageUrl = cleanBlur;
  }
  if (status === 'disponible' || status === 'intercambiado') item.status = status;

  writeDb(db);
  res.json(item);
});

app.delete('/api/items/:id', (req, res) => {
  const db = readDb();
  const idx = db.items.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Objeto no encontrado.' });

  const userId = req.query.userId;
  if (!userId || db.items[idx].ownerId !== userId) {
    return res.status(403).json({ error: 'No tienes permiso para eliminar este objeto.' });
  }

  const [removed] = db.items.splice(idx, 1);
  // Cancel any pending trades referencing this item
  db.trades.forEach(t => {
    if ((t.targetItemId === removed.id || t.offeredItemId === removed.id) && t.status === 'pendiente') {
      t.status = 'cancelado';
      t.updatedAt = new Date().toISOString();
    }
  });
  writeDb(db);
  res.json({ ok: true });
});

// Trades
function enrichTrade(trade, db) {
  const targetItem = db.items.find(i => i.id === trade.targetItemId) || null;
  const offeredItem = trade.offeredItemId ? (db.items.find(i => i.id === trade.offeredItemId) || null) : null;
  const proposer = db.users.find(u => u.id === trade.proposerId) || null;
  const receiver = db.users.find(u => u.id === trade.receiverId) || null;
  return {
    ...trade,
    targetItem,
    offeredItem,
    proposerName: proposer ? proposer.name : 'Usuario',
    receiverName: receiver ? receiver.name : 'Usuario'
  };
}

app.get('/api/trades', (req, res) => {
  const db = readDb();
  const { userId } = req.query;
  if (!userId) {
    return res.status(400).json({ error: 'Se requiere userId para consultar tus trueques.' });
  }
  const trades = db.trades
    .filter(t => t.proposerId === userId || t.receiverId === userId)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  res.json(trades.map(t => enrichTrade(t, db)));
});

app.post('/api/trades', (req, res) => {
  const { targetItemId, offeredItemId, proposerId, message } = req.body || {};
  if (!targetItemId || !proposerId || !message || !message.trim()) {
    return res.status(400).json({ error: 'Debes indicar el objeto, tu usuario y un mensaje.' });
  }

  const db = readDb();
  const targetItem = db.items.find(i => i.id === targetItemId);
  if (!targetItem) return res.status(404).json({ error: 'Objeto destino no encontrado.' });
  if (targetItem.status !== 'disponible') {
    return res.status(400).json({ error: 'Este objeto ya fue intercambiado.' });
  }
  if (targetItem.ownerId === proposerId) {
    return res.status(400).json({ error: 'No puedes proponer un trueque por tu propio objeto.' });
  }

  if (offeredItemId) {
    const offered = db.items.find(i => i.id === offeredItemId);
    if (!offered || offered.ownerId !== proposerId || offered.status !== 'disponible') {
      return res.status(400).json({ error: 'El objeto ofrecido no es válido o no está disponible.' });
    }
  }

  const now = new Date().toISOString();
  const trade = {
    id: generateId('trd_'),
    targetItemId,
    offeredItemId: offeredItemId || null,
    proposerId,
    receiverId: targetItem.ownerId,
    status: 'pendiente',
    messages: [
      {
        id: generateId('msg_'),
        senderId: proposerId,
        text: message.trim(),
        createdAt: now
      }
    ],
    createdAt: now,
    updatedAt: now
  };

  db.trades.push(trade);
  writeDb(db);
  res.status(201).json(enrichTrade(trade, db));
});

app.patch('/api/trades/:id', (req, res) => {
  const { action, userId } = req.body || {};
  const db = readDb();
  const trade = db.trades.find(t => t.id === req.params.id);
  if (!trade) return res.status(404).json({ error: 'Propuesta no encontrada.' });

  const now = new Date().toISOString();

  if (action === 'aceptar') {
    if (trade.receiverId !== userId) {
      return res.status(403).json({ error: 'Solo el dueño del objeto puede aceptar la propuesta.' });
    }
    trade.status = 'aceptado';
    const target = db.items.find(i => i.id === trade.targetItemId);
    if (target) target.status = 'intercambiado';
    if (trade.offeredItemId) {
      const offered = db.items.find(i => i.id === trade.offeredItemId);
      if (offered) offered.status = 'intercambiado';
    }
    // Reject other pending trades for these items
    db.trades.forEach(other => {
      if (other.id !== trade.id && other.status === 'pendiente') {
        if (
          other.targetItemId === trade.targetItemId ||
          (trade.offeredItemId && (other.targetItemId === trade.offeredItemId || other.offeredItemId === trade.offeredItemId))
        ) {
          other.status = 'rechazado';
          other.updatedAt = now;
        }
      }
    });
  } else if (action === 'rechazar') {
    if (trade.receiverId !== userId) {
      return res.status(403).json({ error: 'Solo el dueño del objeto puede rechazar la propuesta.' });
    }
    trade.status = 'rechazado';
  } else if (action === 'cancelar') {
    if (trade.proposerId !== userId) {
      return res.status(403).json({ error: 'Solo quien propuso el trueque puede cancelarlo.' });
    }
    trade.status = 'cancelado';
  } else if (action === 'completar') {
    if (trade.receiverId !== userId && trade.proposerId !== userId) {
      return res.status(403).json({ error: 'No participas en este trueque.' });
    }
    if (trade.status !== 'completado') {
      trade.status = 'completado';
      [trade.proposerId, trade.receiverId].forEach(uid => {
        const u = db.users.find(usr => usr.id === uid);
        if (u) u.completedTrades = (u.completedTrades || 0) + 1;
      });
    }
  } else {
    return res.status(400).json({ error: 'Acción no válida.' });
  }

  trade.updatedAt = now;
  writeDb(db);
  res.json(enrichTrade(trade, db));
});

app.post('/api/trades/:id/messages', (req, res) => {
  const { senderId, text } = req.body || {};
  if (!senderId || !text || !text.trim()) {
    return res.status(400).json({ error: 'El mensaje no puede estar vacío.' });
  }
  const db = readDb();
  const trade = db.trades.find(t => t.id === req.params.id);
  if (!trade) return res.status(404).json({ error: 'Propuesta no encontrada.' });
  if (trade.proposerId !== senderId && trade.receiverId !== senderId) {
    return res.status(403).json({ error: 'No tienes permiso para escribir en este trueque.' });
  }

  const now = new Date().toISOString();
  trade.messages.push({
    id: generateId('msg_'),
    senderId,
    text: clampStr(text, 1000),
    createdAt: now
  });
  trade.updatedAt = now;
  writeDb(db);
  res.status(201).json(enrichTrade(trade, db));
});

app.listen(PORT, () => {
  console.log(`truecalo escuchando en http://localhost:${PORT}`);
});
