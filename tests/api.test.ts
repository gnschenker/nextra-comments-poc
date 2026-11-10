import { beforeEach, describe, expect, it } from 'vitest'
import { DELETE, PATCH } from '@/app/api/comments/[id]/route'
import { GET, POST } from '@/app/api/comments/route'
import { USER_COOKIE, userFromName } from '@/lib/comments/auth'
import { prisma } from '@/lib/db'

function cookie(name: string): string {
  const user = userFromName(name)
  return `${USER_COOKIE}=${encodeURIComponent(JSON.stringify(user))}`
}

function request(url: string, init: RequestInit = {}): Request {
  return new Request(url, init)
}

async function createComment(
  author: string,
  body: Record<string, unknown>,
  expectedStatus = 201
) {
  const response = await POST(
    request('http://localhost/api/comments', {
      method: 'POST',
      headers: {
        cookie: cookie(author),
        'content-type': 'application/json'
      },
      body: JSON.stringify(body)
    })
  )
  expect(response.status).toBe(expectedStatus)
  if (expectedStatus === 204) return null
  return response.json()
}

describe('comments API', () => {
  beforeEach(async () => {
    await prisma.comment.deleteMany()
  })

  it('creates a page-level comment and lists it', async () => {
    const created = await createComment('Ada Lovelace', {
      page: '/deploy',
      pageVersion: 'v1',
      body: 'Add a diagram of the canary flow.'
    })
    expect(created.body).toBe('Add a diagram of the canary flow.')
    expect(created.author).toEqual({ id: 'ada-lovelace', name: 'Ada Lovelace' })
    expect(created.anchor).toBeNull()
    expect(created.parentId).toBeNull()
    expect(created.resolved).toBe(false)

    const list = await GET(request('http://localhost/api/comments?page=/deploy'))
    expect(list.status).toBe(200)
    const comments = await list.json()
    expect(comments).toHaveLength(1)
    expect(comments[0].id).toBe(created.id)
    expect(comments[0].page).toBe('/deploy')
  })

  it('replies in the same thread', async () => {
    const root = await createComment('Ada Lovelace', {
      page: '/deploy',
      pageVersion: 'v1',
      body: 'Who owns canary promotion?'
    })
    const reply = await createComment('Grace Hopper', {
      page: '/deploy',
      pageVersion: 'v1',
      parentId: root.id,
      body: 'The platform on-call owns it.'
    })
    expect(reply.threadId).toBe(root.threadId)
    expect(reply.parentId).toBe(root.id)
    expect(reply.anchor).toBeNull()

    const list = await GET(request('http://localhost/api/comments?page=/deploy'))
    const comments = await list.json()
    expect(comments.map((row: { body: string }) => row.body)).toEqual([
      'Who owns canary promotion?',
      'The platform on-call owns it.'
    ])
  })

  it('resolves and reopens a thread', async () => {
    const root = await createComment('Ada Lovelace', {
      page: '/incidents',
      pageVersion: 'v1',
      body: 'Clarify the paging window.'
    })
    const resolved = await PATCH(
      request(`http://localhost/api/comments/${root.id}`, {
        method: 'PATCH',
        headers: { cookie: cookie('Ada Lovelace'), 'content-type': 'application/json' },
        body: JSON.stringify({ resolved: true })
      }),
      { params: Promise.resolve({ id: root.id }) }
    )
    expect(resolved.status).toBe(200)
    expect((await resolved.json()).resolved).toBe(true)

    const reopened = await PATCH(
      request(`http://localhost/api/comments/${root.id}`, {
        method: 'PATCH',
        headers: { cookie: cookie('Grace Hopper'), 'content-type': 'application/json' },
        body: JSON.stringify({ resolved: false })
      }),
      { params: Promise.resolve({ id: root.id }) }
    )
    expect(reopened.status).toBe(200)
    expect((await reopened.json()).resolved).toBe(false)
  })

  it('lets an author delete their own comment', async () => {
    const created = await createComment('Ada Lovelace', {
      page: '/getting-started',
      pageVersion: 'v1',
      body: 'Typo in the install command.'
    })
    const deleted = await DELETE(
      request(`http://localhost/api/comments/${created.id}`, {
        method: 'DELETE',
        headers: { cookie: cookie('Ada Lovelace') }
      }),
      { params: Promise.resolve({ id: created.id }) }
    )
    expect(deleted.status).toBe(204)

    const list = await GET(request('http://localhost/api/comments?page=/getting-started'))
    expect(await list.json()).toEqual([])
  })

  it('rejects deleting someone else’s comment', async () => {
    const created = await createComment('Ada Lovelace', {
      page: '/getting-started',
      pageVersion: 'v1',
      body: 'Keep this note.'
    })
    const denied = await DELETE(
      request(`http://localhost/api/comments/${created.id}`, {
        method: 'DELETE',
        headers: { cookie: cookie('Grace Hopper') }
      }),
      { params: Promise.resolve({ id: created.id }) }
    )
    expect(denied.status).toBe(403)
    expect(await denied.json()).toEqual({ error: 'Forbidden' })

    const list = await GET(request('http://localhost/api/comments?page=/getting-started'))
    const comments = await list.json()
    expect(comments).toHaveLength(1)
    expect(comments[0].body).toBe('Keep this note.')
  })

  it('stores an inline anchor without character offsets', async () => {
    const created = await createComment('Ada Lovelace', {
      page: '/deploy',
      pageVersion: 'v1',
      body: 'This sentence is ambiguous.',
      anchor: {
        quote: 'Wait for the health check to return 200 before routing traffic.',
        prefix: 'In production: ',
        suffix: ' Record the time.',
        headingId: 'production'
      }
    })
    expect(created.anchor).toEqual({
      quote: 'Wait for the health check to return 200 before routing traffic.',
      prefix: 'In production: ',
      suffix: ' Record the time.',
      headingId: 'production'
    })
    expect(created.anchor).not.toHaveProperty('start')
    expect(created.anchor).not.toHaveProperty('offset')
  })
})
