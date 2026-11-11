import type { Comment, NewComment } from './types'

export type CommentRepository = {
  listByPage(page: string): Promise<Comment[]>
  getById(id: string): Promise<Comment | null>
  create(comment: NewComment & { id: string }): Promise<Comment>
  updateResolved(id: string, resolved: boolean): Promise<Comment>
  delete(id: string): Promise<void>
  deleteByThreadId(threadId: string): Promise<void>
}
