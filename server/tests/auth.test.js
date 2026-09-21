import assert from 'node:assert/strict'
import { once } from 'node:events'
import { before, after, beforeEach, test } from 'node:test'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import app from '../app.js'
import User from '../models/User.js'
import Document from '../models/Document.js'
import { env } from '../config/env.js'
import { signSession } from '../services/authService.js'

const alice = '607f1f77bcf86cd799439011'
const bob = '607f1f77bcf86cd799439012'
const documentId = '507f1f77bcf86cd799439011'
const password = 'a sensible test password'
let server, base, users, documents, passwordHash, createUser, readDocument
before(async () => {
  passwordHash = await bcrypt.hash(password, 12)
  server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  base = `http://127.0.0.1:${server.address().port}/api`
})
after(async () => { await new Promise(resolve => server.close(resolve)) })
beforeEach(context => {
  env.jwtSecret = 'test-only-secret-not-for-production-123456789'
  env.jwtExpiresIn = '7d'
  env.production = false
  users = [{ _id: alice, name: 'Alice', email: 'alice@example.com', passwordHash, createdAt: new Date() },
    { _id: bob, name: 'Bob', email: 'bob@example.com', passwordHash, createdAt: new Date() }]
  documents = [{ _id: documentId, owner: alice, originalName: 'private.pdf', size: 100,
    createdAt: new Date(), extractedText: 'Private revenue', chatHistory: [] }]
  context.mock.method(User, 'findById', async id => users.find(user => String(user._id) === id) || null)
  context.mock.method(User, 'findOne', filter => ({ async select(selection) {
    assert.equal(selection, '+passwordHash')
    return users.find(user => user.email === filter.email) || null
  } }))
  createUser = context.mock.method(User, 'create', async data => {
    if (users.some(user => user.email === data.email)) throw Object.assign(new Error('duplicate'), { code: 11000 })
    const user = new User({ ...data, _id: '607f1f77bcf86cd799439013' })
    await user.validate()
    users.push(user)
    return user
  })
  readDocument = context.mock.method(Document, 'findOne', (filter, projection) => {
    assert.ok(filter.owner, 'All document reads must have an owner filter')
    const value = documents.find(document => document._id === filter._id && document.owner === filter.owner) || null
    return projection ? { async lean() { return value } } : Promise.resolve(value)
  })
  context.mock.method(Document, 'find', filter => {
    assert.ok(filter.owner)
    return { sort() { return this }, async lean() { return documents.filter(document => document.owner === filter.owner) } }
  })
})
async function request(path, { method = 'GET', body, userId, cookie, origin } = {}) {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (userId) headers.Cookie = `session=${signSession(userId).token}`
  if (cookie) headers.Cookie = cookie
  if (origin) headers.Origin = origin
  const response = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  return { status: response.status, headers: response.headers, body: response.status === 204 ? null : await response.json() }
}

test('registration normalizes email, hashes password and returns only public user fields', async () => {
  const result = await request('/auth/register', { method: 'POST', body: { name: ' New User ', email: ' NEW@EXAMPLE.COM ', password } })
  assert.equal(result.status, 201)
  assert.equal(result.body.user.name, 'New User')
  assert.equal(result.body.user.email, 'new@example.com')
  assert.deepEqual(Object.keys(result.body.user).sort(), ['createdAt', 'email', 'id', 'name'])
  const saved = createUser.mock.calls[0].arguments[0]
  assert.equal('password' in saved, false)
  assert.notEqual(saved.passwordHash, password)
  assert.equal(await bcrypt.compare(password, saved.passwordHash), true)
  assert.equal(bcrypt.getRounds(saved.passwordHash), 12)
  const cookie = result.headers.get('set-cookie')
  assert.match(cookie, /HttpOnly/)
  assert.match(cookie, /SameSite=Lax/)
  assert.ok(!cookie.includes('Secure'))
  assert.ok(!JSON.stringify(result.body).includes(saved.passwordHash))
  const session = await request('/auth/me', { cookie: cookie.split(';')[0] })
  assert.equal(session.status, 200)
  assert.equal(session.body.user.email, 'new@example.com')
})

test('duplicate normalized email returns 409', async () => {
  const result = await request('/auth/register', { method: 'POST', body: { name: 'Alice', email: 'ALICE@example.com', password } })
  assert.equal(result.status, 409)
  assert.equal(result.headers.get('set-cookie'), null)
})

test('successful login sets cookie, production uses Secure, and me omits password hash', async () => {
  env.production = true
  const result = await request('/auth/login', { method: 'POST', body: { email: ' ALICE@EXAMPLE.COM ', password } })
  assert.equal(result.status, 200)
  assert.match(result.headers.get('set-cookie'), /Secure/)
  assert.equal(result.body.user.passwordHash, undefined)
  const me = await request('/auth/me', { cookie: result.headers.get('set-cookie').split(';')[0] })
  assert.equal(me.status, 200)
  assert.equal(me.body.user.id, alice)
  assert.equal(me.body.user.passwordHash, undefined)
})

test('wrong password and unknown email have the same generic response', async () => {
  const wrong = await request('/auth/login', { method: 'POST', body: { email: 'alice@example.com', password: 'wrong password' } })
  const missing = await request('/auth/login', { method: 'POST', body: { email: 'nobody@example.com', password } })
  assert.equal(wrong.status, 401)
  assert.equal(missing.status, 401)
  assert.deepEqual(wrong.body, missing.body)
  assert.deepEqual(wrong.body, { status: 'error', message: 'Invalid email or password.' })
})

test('logout expires the HTTP-only cookie', async () => {
  const result = await request('/auth/logout', { method: 'POST', userId: alice })
  assert.equal(result.status, 204)
  assert.match(result.headers.get('set-cookie'), /session=;/)
  assert.match(result.headers.get('set-cookie'), /Expires=Thu, 01 Jan 1970/)
  assert.match(result.headers.get('set-cookie'), /HttpOnly/)
  assert.equal((await request('/auth/me')).status, 401)
})

test('rejects malformed registration and login bodies', async () => {
  for (const body of [null, {}, { name: 'A', email: 'invalid', password },
    { name: 'A', email: 'a@example.com', password: 'short' },
    { name: 'A', email: 'a@example.com', password: 'é'.repeat(40) },
    { name: 'A', email: { $ne: null }, password },
    { name: 'A', email: 'a@example.com', password, admin: true }]) {
    assert.equal((await request('/auth/register', { method: 'POST', body })).status, 400)
  }
  assert.equal(createUser.mock.callCount(), 0)
  assert.equal((await request('/auth/login', { method: 'POST', body: { email: [], password } })).status, 400)
})

test('all document routes and me reject unauthenticated requests', async () => {
  for (const [path, method] of [['/documents', 'GET'], [`/documents/${documentId}`, 'GET'],
    [`/documents/${documentId}/chat`, 'GET'], ['/documents/upload', 'POST'],
    [`/documents/${documentId}/analyze`, 'POST'], [`/documents/${documentId}/ask`, 'POST'], ['/auth/me', 'GET']]) {
    assert.equal((await request(path, { method })).status, 401)
  }
  assert.equal(readDocument.mock.callCount(), 0)
})

test('invalid, expired, wrong-algorithm tokens and deleted users are rejected', async () => {
  for (const token of ['invalid', jwt.sign({ sub: alice }, env.jwtSecret, { expiresIn: -1 }),
    jwt.sign({ sub: alice }, env.jwtSecret, { algorithm: 'HS384' }), signSession('607f1f77bcf86cd799439099').token]) {
    assert.equal((await request('/auth/me', { cookie: `session=${token}` })).status, 401)
  }
})

test('users list only their documents and cannot see ownerless documents', async () => {
  documents.push({ ...documents[0], _id: '507f1f77bcf86cd799439012', owner: bob },
    { ...documents[0], _id: '507f1f77bcf86cd799439013', owner: undefined })
  const first = await request('/documents', { userId: alice })
  const second = await request('/documents', { userId: bob })
  assert.deepEqual(first.body.map(document => document.id), [documentId])
  assert.deepEqual(second.body.map(document => document.id), ['507f1f77bcf86cd799439012'])
  assert.equal((await request(`/documents/${documentId}`, { userId: alice })).status, 200)
})

for (const [action, suffix, method] of [['fetch', '', 'GET'], ['analyze', '/analyze', 'POST'],
  ['chat with', '/ask', 'POST'], ['read chat history of', '/chat', 'GET']]) {
  test(`user cannot ${action} another user's or ownerless document`, async () => {
    for (const owner of [alice, undefined]) {
      documents[0].owner = owner
      const result = await request(`/documents/${documentId}${suffix}`, { method, userId: bob,
        ...(method === 'POST' ? { body: { question: 'What is revenue?' } } : {}) })
      assert.equal(result.status, 404)
      assert.deepEqual(result.body, { status: 'error', message: 'Document not found.' })
    }
  })
}

test('database errors do not leak private details', async () => {
  User.findById.mock.mockImplementation(async () => { throw new Error('private database details') })
  const result = await request('/auth/me', { userId: alice })
  assert.equal(result.status, 503)
  assert.ok(!JSON.stringify(result.body).includes('private'))
})

test('missing JWT secret prevents account creation', async () => {
  env.jwtSecret = ''
  assert.equal((await request('/auth/register', { method: 'POST', body: { name: 'A', email: 'a@example.com', password } })).status, 503)
  assert.equal(createUser.mock.callCount(), 0)
})

test('credentialed CORS allows configured frontend and rejects foreign mutation origins', async () => {
  const result = await request('/auth/me', { userId: alice, origin: env.clientUrl })
  assert.equal(result.headers.get('access-control-allow-origin'), env.clientUrl)
  assert.equal(result.headers.get('access-control-allow-credentials'), 'true')
  assert.equal((await request('/auth/logout', { method: 'POST', userId: alice, origin: 'https://untrusted.example' })).status, 403)
})
