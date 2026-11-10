import { CommentError } from './service'

export function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(data, { status, headers })
}

export function errorResponse(error: unknown): Response {
  if (error instanceof CommentError) {
    return json({ error: error.message }, error.status)
  }
  console.error(error)
  return json({ error: 'Internal Server Error' }, 500)
}

export function serializeComment(comment: {
  id: string
  page: string
  pageVersion: string
  threadId: string
  parentId: string | null
  author: { id: string; name: string }
  body: string
  createdAt: Date
  resolved: boolean
  anchor: {
    quote: string
    prefix: string
    suffix: string
    headingId: string | null
  } | null
}) {
  return {
    id: comment.id,
    page: comment.page,
    pageVersion: comment.pageVersion,
    threadId: comment.threadId,
    parentId: comment.parentId,
    author: comment.author,
    body: comment.body,
    createdAt: comment.createdAt.toISOString(),
    resolved: comment.resolved,
    anchor: comment.anchor
  }
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json()
  } catch {
    throw new CommentError('invalid JSON', 400)
  }
}
