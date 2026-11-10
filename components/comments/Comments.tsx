'use client'

import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { captureAnchor, indexArticle, rangeFromOffsets, type ArticleIndex } from '@/lib/comments/index-dom'
import { attachAnchor } from '@/lib/comments/reattach'
import type { Anchor, Comment, DocumentText, User } from '@/lib/comments/types'
import './Comments.css'

type CommentDto = Omit<Comment, 'createdAt'> & { createdAt: string }

type LocatedThread = {
  root: CommentDto
  replies: CommentDto[]
  attachment: ReturnType<typeof attachAnchor> | { status: 'page' }
}

type Overlay = {
  threadId: string
  rects: Array<{ top: number; left: number; width: number; height: number }>
  marker: { top: number; left: number }
  resolved: boolean
}

export function Comments() {
  const pathname = usePathname() || '/'
  const page = pathname.replace(/\/$/, '') || '/'
  const [user, setUser] = useState<User | null>(null)
  const [nameDraft, setNameDraft] = useState('')
  const [comments, setComments] = useState<CommentDto[]>([])
  const [error, setError] = useState<string | null>(null)
  const [articleIndex, setArticleIndex] = useState<ArticleIndex | null>(null)
  const [host, setHost] = useState<HTMLElement | null>(null)
  const [pageVersion, setPageVersion] = useState('unknown')
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})
  const [pageDraft, setPageDraft] = useState('')
  const [inlineDraft, setInlineDraft] = useState('')
  const [pendingAnchor, setPendingAnchor] = useState<Anchor | null>(null)
  const [toolbar, setToolbar] = useState<{ top: number; left: number } | null>(null)
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [overlays, setOverlays] = useState<Overlay[]>([])

  const loadUser = useCallback(async () => {
    const response = await fetch('/api/me', { credentials: 'include' })
    const data = (await response.json()) as { user: User | null }
    setUser(data.user)
    if (data.user) setNameDraft(data.user.name)
  }, [])

  const loadComments = useCallback(async () => {
    const response = await fetch(`/api/comments?page=${encodeURIComponent(page)}`, { credentials: 'include' })
    if (!response.ok) {
      setError('Could not load comments.')
      return
    }
    setComments((await response.json()) as CommentDto[])
    setError(null)
  }, [page])

  useEffect(() => {
    void loadUser()
  }, [loadUser])

  useEffect(() => {
    void loadComments()
  }, [loadComments])

  useEffect(() => {
    const refreshIndex = () => {
      const root = document.querySelector<HTMLElement>('[data-comments-content]')
      if (!root) return
      root.style.position = 'relative'
      const index = indexArticle(root)
      setHost(root)
      setArticleIndex(index)
      void hashText(index.doc.text).then(setPageVersion)
    }
    const frame = requestAnimationFrame(refreshIndex)
    return () => cancelAnimationFrame(frame)
  }, [pathname, comments.length])

  const threads = useMemo(
    () => locateThreads(comments, articleIndex?.doc ?? null),
    [comments, articleIndex]
  )

  const paint = useCallback(() => {
    if (!host || !articleIndex) {
      setOverlays([])
      return
    }
    const rootBox = host.getBoundingClientRect()
    const next: Overlay[] = []
    for (const thread of threads) {
      if (thread.attachment.status === 'page' || thread.attachment.status === 'outdated') continue
      const range = rangeFromOffsets(articleIndex, thread.attachment.start, thread.attachment.end)
      if (!range) continue
      const rects = Array.from(range.getClientRects()).map((rect) => ({
        top: rect.top - rootBox.top + host.scrollTop,
        left: rect.left - rootBox.left,
        width: rect.width,
        height: rect.height
      }))
      if (rects.length === 0) continue
      next.push({
        threadId: thread.root.threadId,
        rects,
        marker: {
          top: rects[0].top,
          left: Math.max(8, host.clientWidth - 22)
        },
        resolved: thread.root.resolved
      })
    }
    setOverlays(next)
  }, [articleIndex, host, threads])

  useEffect(() => {
    paint()
    const onRelayout = () => paint()
    window.addEventListener('resize', onRelayout)
    window.addEventListener('scroll', onRelayout, true)
    return () => {
      window.removeEventListener('resize', onRelayout)
      window.removeEventListener('scroll', onRelayout, true)
    }
  }, [paint])

  useEffect(() => {
    const onMouseUp = () => {
      const root = document.querySelector<HTMLElement>('[data-comments-content]')
      const selection = window.getSelection()
      if (!root || !selection || selection.isCollapsed || !selection.rangeCount) {
        setToolbar(null)
        return
      }
      const range = selection.getRangeAt(0)
      if (!root.contains(range.commonAncestorContainer)) {
        setToolbar(null)
        return
      }
      const index = indexArticle(root)
      const captured = captureAnchor(index, range)
      if (!captured) {
        setToolbar(null)
        return
      }
      const rect = range.getBoundingClientRect()
      setPendingAnchor(captured)
      setToolbar({ top: rect.top - 8, left: rect.left + rect.width / 2 })
    }
    document.addEventListener('mouseup', onMouseUp)
    return () => document.removeEventListener('mouseup', onMouseUp)
  }, [pathname])

  async function saveName(event: FormEvent) {
    event.preventDefault()
    const response = await fetch('/api/me', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: nameDraft })
    })
    const data = (await response.json()) as { user?: User; error?: string }
    if (!response.ok || !data.user) {
      setError(data.error ?? 'Could not save name.')
      return
    }
    setUser(data.user)
  }

  async function submit(body: string, extra: { parentId?: string; anchor?: Anchor | null }) {
    if (!user) {
      setError('Pick a display name first.')
      return
    }
    const response = await fetch('/api/comments', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        page,
        pageVersion,
        body,
        parentId: extra.parentId ?? null,
        anchor: extra.anchor ?? null
      })
    })
    if (!response.ok) {
      const data = (await response.json()) as { error?: string }
      setError(data.error ?? 'Could not save comment.')
      return
    }
    setError(null)
    await loadComments()
  }

  async function setResolved(id: string, resolved: boolean) {
    const response = await fetch(`/api/comments/${id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ resolved })
    })
    if (!response.ok) {
      setError('Could not update thread.')
      return
    }
    await loadComments()
  }

  async function remove(id: string) {
    const response = await fetch(`/api/comments/${id}`, { method: 'DELETE', credentials: 'include' })
    if (!response.ok) {
      const data = (await response.json()) as { error?: string }
      setError(data.error ?? 'Could not delete comment.')
      return
    }
    await loadComments()
  }

  const pageThreads = threads.filter((thread) => thread.attachment.status === 'page')
  const inlineThreads = threads.filter(
    (thread) => thread.attachment.status === 'exact' || thread.attachment.status === 'fuzzy'
  )
  const outdatedThreads = threads.filter((thread) => thread.attachment.status === 'outdated')
  const overlayLayer = (
    <div className="nc-overlays" aria-hidden="true">
      {overlays.map((overlay) => (
        <div key={overlay.threadId}>
          {overlay.rects.map((rect, idx) => (
            <div
              key={idx}
              className={`nc-hl${overlay.resolved ? ' resolved' : ''}`}
              style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
            />
          ))}
          <button
            type="button"
            className="nc-marker"
            style={{ top: overlay.marker.top, left: overlay.marker.left }}
            title="Open comment thread"
            onClick={() => {
              setActiveThreadId(overlay.threadId)
              document
                .getElementById(`thread-${overlay.threadId}`)
                ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }}
          >
            {threadCount(threads, overlay.threadId)}
          </button>
        </div>
      ))}
    </div>
  )

  return (
    <>
      {host ? createPortal(overlayLayer, host) : null}

      {toolbar && pendingAnchor ? (
        <div className="nc-toolbar" style={{ top: toolbar.top, left: toolbar.left }} data-nc-ui>
          <button
            type="button"
            className="nc-btn"
            onClick={() => {
              setToolbar(null)
              setInlineDraft('')
            }}
          >
            Comment
          </button>
        </div>
      ) : null}

      <section className="nc-panel" data-nc-ui>
        <h2 className="nc-title">Comments</h2>
        <form className="nc-identity" onSubmit={saveName}>
          <label>
            Commenting as{' '}
            <input
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              placeholder="Ada Lovelace"
              required
            />
          </label>
          <button type="submit" className="nc-btn secondary">
            Save name
          </button>
          {user ? <span>Signed in as {user.name}</span> : <span>Save a name before commenting.</span>}
        </form>
        {error ? <p className="nc-error">{error}</p> : null}

        {pendingAnchor ? (
          <div className="nc-composer">
            <blockquote className="nc-quote">{pendingAnchor.quote}</blockquote>
            <textarea
              value={inlineDraft}
              onChange={(event) => setInlineDraft(event.target.value)}
              placeholder="Write an inline comment"
            />
            <div className="nc-actions">
              <button
                type="button"
                className="nc-btn"
                onClick={async () => {
                  await submit(inlineDraft, { anchor: pendingAnchor })
                  setInlineDraft('')
                  setPendingAnchor(null)
                }}
              >
                Comment on selection
              </button>
              <button
                type="button"
                className="nc-btn secondary"
                onClick={() => {
                  setPendingAnchor(null)
                  setInlineDraft('')
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        <ThreadSection
          title="On this page"
          threads={pageThreads}
          empty="No page-level comments yet."
          user={user}
          activeThreadId={activeThreadId}
          replyDrafts={replyDrafts}
          setReplyDrafts={setReplyDrafts}
          onReply={(parentId, body) => submit(body, { parentId })}
          onResolve={setResolved}
          onDelete={remove}
        />

        <ThreadSection
          title="Inline"
          threads={inlineThreads}
          empty="Select text in the article, then click Comment."
          user={user}
          activeThreadId={activeThreadId}
          replyDrafts={replyDrafts}
          setReplyDrafts={setReplyDrafts}
          onReply={(parentId, body) => submit(body, { parentId })}
          onResolve={setResolved}
          onDelete={remove}
        />

        <ThreadSection
          title="Outdated"
          threads={outdatedThreads}
          empty="No outdated comments."
          user={user}
          activeThreadId={activeThreadId}
          replyDrafts={replyDrafts}
          setReplyDrafts={setReplyDrafts}
          onReply={(parentId, body) => submit(body, { parentId })}
          onResolve={setResolved}
          onDelete={remove}
        />

        <form
          className="nc-composer nc-section"
          onSubmit={async (event) => {
            event.preventDefault()
            await submit(pageDraft, { anchor: null })
            setPageDraft('')
          }}
        >
          <h3>Add a page comment</h3>
          <textarea
            value={pageDraft}
            onChange={(event) => setPageDraft(event.target.value)}
            placeholder="Comment on the whole page"
            required
          />
          <div className="nc-actions">
            <button type="submit" className="nc-btn">
              Comment
            </button>
          </div>
        </form>
      </section>
    </>
  )
}

function ThreadSection(props: {
  title: string
  empty: string
  threads: LocatedThread[]
  user: User | null
  activeThreadId: string | null
  replyDrafts: Record<string, string>
  setReplyDrafts: (
    value: Record<string, string> | ((current: Record<string, string>) => Record<string, string>)
  ) => void
  onReply: (parentId: string, body: string) => Promise<void>
  onResolve: (id: string, resolved: boolean) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  return (
    <div className="nc-section">
      <h3>{props.title}</h3>
      {props.threads.length === 0 ? <p className="nc-empty">{props.empty}</p> : null}
      {props.threads.map((thread) => (
        <article
          key={thread.root.threadId}
          id={`thread-${thread.root.threadId}`}
          className={`nc-thread${thread.root.resolved ? ' resolved' : ''}${
            props.activeThreadId === thread.root.threadId ? ' active' : ''
          }`}
        >
          {thread.root.anchor ? <blockquote className="nc-quote">{thread.root.anchor.quote}</blockquote> : null}
          {thread.attachment.status === 'outdated' ? (
            <p className="nc-empty">Could not find this quote on the page.</p>
          ) : null}
          {[thread.root, ...thread.replies].map((comment) => (
            <div key={comment.id} className={`nc-comment${comment.parentId ? ' reply' : ''}`}>
              <div className="nc-meta">
                {comment.author.name} · {new Date(comment.createdAt).toLocaleString()}
                {thread.root.resolved && !comment.parentId ? ' · Resolved' : ''}
              </div>
              <div>{comment.body}</div>
              {props.user?.id === comment.author.id ? (
                <div className="nc-actions">
                  <button type="button" className="nc-btn danger" onClick={() => void props.onDelete(comment.id)}>
                    Delete
                  </button>
                </div>
              ) : null}
            </div>
          ))}
          <form
            onSubmit={async (event) => {
              event.preventDefault()
              const body = props.replyDrafts[thread.root.id] ?? ''
              await props.onReply(thread.root.id, body)
              props.setReplyDrafts((current) => ({ ...current, [thread.root.id]: '' }))
            }}
          >
            <textarea
              value={props.replyDrafts[thread.root.id] ?? ''}
              onChange={(event) =>
                props.setReplyDrafts((current) => ({ ...current, [thread.root.id]: event.target.value }))
              }
              placeholder="Reply"
              required
            />
            <div className="nc-actions">
              <button type="submit" className="nc-btn secondary">
                Reply
              </button>
              <button
                type="button"
                className="nc-btn secondary"
                onClick={() => void props.onResolve(thread.root.id, !thread.root.resolved)}
              >
                {thread.root.resolved ? 'Reopen' : 'Resolve'}
              </button>
            </div>
          </form>
        </article>
      ))}
    </div>
  )
}

function locateThreads(comments: CommentDto[], doc: DocumentText | null): LocatedThread[] {
  const roots = comments.filter((comment) => comment.parentId === null)
  return roots.map((root) => {
    const replies = comments
      .filter((comment) => comment.threadId === root.threadId && comment.id !== root.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    if (!root.anchor) {
      return { root, replies, attachment: { status: 'page' as const } }
    }
    if (!doc) {
      return { root, replies, attachment: { status: 'exact' as const, start: 0, end: 0, headingId: null } }
    }
    return { root, replies, attachment: attachAnchor(doc, root.anchor) }
  })
}

function threadCount(threads: LocatedThread[], threadId: string): number {
  const thread = threads.find((item) => item.root.threadId === threadId)
  if (!thread) return 1
  return 1 + thread.replies.length
}

async function hashText(text: string): Promise<string> {
  if (!globalThis.crypto?.subtle) return 'unknown'
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16)
}
