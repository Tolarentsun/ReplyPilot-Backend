import {
  usersStore,
  comparePassword,
  signToken,
  json,
  badRequest,
  serverError,
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

  if (!email || !password) {
    return badRequest('Email and password are required')
  }

  try {
    const users = usersStore()
    const user = await users.get(email, { type: 'json' })
    if (!user) {
      return json({ success: false, error: 'Invalid email or password' }, 401)
    }

    const valid = await comparePassword(password, user.password_hash)
    if (!valid) {
      return json({ success: false, error: 'Invalid email or password' }, 401)
    }

    const token = signToken({ id: user.id, email: user.email })
    return json({
      success: true,
      token,
      user: { id: user.id, email: user.email, name: user.name, plan: user.plan },
    })
  } catch (err) {
    console.error('login error:', err)
    return serverError('Login failed')
  }
}

export const config = {
  path: '/api/auth/login',
  method: 'POST',
}
