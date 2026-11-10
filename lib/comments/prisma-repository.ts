import type { PrismaClient } from '@/generated/prisma/client'
import type { CommentRepository } from './repository'
import type { Anchor, Comment, NewComment, User } from './types'

type CommentRow = {
  id: string
  page: string
  pageVersion: string
  threadId: string
  parentId: string | null
  authorId: string
  authorName: string
  body: string
  createdAt: Date
  resolved: boolean
  quote: string | null
  prefix: string | null
  suffix: string | null
  headingId: string | null
}

export class PrismaCommentRepository implements CommentRepository {
  constructor(private readonly db: PrismaClient) {}

  async listByPage(page: string): Promise<Comment[]> {
    const rows = await this.db.comment.findMany({
      where: { page },
      orderBy: { createdAt: 'asc' }
    })
    return rows.map(toComment)
  }

  async getById(id: string): Promise<Comment | null> {
    const row = await this.db.comment.findUnique({ where: { id } })
    return row ? toComment(row) : null
  }

  async create(comment: NewComment & { id: string }): Promise<Comment> {
    const row = await this.db.comment.create({
      data: {
        id: comment.id,
        page: comment.page,
        pageVersion: comment.pageVersion,
        threadId: comment.threadId,
        parentId: comment.parentId,
        authorId: comment.author.id,
        authorName: comment.author.name,
        body: comment.body,
        resolved: comment.resolved,
        quote: comment.anchor?.quote ?? null,
        prefix: comment.anchor?.prefix ?? null,
        suffix: comment.anchor?.suffix ?? null,
        headingId: comment.anchor?.headingId ?? null
      }
    })
    return toComment(row)
  }

  async updateResolved(id: string, resolved: boolean): Promise<Comment> {
    const row = await this.db.comment.update({
      where: { id },
      data: { resolved }
    })
    return toComment(row)
  }

  async delete(id: string): Promise<void> {
    await this.db.comment.delete({ where: { id } })
  }

  async deleteByThreadId(threadId: string): Promise<void> {
    await this.db.comment.deleteMany({ where: { threadId } })
  }
}

function toComment(row: CommentRow): Comment {
  const author: User = { id: row.authorId, name: row.authorName }
  const anchor: Anchor | null =
    row.quote === null
      ? null
      : {
          quote: row.quote,
          prefix: row.prefix ?? '',
          suffix: row.suffix ?? '',
          headingId: row.headingId
        }
  return {
    id: row.id,
    page: row.page,
    pageVersion: row.pageVersion,
    threadId: row.threadId,
    parentId: row.parentId,
    author,
    body: row.body,
    createdAt: row.createdAt,
    resolved: row.resolved,
    anchor
  }
}
