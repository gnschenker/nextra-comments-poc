import { getCurrentUser } from '@/lib/comments/auth'
import { errorResponse, json, readJson, serializeComment } from '@/lib/comments/http'
import { commentService } from '@/lib/comments/server'
import { CommentError } from '@/lib/comments/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const user = getCurrentUser(req)
    if (!user) return json({ error: 'Unauthorized' }, 401)
    const { id } = await context.params
    const body = await readJson(req)
    if (!body || typeof body !== 'object' || typeof (body as { resolved?: unknown }).resolved !== 'boolean') {
      throw new CommentError('resolved is required', 400)
    }
    const comment = await commentService.setResolved(user, id, (body as { resolved: boolean }).resolved)
    return json(serializeComment(comment))
  } catch (error) {
    return errorResponse(error)
  }
}

export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const user = getCurrentUser(req)
    if (!user) return json({ error: 'Unauthorized' }, 401)
    const { id } = await context.params
    await commentService.deleteOwn(user, id)
    return new Response(null, { status: 204 })
  } catch (error) {
    return errorResponse(error)
  }
}
