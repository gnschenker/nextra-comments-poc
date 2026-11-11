import { prisma } from '@/lib/db'
import { PrismaCommentRepository } from './prisma-repository'
import { CommentService } from './service'

const repository = new PrismaCommentRepository(prisma)
export const commentService = new CommentService(repository)
