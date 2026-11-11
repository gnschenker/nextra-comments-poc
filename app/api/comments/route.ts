import { getCurrentUser } from '@/lib/comments/auth'
import { errorResponse, json, readJson, serializeComment } from '@/lib/comments/http'
import { commentService } from '@/lib/comments/server'
import type { CreateCommentInput } from '@/lib/comments/types'
import { CommentError } from '@/lib/comments/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request): Promise<Response> {
  try {
    const page = new URL(req.url).searchParams.get('page')?.trim() ?? ''
    if (!page) throw new CommentError('page is required', 400)
    const comments = await commentService.listByPage(page)
    return json(comments.map(serializeComment))
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    const user = getCurrentUser(req)
    if (!user) return json({ error: 'Unauthorized' }, 401)
    const input = parseCreateInput(await readJson(req))
    const comment = await commentService.create(user, input)
    return json(serializeComment(comment), 201)
  } catch (error) {
    return errorResponse(error)
  }
}

function parseCreateInput(body: unknown): CreateCommentInput {
  if (!body || typeof body !== 'object') throw new CommentError('invalid body', 400)
  const value = body as Record<string, unknown>
  if (typeof value.page !== 'string' || typeof value.pageVersion !== 'string' || typeof value.body !== 'string') {
    throw new CommentError('page, pageVersion, and body are required', 400)
  }
  const anchor = parseAnchor(value.anchor)
  return {
    page: value.page,
    pageVersion: value.pageVersion,
    body: value.body,
    parentId: typeof value.parentId === 'string' ? value.parentId : null,
    anchor
  }
}

function parseAnchor(value: unknown): CreateCommentInput['anchor'] {
  if (value == null) return null
  if (typeof value !== 'object') throw new CommentError('invalid anchor', 400)
  const anchor = value as Record<string, unknown>
  if (typeof anchor.quote !== 'string') throw new CommentError('invalid anchor', 400)
  return {
    quote: anchor.quote,
    prefix: typeof anchor.prefix === 'string' ? anchor.prefix : '',
    suffix: typeof anchor.suffix === 'string' ? anchor.suffix : '',
    headingId: typeof anchor.headingId === 'string' ? anchor.headingId : null
  }
}
