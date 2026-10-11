// Security tests: one user must never be able to read or change another
// user's data, and admin routes must be closed to normal users.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'vera-test-'));
process.env.NODE_ENV = 'test';
process.env.DB_PATH = join(dir, 'test.db');
process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-the-check-0123456789';
process.env.ADMIN_EMAILS = 'admin@example.com';

let request, app, alice, bob, admin;

async function register(email) {
  const res = await request(app).post('/api/auth/register')
    .send({ email, password: 'correct-horse-9', name: email.split('@')[0] });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return { token: res.body.token, id: res.body.user.id, user: res.body.user };
}
const auth = (u) => ({ Authorization: `Bearer ${u.token}` });

before(async () => {
  request = (await import('supertest')).default;
  app = (await import('../app.js')).default;
  alice = await register('alice@example.com');
  bob   = await register('bob@example.com');
  admin = await register('admin@example.com');
});

after(() => rmSync(dir, { recursive: true, force: true }));

test('password hash is never returned', () => {
  assert.equal(alice.user.password_hash, undefined);
});

test('data routes reject requests with no token', async () => {
  for (const path of [`/api/chat/${alice.id}`, `/api/goals/${alice.id}`,
                      `/api/mood/${alice.id}/week`, `/api/user/${alice.id}`]) {
    const res = await request(app).get(path);
    assert.equal(res.status, 401, path);
  }
});

test('data routes reject a forged token', async () => {
  const res = await request(app).get(`/api/chat/${alice.id}`)
    .set('Authorization', 'Bearer not.a.real.token');
  assert.equal(res.status, 401);
});

test('a user can read their own data', async () => {
  const res = await request(app).get(`/api/goals/${alice.id}`).set(auth(alice));
  assert.equal(res.status, 200);
});

test("a user cannot read another user's data (IDOR)", async () => {
  for (const path of [`/api/chat/${bob.id}`, `/api/goals/${bob.id}`,
                      `/api/mood/${bob.id}/week`, `/api/user/${bob.id}`,
                      `/api/insights/${bob.id}/memories`, `/api/invites/${bob.id}`]) {
    const res = await request(app).get(path).set(auth(alice));
    assert.equal(res.status, 403, path);
  }
});

test("a user cannot delete another user's chat history", async () => {
  const res = await request(app).delete(`/api/chat/${bob.id}`).set(auth(alice));
  assert.equal(res.status, 403);
});

test("a user cannot edit another user's profile", async () => {
  const res = await request(app).patch(`/api/user/${bob.id}`).set(auth(alice))
    .send({ name: 'hacked' });
  assert.equal(res.status, 403);
});

test('admin routes are closed to normal users', async () => {
  const noToken = await request(app).get('/api/admin/users');
  assert.equal(noToken.status, 401);
  const normal = await request(app).get('/api/admin/users').set(auth(alice));
  assert.equal(normal.status, 403);
});

test('admin routes work for ADMIN_EMAILS and hide password hashes', async () => {
  const res = await request(app).get('/api/admin/users').set(auth(admin));
  assert.equal(res.status, 200);
  assert.ok(res.body.users.length >= 3);
  for (const u of res.body.users) assert.equal(u.password_hash, undefined);
});

test('registration rejects weak passwords and bad emails', async () => {
  const weak = await request(app).post('/api/auth/register')
    .send({ email: 'x@example.com', password: '123' });
  assert.equal(weak.status, 400);
  const bad = await request(app).post('/api/auth/register')
    .send({ email: 'not-an-email', password: 'long-enough-pw' });
  assert.equal(bad.status, 400);
});

test('login gives the same error for wrong email and wrong password', async () => {
  const a = await request(app).post('/api/auth/login')
    .send({ email: 'alice@example.com', password: 'wrong-password' });
  const b = await request(app).post('/api/auth/login')
    .send({ email: 'nobody@example.com', password: 'wrong-password' });
  assert.equal(a.status, 401);
  assert.equal(b.status, 401);
  assert.deepEqual(a.body, b.body);
});

test('invite validation does not leak who created the invite', async () => {
  const gen = await request(app).post(`/api/invites/${alice.id}/generate`).set(auth(alice));
  assert.equal(gen.status, 200);
  const res = await request(app).get(`/api/invites/validate/${gen.body.code}`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { valid: true });
});

test('a user can export and then delete their own account', async () => {
  const exp = await request(app).get(`/api/user/${bob.id}/export`).set(auth(bob));
  assert.equal(exp.status, 200);
  assert.equal(exp.body.user.id, bob.id);
  assert.equal(exp.body.user.password_hash, undefined);

  const del = await request(app).delete(`/api/user/${bob.id}`).set(auth(bob));
  assert.equal(del.status, 200);
  const after = await request(app).get(`/api/user/${bob.id}`).set(auth(bob));
  assert.equal(after.status, 401); // token no longer maps to a user
});
