import type { CommentRepository } from './repository'
import type { Anchor, Comment, CreateCommentInput, User } from './types'

export class CommentError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
    this.name = 'CommentError'
  }
}

export class CommentService {
  constructor(private readonly repo: CommentRepository) {}

  listByPage(page: string): Promise<Comment[]> {
    return this.repo.listByPage(page)
  }

  async create(user: User, input: CreateCommentInput): Promise<Comment> {
    const page = input.page.trim()
    const body = input.body.trim()
    const pageVersion = input.pageVersion.trim()
    if (!page) throw new CommentError('page is required', 400)
    if (!pageVersion) throw new CommentError('pageVersion is required', 400)
    if (!body) throw new CommentError('body is required', 400)

    let threadId = crypto.randomUUID()
    let parentId: string | null = null
    let anchor = input.anchor ?? null
    let resolved = false

    if (input.parentId) {
      const parent = await this.repo.getById(input.parentId)
      if (!parent) throw new CommentError('parent not found', 404)
      if (parent.page !== page) throw new CommentError('parent is on a different page', 400)
      const root = await this.rootOf(parent)
      if (root.resolved) throw new CommentError('Thread is resolved', 409)
      threadId = parent.threadId
      parentId = parent.id
      anchor = null
      resolved = false
    } else if (anchor && !anchor.quote.trim()) {
      throw new CommentError('anchor.quote is required', 400)
    }

    return this.repo.create({
      id: crypto.randomUUID(),
      page,
      pageVersion,
      threadId,
      parentId,
      author: user,
      body,
      resolved,
      anchor: anchor && anchor.quote ? sanitizeAnchor(anchor) : null
    })
  }

  async setResolved(user: User, id: string, resolved: boolean): Promise<Comment> {
    const comment = await this.repo.getById(id)
    if (!comment) throw new CommentError('comment not found', 404)
    const root = await this.rootOf(comment)
    if (root.author.id !== user.id) throw new CommentError('Forbidden', 403)
    return this.repo.updateResolved(root.id, resolved)
  }

  async deleteOwn(user: User, id: string): Promise<void> {
    const comment = await this.repo.getById(id)
    if (!comment) throw new CommentError('comment not found', 404)
    if (comment.author.id !== user.id) throw new CommentError('Forbidden', 403)
    if (comment.parentId === null) {
      await this.repo.deleteByThreadId(comment.threadId)
      return
    }
    await this.repo.delete(id)
  }

  private async rootOf(comment: Comment): Promise<Comment> {
    let current = comment
    const seen = new Set<string>()
    while (current.parentId) {
      if (seen.has(current.id)) break
      seen.add(current.id)
      const parent = await this.repo.getById(current.parentId)
      if (!parent) break
      current = parent
    }
    return current
  }
}

function sanitizeAnchor(anchor: Anchor): Anchor {
  return {
    quote: anchor.quote,
    prefix: anchor.prefix ?? '',
    suffix: anchor.suffix ?? '',
    headingId: anchor.headingId ?? null
  }
}
