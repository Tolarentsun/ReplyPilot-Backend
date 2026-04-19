import {
  usersStore,
  authUser,
  json,
  unauthorized,
  serverError,
} from '../lib/common.mjs'

export default async (req) => {
  const auth = authUser(req)
  if (!auth) return unauthorized()

  try {
    const users = usersStore()
    const user = await users.get(auth.email, { type: 'json' })
    if (!user) return unauthorized('Account not found')

    return json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        plan: user.plan,
        trial_ends: user.trial_ends,
        created_at: user.created_at,
      },
    })
  } catch (err) {
    console.error('me error:', err)
    return serverError()
  }
}

export const config = {
  path: '/api/auth/me',
  method: 'GET',
}
