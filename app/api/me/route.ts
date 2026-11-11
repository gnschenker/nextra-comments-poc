import { getCurrentUser, serializeUserCookie, userFromName } from '@/lib/comments/auth'
import { json, readJson } from '@/lib/comments/http'
import { CommentError } from '@/lib/comments/service'
import { errorResponse } from '@/lib/comments/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request): Promise<Response> {
  return json({ user: getCurrentUser(req) })
}

export async function POST(req: Request): Promise<Response> {
  try {
    const body = await readJson(req)
    const name = body && typeof body === 'object' ? (body as { name?: unknown }).name : null
    if (typeof name !== 'string' || !name.trim()) throw new CommentError('name is required', 400)
    const user = userFromName(name)
    return json({ user }, 200, { 'Set-Cookie': serializeUserCookie(user) })
  } catch (error) {
    return errorResponse(error)
  }
}
