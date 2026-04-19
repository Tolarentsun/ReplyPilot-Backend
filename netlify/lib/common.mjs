import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { getStore } from '@netlify/blobs'

const JWT_SECRET = () =>
  Netlify.env.get('JWT_SECRET') ||
  'dev-only-secret-please-override-in-netlify-env-CHANGE-ME'

export function usersStore() {
  return getStore({ name: 'users', consistency: 'strong' })
}

export function reviewsStore() {
  return getStore({ name: 'reviews', consistency: 'strong' })
}

export async function hashPassword(plain) {
  const salt = await bcrypt.genSalt(10)
  return bcrypt.hash(plain, salt)
}

export function comparePassword(plain, hash) {
  return bcrypt.compare(plain, hash)
}

export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET(), { expiresIn: '7d' })
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET())
  } catch {
    return null
  }
}

export function getBearer(req) {
  const header = req.headers.get('authorization') || ''
  if (!header.toLowerCase().startsWith('bearer ')) return null
  return header.slice(7).trim()
}

export function authUser(req) {
  const token = getBearer(req)
  if (!token) return null
  const decoded = verifyToken(token)
  if (!decoded || !decoded.id) return null
  return decoded
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function badRequest(error) {
  return json({ success: false, error }, 400)
}

export function unauthorized(error = 'Unauthorized') {
  return json({ success: false, error }, 401)
}

export function serverError(error = 'Internal server error') {
  return json({ success: false, error }, 500)
}

export function newId() {
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 10)
  )
}

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}
