const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');

const PORT = 3199;
let server;

test.before(async () => {
  server = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore'
  });

  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/healthz`);
      if (res.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('El servidor de pruebas no respondió');
});

test.after(() => {
  if (server && !server.killed) server.kill();
});

test('GET /healthz devuelve estado OK', async () => {
  const res = await fetch(`http://127.0.0.1:${PORT}/healthz`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'ok');
  assert.equal(body.service, 'truecalo');
});

test('POST /api/register rechaza un email inválido', async () => {
  const res = await fetch(`http://127.0.0.1:${PORT}/api/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Prueba',
      email: 'correo-invalido',
      password: 'password123'
    })
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /correo válido/i);
});

test('GET /api/ruta-desconocida devuelve 404 JSON', async () => {
  const res = await fetch(`http://127.0.0.1:${PORT}/api/ruta-desconocida`);
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.ok(body.error);
});

test('DELETE /api/items/:id sin propietario devuelve 403', async () => {
  const res = await fetch(`http://127.0.0.1:${PORT}/api/items/itm_bici`, {
    method: 'DELETE'
  });
  assert.equal(res.status, 403);
  const body = await res.json();
  assert.match(body.error, /permiso/i);
});
