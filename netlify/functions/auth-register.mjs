import {
  usersStore,
  hashPassword,
  signToken,
  json,
  badRequest,
  serverError,
  newId,
  normalizeEmail,
} from '../lib/common.mjs'

export default async (req) => {
  if (req.method !== 'POST') {
    return json({ success: false, error: 'Method not allowed' }, 405)
  }

  let body
  try {
    body = await req.json()
  } catch {
    return badRequest('Invalid JSON body')
  }

  const email = normalizeEmail(body.email)
  const password = body.password
  const name = (body.name || '').toString().trim()

  if (!email || !password) {
    return badRequest('Email and password are required')
  }

  if (password.length < 6) {
    return badRequest('Password must be at least 6 characters')
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    return badRequest('Please enter a valid email address')
  }

  try {
    const users = usersStore()
    const existing = await users.get(email, { type: 'json' })
    if (existing) {
      return json(
        { success: false, error: 'An account with this email already exists' },
        409
      )
    }

    const passwordHash = await hashPassword(password)
    const user = {
      id: newId(),
      email,
      password_hash: passwordHash,
      name: name || email.split('@')[0],
      plan: 'trial',
      trial_ends: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      created_at: new Date().toISOString(),
    }

    await users.setJSON(email, user)

    const token = signToken({ id: user.id, email: user.email })

    return json({
      success: true,
      token,
      user: { id: user.id, email: user.email, name: user.name, plan: user.plan },
    })
  } catch (err) {
    console.error('register error:', err)
    return serverError('Failed to create account')
  }
}

export const config = {
  path: '/api/auth/register',
  method: 'POST',
}
