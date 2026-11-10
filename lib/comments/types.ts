export type User = {
  id: string
  name: string
}

export type Anchor = {
  quote: string
  prefix: string
  suffix: string
  headingId: string | null
}

export type Comment = {
  id: string
  page: string
  pageVersion: string
  threadId: string
  parentId: string | null
  author: User
  body: string
  createdAt: Date
  resolved: boolean
  anchor: Anchor | null
}

export type NewComment = {
  page: string
  pageVersion: string
  threadId: string
  parentId: string | null
  author: User
  body: string
  resolved: boolean
  anchor: Anchor | null
}

export type CreateCommentInput = {
  page: string
  pageVersion: string
  body: string
  parentId?: string | null
  anchor?: Anchor | null
}

export type HeadingRange = {
  id: string
  start: number
  end: number
}

export type DocumentText = {
  text: string
  headingRanges: HeadingRange[]
}

export type Attachment =
  | {
      status: 'exact' | 'fuzzy'
      start: number
      end: number
      headingId: string | null
    }
  | { status: 'outdated' }
