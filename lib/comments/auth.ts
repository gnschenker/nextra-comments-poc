import type { User } from './types'

export const USER_COOKIE = 'nextra_comments_user'

export function parseCookieHeader(header: string | null): Record<string, string> {
  if (!header) return {}
  const out: Record<string, string> = {}
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    const key = part.slice(0, idx).trim()
    const value = part.slice(idx + 1).trim()
    if (key) out[key] = value
  }
  return out
}

export function getCurrentUser(req: Request): User | null {
  const raw = parseCookieHeader(req.headers.get('cookie'))[USER_COOKIE]
  if (!raw) return null
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as Partial<User>
    if (typeof parsed.id === 'string' && parsed.id && typeof parsed.name === 'string' && parsed.name) {
      return { id: parsed.id, name: parsed.name }
    }
  } catch {
    return null
  }
  return null
}

export function userFromName(name: string): User {
  const trimmed = name.trim()
  const id = slugify(trimmed)
  return { id, name: trimmed }
}

export function serializeUserCookie(user: User): string {
  const value = encodeURIComponent(JSON.stringify(user))
  return `${USER_COOKIE}=${value}; Path=/; SameSite=Lax; Max-Age=31536000`
}

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'anonymous'
}
