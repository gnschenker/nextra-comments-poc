'use client'

import { captureAnchor, indexArticle } from '@/lib/comments/index-dom'
import { setPendingHighlight, unwrapMarks, wrapMarks } from '@/lib/comments/marks'
import { isSheetWidth, placePopover, placeSelectionButton } from '@/lib/comments/place'
import { attachAnchor } from '@/lib/comments/reattach'
import type { Anchor, User } from '@/lib/comments/types'
import { usePathname } from 'next/navigation'
import {
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState
} from 'react'
import { createPortal } from 'react-dom'
import './Comments.css'

type ApiComment = {
  id: string
  page: string
  pageVersion: string
  threadId: string
  parentId: string | null
  author: User
  body: string
  createdAt: string
  resolved: boolean
  anchor: Anchor | null
}

type ThreadView = {
  root: ApiComment
  comments: ApiComment[]
  attachment: ReturnType<typeof attachAnchor> | null
}

type ComposeActive = {
  kind: 'compose'
  quote: string
  prefix: string
  suffix: string
  headingId: string | null
  draft: string
  status: 'idle' | 'saving' | 'error'
  confirm: boolean
}

type ThreadActive = {
  kind: 'thread'
  threadId: string
  status: 'loading' | 'ready' | 'error'
  showSk: boolean
  confirmDelete: string | null
  expanded: boolean
  replyStatus: 'idle' | 'saving' | 'error'
  groupIds: string[]
}

type Active = ComposeActive | ThreadActive | null

const PAGE_VERSION = 'v1'
const X_ICON = (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    <path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
)
const ERR_ICON = (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
    <path d="M8 4.5v4.2M8 11v.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
)
const RES_ICON = (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
    <path
      d="m5.3 8.2 1.8 1.8 3.6-3.8"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

function shortcutMod(): string {
  if (typeof navigator === 'undefined') return 'Ctrl'
  return /Mac|iPhone|iPad/i.test(navigator.platform) || /Mac/i.test(navigator.userAgent) ? '⌘' : 'Ctrl'
}

function trunc(value: string, n = 34): string {
  return value.length > n ? `${value.slice(0, n).trimEnd()}…` : value
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

function contentRoot(): HTMLElement | null {
  return document.querySelector('[data-comments-content]')
}

function threadViews(comments: ApiComment[], index: ReturnType<typeof indexArticle> | null): ThreadView[] {
  const byThread = new Map<string, ApiComment[]>()
  for (const comment of comments) {
    const list = byThread.get(comment.threadId) ?? []
    list.push(comment)
    byThread.set(comment.threadId, list)
  }
  const views: ThreadView[] = []
  for (const list of byThread.values()) {
    const sorted = [...list].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    )
    const root = sorted.find((row) => row.parentId === null) ?? sorted[0]
    const attachment =
      root.anchor && index ? attachAnchor(index.doc, root.anchor) : root.anchor ? { status: 'outdated' as const } : null
    views.push({ root, comments: sorted, attachment })
  }
  return views
}

function selectionRange(): Range | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null
  const range = sel.getRangeAt(0)
  const root = contentRoot()
  if (!root || !root.contains(range.commonAncestorContainer)) return null
  if ((range.commonAncestorContainer as HTMLElement).closest?.('[data-nc-ui]')) return null
  return range
}

function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('button:not([disabled]):not([tabindex="-1"]), textarea, [tabindex="0"]')].filter(
    (el) => el.offsetParent !== null || el === document.activeElement
  )
}

export function Comments() {
  const pathname = usePathname() || '/'
  const liveId = useId()
  const popId = 'nc-pop'
  const [user, setUser] = useState<User | null>(null)
  const [nameDraft, setNameDraft] = useState('')
  const [comments, setComments] = useState<ApiComment[]>([])
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState<Active>(null)
  const [sheet, setSheet] = useState(false)
  const [selOpen, setSelOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [live, setLive] = useState('')
  const [pageDraft, setPageDraft] = useState('')
  const [pageBusy, setPageBusy] = useState(false)
  const rangeRef = useRef<Range | null>(null)
  const returnToRef = useRef<HTMLElement | null>(null)
  const popRef = useRef<HTMLDivElement | null>(null)
  const selRef = useRef<HTMLButtonElement | null>(null)
  const replyDrafts = useRef<Record<string, string>>({})
  const applyingRef = useRef(false)
  const focusThreadRef = useRef<string | null>(null)
  const markerMap = useRef<Map<string, HTMLButtonElement>>(new Map())
  const groupMap = useRef<Map<string, string[]>>(new Map())
  const activeRef = useRef<Active>(null)
  const articleIndexRef = useRef<ReturnType<typeof indexArticle> | null>(null)

  activeRef.current = active

  const say = useCallback((message: string) => {
    setLive('')
    requestAnimationFrame(() => setLive(message))
  }, [])

  const loadComments = useCallback(async () => {
    const response = await fetch(`/api/comments?page=${encodeURIComponent(pathname)}`)
    if (!response.ok) throw new Error('Could not load comments')
    const data = (await response.json()) as ApiComment[]
    setComments(data)
    return data
  }, [pathname])

  useEffect(() => {
    setMounted(true)
    let cancelled = false
    void (async () => {
      try {
        const me = await fetch('/api/me')
        const body = (await me.json()) as { user: User | null }
        if (!cancelled) {
          setUser(body.user)
          setNameDraft(body.user?.name ?? '')
        }
        await loadComments()
      } catch {
        if (!cancelled) setError('Could not load comments')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loadComments])

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)')
    const sync = () => setSheet(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  const restoreTargetRef = useRef<HTMLElement | null>(null)
  const closePop = useCallback((restore = true) => {
    const prev = activeRef.current
    restoreTargetRef.current = null
    if (restore && prev) {
      if (prev.kind === 'thread') {
        restoreTargetRef.current = markerMap.current.get(prev.threadId) ?? null
      } else {
        const trigger = returnToRef.current
        restoreTargetRef.current =
          trigger && document.contains(trigger) && !trigger.hidden ? trigger : null
      }
    }
    setPendingHighlight(null)
    setActive(null)
  }, [])

  useEffect(() => {
    if (active) return
    const target = restoreTargetRef.current
    if (!target) return
    const id = window.setTimeout(() => {
      if (document.contains(target) && !target.hidden) target.focus({ preventScroll: true })
      restoreTargetRef.current = null
    }, 0)
    return () => window.clearTimeout(id)
  }, [active])

  const openComposer = useCallback(
    (range: Range, returnTo: HTMLElement | null) => {
      const current = activeRef.current
      if (current?.kind === 'compose' && current.draft.trim() && current !== null) {
        setActive({ ...current, confirm: true })
        return
      }
      const root = contentRoot()
      if (!root) return
      const index = indexArticle(root)
      const anchor = captureAnchor(index, range)
      if (!anchor) return
      const clone = range.cloneRange()
      rangeRef.current = clone
      returnToRef.current = returnTo
      setSelOpen(false)
      setPendingHighlight(clone)
      setActive({
        kind: 'compose',
        quote: anchor.quote,
        prefix: anchor.prefix,
        suffix: anchor.suffix,
        headingId: anchor.headingId,
        draft: '',
        status: 'idle',
        confirm: false
      })
    },
    []
  )

  const openThread = useCallback(
    async (threadId: string, groupIds?: string[]) => {
      const current = activeRef.current
      if (current?.kind === 'compose' && current.draft.trim()) {
        setActive({ ...current, confirm: true })
        return
      }
      if (current?.kind === 'thread' && current.threadId === threadId) {
        closePop()
        return
      }
      const group = groupIds ?? groupMap.current.get(threadId) ?? [threadId]
      setActive({
        kind: 'thread',
        threadId,
        status: 'loading',
        showSk: false,
        confirmDelete: null,
        expanded: false,
        replyStatus: 'idle',
        groupIds: group
      })
      const sk = window.setTimeout(() => {
        setActive((prev) =>
          prev?.kind === 'thread' && prev.threadId === threadId && prev.status === 'loading'
            ? { ...prev, showSk: true }
            : prev
        )
      }, 150)
      try {
        await loadComments()
        setActive((prev) =>
          prev?.kind === 'thread' && prev.threadId === threadId ? { ...prev, status: 'ready' } : prev
        )
      } catch {
        setActive((prev) =>
          prev?.kind === 'thread' && prev.threadId === threadId ? { ...prev, status: 'error' } : prev
        )
      } finally {
        window.clearTimeout(sk)
      }
    },
    [closePop, loadComments]
  )

  const applyMarksAndMarkers = useCallback(() => {
    const root = contentRoot()
    if (!root) return
    applyingRef.current = true
    unwrapMarks(root)
    for (const button of markerMap.current.values()) button.remove()
    markerMap.current.clear()
    groupMap.current.clear()

    const index = indexArticle(root)
    articleIndexRef.current = index
    const views = threadViews(comments, index)
    const specs = views
      .filter((view) => view.root.anchor && view.attachment && view.attachment.status !== 'outdated')
      .map((view) => ({
        threadId: view.root.threadId,
        start: view.attachment && view.attachment.status !== 'outdated' ? view.attachment.start : 0,
        end: view.attachment && view.attachment.status !== 'outdated' ? view.attachment.end : 0,
        resolved: view.root.resolved
      }))
    wrapMarks(root, index, specs)

    const inline = views.filter(
      (view) => view.root.anchor && view.attachment && view.attachment.status !== 'outdated'
    )
    const models: Array<{
      ids: string[]
      counts: number[]
      resolved: boolean
      quote: string
      top: number
      mark: HTMLElement
    }> = []
    const hostBox = root.getBoundingClientRect()
    const lineBuckets = new Map<number, typeof inline>()
    for (const view of inline) {
      const mark = root.querySelector<HTMLElement>(`#nc-mark-${view.root.threadId}, mark.nc-mark[data-thread="${view.root.threadId}"]`)
      if (!mark) continue
      const rect = mark.getClientRects()[0] ?? mark.getBoundingClientRect()
      const bucket = Math.round((rect.top - hostBox.top) / Math.max(rect.height, 20))
      const list = lineBuckets.get(bucket) ?? []
      list.push(view)
      lineBuckets.set(bucket, list)
    }
    for (const group of lineBuckets.values()) {
      const openFirst = [...group].sort((a, b) => Number(a.root.resolved) - Number(b.root.resolved))
      const firstMark =
        root.querySelector<HTMLElement>(`#nc-mark-${openFirst[0].root.threadId}`) ??
        root.querySelector<HTMLElement>(`mark.nc-mark[data-thread="${openFirst[0].root.threadId}"]`)
      if (!firstMark) continue
      const rect = firstMark.getClientRects()[0] ?? firstMark.getBoundingClientRect()
      models.push({
        ids: openFirst.map((view) => view.root.threadId),
        counts: openFirst.map((view) => view.comments.length),
        resolved: openFirst.every((view) => view.root.resolved),
        quote: openFirst[0].root.anchor?.quote ?? '',
        top: rect.top - hostBox.top + (rect.height - 20) / 2,
        mark: firstMark
      })
      for (const id of openFirst.map((view) => view.root.threadId)) {
        groupMap.current.set(id, openFirst.map((view) => view.root.threadId))
      }
    }
    models.sort((a, b) => a.top - b.top)
    let lastTop = -1e9
    for (const model of models) {
      let top = model.top
      if (top - lastTop < 24) top = lastTop + 24
      lastTop = top
      const button = document.createElement('button')
      button.type = 'button'
      button.className = `nc-marker${model.resolved ? ' is-resolved' : ''}`
      button.dataset.ncUi = ''
      button.dataset.thread = model.ids[0]
      button.setAttribute('aria-controls', popId)
      const openId = activeRef.current?.kind === 'thread' ? activeRef.current.threadId : null
      button.setAttribute('aria-expanded', String(Boolean(openId && model.ids.includes(openId))))
      const n = model.counts.reduce((sum, count) => sum + count, 0)
      if (model.ids.length === 1) {
        button.replaceChildren(model.resolved ? checkNode() : document.createTextNode(String(n)))
        button.setAttribute(
          'aria-label',
          `${model.resolved ? 'Resolved thread, ' : ''}${n} comment${n === 1 ? '' : 's'} on ‘${trunc(model.quote)}’`
        )
      } else {
        const shown = model.counts.slice(0, 2).join('·')
        const extra = model.counts.length > 2 ? `+${model.counts.length - 2}` : ''
        button.textContent = `${shown}${extra}`
        button.setAttribute('aria-label', `${model.ids.length} threads on this line`)
      }
      button.style.top = `${top}px`
      button.style.left = `${Math.max(0, root.clientWidth - 22)}px`
      button.addEventListener('click', () => {
        void openThread(model.ids[0], model.ids)
      })
      button.addEventListener('focus', () => model.mark.classList.add('is-focus'))
      button.addEventListener('blur', () => model.mark.classList.remove('is-focus'))
      button.addEventListener('mouseenter', () => model.mark.classList.add('is-hover'))
      button.addEventListener('mouseleave', () => model.mark.classList.remove('is-hover'))
      const block = model.mark.closest('p, li, h1, h2, h3, h4, blockquote') ?? model.mark.parentElement
      block?.after(button)
      for (const id of model.ids) markerMap.current.set(id, button)
    }
    applyingRef.current = false
    const pending = focusThreadRef.current
    if (pending) {
      focusThreadRef.current = null
      markerMap.current.get(pending)?.focus({ preventScroll: true })
    }
  }, [comments, openThread])

  useEffect(() => {
    applyMarksAndMarkers()
    const root = contentRoot()
    if (!root) return
    const mo = new MutationObserver(() => {
      if (applyingRef.current) return
      const hasMarks = root.querySelector('mark.nc-mark')
      if (!hasMarks && comments.some((row) => row.anchor)) applyMarksAndMarkers()
    })
    mo.observe(root, { childList: true, subtree: true })
    return () => {
      mo.disconnect()
      unwrapMarks(root)
      for (const button of markerMap.current.values()) button.remove()
      markerMap.current.clear()
    }
  }, [applyMarksAndMarkers, comments, pathname])

  const layoutExistingMarkers = useCallback(() => {
    const root = contentRoot()
    if (!root) return
    const hostBox = root.getBoundingClientRect()
    const seen = new Set<HTMLButtonElement>()
    let lastTop = -1e9
    const buttons = [...new Set(markerMap.current.values())]
    buttons.sort((a, b) => {
      const markA = root.querySelector<HTMLElement>(`mark.nc-mark[data-thread="${a.dataset.thread}"]`)
      const markB = root.querySelector<HTMLElement>(`mark.nc-mark[data-thread="${b.dataset.thread}"]`)
      return (markA?.getBoundingClientRect().top ?? 0) - (markB?.getBoundingClientRect().top ?? 0)
    })
    for (const button of buttons) {
      if (seen.has(button)) continue
      seen.add(button)
      const mark = root.querySelector<HTMLElement>(`mark.nc-mark[data-thread="${button.dataset.thread}"]`)
      const rect = mark?.getClientRects()[0]
      if (!rect) continue
      let top = rect.top - hostBox.top + (rect.height - 20) / 2
      if (top - lastTop < 24) top = lastTop + 24
      lastTop = top
      button.style.top = `${top}px`
      button.style.left = `${Math.max(0, root.clientWidth - 22)}px`
    }
  }, [])

  const placeAll = useCallback(() => {
    layoutExistingMarkers()
    const pop = popRef.current
    const current = activeRef.current
    const root = contentRoot()
    if (selOpen && selRef.current && rangeRef.current) {
      placeSelectionButton(selRef.current, [...rangeRef.current.getClientRects()])
    } else if (selOpen && selRef.current) {
      const liveRange = selectionRange()
      if (liveRange) placeSelectionButton(selRef.current, [...liveRange.getClientRects()])
    }
    if (!pop || !current || !root) return
    if (isSheetWidth()) {
      pop.dataset.mode = 'sheet'
      pop.style.left = ''
      pop.style.top = ''
      pop.style.width = ''
      pop.style.maxHeight = ''
      return
    }
    let rects: DOMRect[] = []
    if (current.kind === 'compose' && rangeRef.current) {
      rects = [...rangeRef.current.getClientRects()].filter((rect) => rect.width > 0)
    } else if (current.kind === 'thread') {
      const mark = root.querySelector<HTMLElement>(`mark.nc-mark[data-thread="${current.threadId}"]`)
      rects = mark ? [...mark.getClientRects()] : []
    }
    if (rects.length === 0) return
    placePopover({ pop, kind: current.kind, rects, column: root.getBoundingClientRect() })
  }, [layoutExistingMarkers, selOpen])

  useEffect(() => {
    let raf = 0
    const schedule = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        placeAll()
      })
    }
    window.addEventListener('scroll', schedule, { capture: true, passive: true })
    window.addEventListener('resize', schedule)
    const vv = window.visualViewport
    const onVV = () => {
      const pop = popRef.current
      if (!pop || !isSheetWidth()) return
      if (!vv) return
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      pop.style.paddingBottom = inset ? `${inset}px` : ''
    }
    vv?.addEventListener('resize', onVV)
    document.fonts?.ready.then(schedule)
    const root = contentRoot()
    const pop = popRef.current
    const ro = new ResizeObserver(schedule)
    if (root) ro.observe(root)
    if (pop) ro.observe(pop)
    schedule()
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', schedule, true)
      window.removeEventListener('resize', schedule)
      vv?.removeEventListener('resize', onVV)
      ro.disconnect()
    }
  }, [active, applyMarksAndMarkers, placeAll])

  useEffect(() => {
    const showFromSelection = () => {
      if (activeRef.current) return
      const range = selectionRange()
      if (!range) {
        setSelOpen(false)
        return
      }
      rangeRef.current = range.cloneRange()
      setSelOpen(true)
      say(`${shortcutMod()}+Alt+M comments on the selection`)
    }
    const onMouseUp = () => window.setTimeout(showFromSelection, 0)
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.shiftKey && event.key.startsWith('Arrow')) showFromSelection()
    }
    const onTouchEnd = () => window.setTimeout(showFromSelection, 0)
    const onSelChange = () => {
      if (activeRef.current?.kind === 'compose') return
      const range = selectionRange()
      if (!range) setSelOpen(false)
    }
    document.addEventListener('mouseup', onMouseUp)
    document.addEventListener('keyup', onKeyUp)
    document.addEventListener('touchend', onTouchEnd)
    document.addEventListener('selectionchange', onSelChange)
    return () => {
      document.removeEventListener('mouseup', onMouseUp)
      document.removeEventListener('keyup', onKeyUp)
      document.removeEventListener('touchend', onTouchEnd)
      document.removeEventListener('selectionchange', onSelChange)
    }
  }, [say])

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      const mark = target?.closest('mark.nc-mark')
      if (!mark || target?.closest('[data-nc-ui]')) return
      const id = (mark as HTMLElement).dataset.thread
      if (id) {
        event.preventDefault()
        void openThread(id, groupMap.current.get(id))
      }
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [openThread])

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const current = activeRef.current
      if (!current) return
      const target = event.target as HTMLElement | null
      if (!target) return
      if (target.closest('.nc-pop, .nc-marker, .nc-mark, .nc-selbtn')) return
      if (current.kind === 'compose' && current.draft.trim() && current.status !== 'saving') {
        setActive({ ...current, confirm: true })
        return
      }
      closePop()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        const current = activeRef.current
        if (current?.kind === 'compose' && current.confirm) {
          event.preventDefault()
          setActive({ ...current, confirm: false })
          return
        }
        if (current?.kind === 'thread' && current.confirmDelete) {
          event.preventDefault()
          setActive({ ...current, confirmDelete: null })
          return
        }
        if (current) {
          event.preventDefault()
          closePop()
          return
        }
        if (selOpen) setSelOpen(false)
      }
      if ((event.ctrlKey || event.metaKey) && event.altKey && event.code === 'KeyM') {
        const range = selectionRange() ?? rangeRef.current
        if (!range) return
        event.preventDefault()
        openComposer(range, selRef.current)
      }
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [closePop, openComposer, selOpen])

  useEffect(() => {
    const root = contentRoot()
    if (!root) return
    root.querySelectorAll('mark.nc-mark').forEach((mark) => {
      const on = active?.kind === 'thread' && (mark as HTMLElement).dataset.thread === active.threadId
      mark.classList.toggle('is-active', on)
    })
    for (const [id, button] of markerMap.current) {
      const group = groupMap.current.get(id) ?? [id]
      const expanded = active?.kind === 'thread' && group.includes(active.threadId)
      button.setAttribute('aria-expanded', String(expanded))
    }
  }, [active])

  useEffect(() => {
    const pop = popRef.current
    if (!pop || !active) return
    const modal = sheet
    if (modal) pop.setAttribute('aria-modal', 'true')
    else pop.removeAttribute('aria-modal')
    const regions = document.querySelectorAll<HTMLElement>('body > *')
    regions.forEach((el) => {
      if (el === pop || el.classList.contains('nc-backdrop')) return
      if (modal) el.setAttribute('inert', '')
      else el.removeAttribute('inert')
    })
    const focusFirst = () => {
      const node =
        pop.querySelector<HTMLElement>('[data-autofocus]') ||
        pop.querySelector<HTMLElement>('textarea:not([readonly])') ||
        pop.querySelector<HTMLElement>('button:not([disabled])')
      node?.focus({ preventScroll: true })
    }
    requestAnimationFrame(focusFirst)
    return () => {
      regions.forEach((el) => el.removeAttribute('inert'))
    }
  }, [active, sheet])

  async function saveIdentity(event: FormEvent) {
    event.preventDefault()
    const response = await fetch('/api/me', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: nameDraft })
    })
    if (!response.ok) {
      setError('Could not save your name')
      return
    }
    const body = (await response.json()) as { user: User }
    setUser(body.user)
  }

  async function saveComposer() {
    const current = activeRef.current
    if (!current || current.kind !== 'compose' || current.status === 'saving' || !current.draft.trim()) return
    if (!user) {
      setError('Pick a display name first')
      return
    }
    setActive({ ...current, status: 'saving' })
    say('Saving comment')
    try {
      const response = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          page: pathname,
          pageVersion: PAGE_VERSION,
          body: current.draft.trim(),
          anchor: {
            quote: current.quote,
            prefix: current.prefix,
            suffix: current.suffix,
            headingId: current.headingId
          }
        })
      })
      if (!response.ok) throw new Error('save failed')
      const created = (await response.json()) as ApiComment
      focusThreadRef.current = created.threadId
      setPendingHighlight(null)
      setActive(null)
      await loadComments()
      say('Comment saved')
    } catch {
      setActive((prev) => (prev?.kind === 'compose' ? { ...prev, status: 'error' } : prev))
    }
  }

  async function postReply() {
    const current = activeRef.current
    if (!current || current.kind !== 'thread' || current.status !== 'ready') return
    const text = (replyDrafts.current[current.threadId] ?? '').trim()
    if (!text || current.replyStatus === 'saving') return
    const view = threadViews(comments, articleIndexRef.current).find((row) => row.root.threadId === current.threadId)
    if (!view || view.root.resolved) return
    setActive({ ...current, replyStatus: 'saving' })
    say('Posting reply')
    try {
      const response = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          page: pathname,
          pageVersion: PAGE_VERSION,
          parentId: view.root.id,
          body: text
        })
      })
      if (!response.ok) throw new Error('reply failed')
      replyDrafts.current[current.threadId] = ''
      await loadComments()
      setActive((prev) =>
        prev?.kind === 'thread' ? { ...prev, replyStatus: 'idle', status: 'ready' } : prev
      )
      say('Reply posted')
    } catch {
      setActive((prev) => (prev?.kind === 'thread' ? { ...prev, replyStatus: 'error' } : prev))
    }
  }

  async function setResolved(threadId: string, resolved: boolean) {
    const view = threadViews(comments, articleIndexRef.current).find((row) => row.root.threadId === threadId)
    if (!view) return
    const response = await fetch(`/api/comments/${view.root.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ resolved })
    })
    if (!response.ok) return
    await loadComments()
    setActive((prev) =>
      prev?.kind === 'thread' ? { ...prev, expanded: false, confirmDelete: null } : prev
    )
    say(resolved ? 'Thread resolved' : 'Thread reopened')
  }

  async function deleteComment(id: string) {
    const current = activeRef.current
    const target = comments.find((row) => row.id === id)
    const response = await fetch(`/api/comments/${id}`, { method: 'DELETE' })
    if (!response.ok) return
    if (target && target.parentId === null) {
      closePop(false)
      await loadComments()
      say('Thread deleted')
      contentRoot()?.querySelector('h1')?.setAttribute('tabindex', '-1')
      contentRoot()?.querySelector<HTMLElement>('h1')?.focus()
      return
    }
    await loadComments()
    if (current?.kind === 'thread') setActive({ ...current, confirmDelete: null })
    say('Comment deleted')
  }

  async function savePageComment(event: FormEvent) {
    event.preventDefault()
    if (!user || !pageDraft.trim()) return
    setPageBusy(true)
    try {
      const response = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ page: pathname, pageVersion: PAGE_VERSION, body: pageDraft.trim() })
      })
      if (!response.ok) throw new Error('failed')
      setPageDraft('')
      await loadComments()
      say('Comment saved')
    } catch {
      setError('Could not save your comment')
    } finally {
      setPageBusy(false)
    }
  }

  function onPopKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && (event.target as HTMLElement).tagName === 'TEXTAREA') {
      event.preventDefault()
      if (active?.kind === 'compose') void saveComposer()
      else void postReply()
    }
    if (event.key === 'Tab' && sheet && popRef.current) {
      const items = focusables(popRef.current)
      if (items.length === 0) return
      const index = items.indexOf(document.activeElement as HTMLElement)
      if (event.shiftKey && index <= 0) {
        event.preventDefault()
        items[items.length - 1].focus()
      } else if (!event.shiftKey && index === items.length - 1) {
        event.preventDefault()
        items[0].focus()
      }
    }
  }

  const index = articleIndexRef.current
  const views = threadViews(comments, index)
  const pageThreads = views.filter((view) => !view.root.anchor)
  const inlineThreads = views.filter(
    (view) => view.root.anchor && view.attachment && view.attachment.status !== 'outdated'
  )
  const outdatedThreads = views.filter(
    (view) => view.root.anchor && (!view.attachment || view.attachment.status === 'outdated')
  )
  const activeThread =
    active?.kind === 'thread' ? views.find((view) => view.root.threadId === active.threadId) : undefined
  const mod = shortcutMod()

  const pop =
    mounted &&
    createPortal(
      <div
        ref={popRef}
        id={popId}
        className="nc-pop"
        role="dialog"
        hidden={!active}
        data-mode={sheet ? 'sheet' : undefined}
        aria-labelledby={active?.kind === 'compose' ? 'nc-pop-title' : undefined}
        aria-label={
          active?.kind === 'thread' && activeThread
            ? `Comment thread on ‘${trunc(activeThread.root.anchor?.quote ?? 'this page')}’`
            : undefined
        }
        onKeyDown={onPopKeyDown}
        data-nc-ui=""
      >
        {active ? (
          <>
            <button className="nc-handle" type="button" aria-label="Drag down to close" tabIndex={-1} />
            <div className="nc-pop__head">
              <h2 className="nc-pop__title" id="nc-pop-title">
                {active.kind === 'compose' ? (
                  'New comment'
                ) : active.status === 'ready' && activeThread?.root.resolved ? (
                  <>
                    Resolved <span>· {activeThread.comments.length}</span>
                  </>
                ) : active.status === 'ready' && activeThread ? (
                  `${activeThread.comments.length} comment${activeThread.comments.length === 1 ? '' : 's'}`
                ) : (
                  'Thread'
                )}
              </h2>
              {active.kind === 'thread' && active.groupIds.length > 1 ? (
                <span className="nc-switcher">
                  {active.groupIds.indexOf(active.threadId) + 1} of {active.groupIds.length} here
                  <button
                    className="nc-btn nc-btn--ghost"
                    type="button"
                    aria-label="Previous thread on this line"
                    onClick={() => {
                      const i = active.groupIds.indexOf(active.threadId)
                      const next = active.groupIds[(i - 1 + active.groupIds.length) % active.groupIds.length]
                      void openThread(next, active.groupIds)
                    }}
                  >
                    ‹
                  </button>
                  <button
                    className="nc-btn nc-btn--ghost"
                    type="button"
                    aria-label="Next thread on this line"
                    onClick={() => {
                      const i = active.groupIds.indexOf(active.threadId)
                      const next = active.groupIds[(i + 1) % active.groupIds.length]
                      void openThread(next, active.groupIds)
                    }}
                  >
                    ›
                  </button>
                </span>
              ) : null}
              {active.kind === 'thread' &&
              active.status !== 'error' &&
              user &&
              activeThread &&
              user.id === activeThread.root.author.id ? (
                <button
                  className="nc-btn nc-btn--secondary"
                  type="button"
                  disabled={active.status === 'loading'}
                  onClick={() => {
                    void setResolved(active.threadId, !activeThread.root.resolved)
                  }}
                >
                  {activeThread.root.resolved ? 'Reopen' : 'Resolve'}
                </button>
              ) : null}
              <button
                className="nc-btn nc-btn--ghost nc-icon-btn"
                type="button"
                aria-label="Close"
                onClick={() => {
                  if (active.kind === 'compose' && active.draft.trim() && active.status !== 'saving') {
                    setActive({ ...active, confirm: true })
                  } else closePop()
                }}
              >
                {X_ICON}
              </button>
            </div>
            {active.kind === 'compose' ? (
              <ComposerBody
                active={active}
                setDraft={(draft) => setActive({ ...active, draft, confirm: false })}
                onSave={() => void saveComposer()}
                onCancel={() => closePop()}
                onKeep={() => setActive({ ...active, confirm: false })}
                mod={mod}
              />
            ) : (
              <ThreadBody
                active={active}
                view={activeThread}
                user={user}
                reply={replyDrafts.current[active.threadId] ?? ''}
                onReplyChange={(value) => {
                  replyDrafts.current[active.threadId] = value
                  setActive({ ...active })
                }}
                onReply={() => void postReply()}
                onRetry={() => void openThread(active.threadId, active.groupIds)}
                onExpand={() => setActive({ ...active, expanded: true })}
                onAskDelete={(id) => setActive({ ...active, confirmDelete: id })}
                onKeepDelete={() => setActive({ ...active, confirmDelete: null })}
                onDelete={(id) => void deleteComment(id)}
                mod={mod}
              />
            )}
          </>
        ) : null}
      </div>,
      document.body
    )

  const backdrop =
    mounted &&
    createPortal(
      <div
        className="nc-backdrop"
        hidden={!active || !sheet}
        data-nc-ui=""
        onClick={() => {
          const current = activeRef.current
          if (current?.kind === 'compose' && current.draft.trim() && current.status !== 'saving') {
            setActive({ ...current, confirm: true })
            return
          }
          closePop()
        }}
      />,
      document.body
    )

  const selBtn =
    mounted &&
    createPortal(
      <button
        ref={selRef}
        type="button"
        className="nc-btn nc-btn--primary nc-selbtn"
        data-testid="nc-selbtn"
        hidden={!selOpen || Boolean(active)}
        title={`Comment (${mod}+Alt+M)`}
        aria-keyshortcuts="Control+Alt+M Meta+Alt+M"
        onClick={() => {
          const range = rangeRef.current ?? selectionRange()
          if (range) openComposer(range, selRef.current)
        }}
      >
        Comment
      </button>,
      document.body
    )

  return (
    <div className="nc-root" data-nc-ui="">
      {selBtn}
      {backdrop}
      {pop}
      <div id={liveId} className="nc-live" aria-live="polite">
        {live}
      </div>
      <section className="nc-panel" aria-labelledby="nc-panel-title">
        <h2 className="nc-title" id="nc-panel-title">
          Comments
        </h2>
        <form className="nc-identity" onSubmit={saveIdentity}>
          <label>
            Display name{' '}
            <input value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} required />
          </label>
          <button className="nc-btn nc-btn--secondary" type="submit">
            Use this name
          </button>
          {user ? <span>Signed in as {user.name}</span> : <span>Pick a name to comment.</span>}
        </form>
        {error ? (
          <p className="nc-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="nc-section">
          <h3>Page</h3>
          <form onSubmit={savePageComment}>
            <textarea
              className="nc-field"
              placeholder="Comment on this page"
              aria-label="Page comment"
              value={pageDraft}
              onChange={(event) => setPageDraft(event.target.value)}
            />
            <div className="nc-row">
              <button className="nc-btn nc-btn--primary" type="submit" disabled={pageBusy || !pageDraft.trim() || !user}>
                Save
              </button>
            </div>
          </form>
          {pageThreads.length === 0 ? <p className="nc-empty">No page-level comments yet.</p> : null}
          {pageThreads.map((view) => (
            <IndexCard key={view.root.threadId} view={view} />
          ))}
        </div>

        <div className="nc-section">
          <h3>Inline</h3>
          {inlineThreads.length === 0 ? <p className="nc-empty">No inline comments on this page.</p> : null}
          {inlineThreads.map((view) => (
            <IndexCard
              key={view.root.threadId}
              view={view}
              onShow={() => {
                document.getElementById(`nc-mark-${view.root.threadId}`)?.scrollIntoView({ block: 'center' })
                void openThread(view.root.threadId)
              }}
            />
          ))}
        </div>

        <div className="nc-section">
          <h3>Outdated</h3>
          {outdatedThreads.length === 0 ? <p className="nc-empty">No outdated threads.</p> : null}
          {outdatedThreads.map((view) => (
            <IndexCard key={view.root.threadId} view={view} outdated />
          ))}
        </div>
      </section>
    </div>
  )
}

function checkNode(): Node {
  const wrap = document.createElement('span')
  wrap.innerHTML =
    '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="m2 5.2 2 2 4-4.4" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  return wrap.firstChild ?? wrap
}

function ComposerBody({
  active,
  setDraft,
  onSave,
  onCancel,
  onKeep,
  mod
}: {
  active: ComposeActive
  setDraft: (value: string) => void
  onSave: () => void
  onCancel: () => void
  onKeep: () => void
  mod: string
}) {
  const saving = active.status === 'saving'
  const err = active.status === 'error'
  return (
    <>
      <blockquote className="nc-quote">{active.quote}</blockquote>
      <div className="nc-pop__foot nc-pop__foot--plain">
        <textarea
          className="nc-field"
          placeholder="Add a comment…"
          aria-label="Comment"
          readOnly={saving}
          aria-invalid={err || undefined}
          aria-describedby={err ? 'nc-err' : undefined}
          value={active.draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        {err ? (
          <p className="nc-error" id="nc-err" role="alert">
            {ERR_ICON}
            <span>Couldn&apos;t save your comment. Check your connection and try again.</span>
          </p>
        ) : null}
        {active.confirm ? (
          <div className="nc-confirm" role="alertdialog" aria-labelledby="nc-cf">
            <p id="nc-cf">Discard this comment?</p>
            <div className="nc-row">
              <button className="nc-btn nc-btn--ghost" type="button" data-autofocus onClick={onKeep}>
                Keep editing
              </button>
              <button className="nc-btn nc-btn--secondary" type="button" style={{ color: 'var(--nc-danger)' }} onClick={onCancel}>
                Discard
              </button>
            </div>
          </div>
        ) : (
          <div className="nc-row">
            <span className="nc-hintkey">{saving ? 'Saving…' : `${mod}+Enter to save`}</span>
            <button className="nc-btn nc-btn--ghost" type="button" disabled={saving} onClick={onCancel}>
              Cancel
            </button>
            <button
              className={`nc-btn nc-btn--primary${saving ? ' nc-btn--busy' : ''}`}
              type="button"
              disabled={saving || !active.draft.trim()}
              onClick={onSave}
            >
              {saving ? (
                <>
                  <span className="nc-spinner" aria-hidden="true" />
                  Saving
                </>
              ) : err ? (
                'Retry'
              ) : (
                'Save'
              )}
            </button>
          </div>
        )}
      </div>
    </>
  )
}

function ThreadBody({
  active,
  view,
  user,
  reply,
  onReplyChange,
  onReply,
  onRetry,
  onExpand,
  onAskDelete,
  onKeepDelete,
  onDelete,
  mod
}: {
  active: ThreadActive
  view?: ThreadView
  user: User | null
  reply: string
  onReplyChange: (value: string) => void
  onReply: () => void
  onRetry: () => void
  onExpand: () => void
  onAskDelete: (id: string) => void
  onKeepDelete: () => void
  onDelete: (id: string) => void
  mod: string
}) {
  const quote = view?.root.anchor?.quote ?? ''
  return (
    <>
      <blockquote className="nc-quote">{quote}</blockquote>
      {active.status === 'loading' ? (
        <div className="nc-pop__body" style={{ paddingBlock: 12 }}>
          {active.showSk ? (
            <>
              <div className="nc-sk" style={{ width: '40%' }} />
              <div className="nc-sk" style={{ width: '92%' }} />
              <div className="nc-sk" style={{ width: '70%' }} />
            </>
          ) : null}
        </div>
      ) : active.status === 'error' ? (
        <div className="nc-pop__body" style={{ paddingBlock: 12 }}>
          <p className="nc-error" role="alert" style={{ margin: 0 }}>
            {ERR_ICON}
            <span>Couldn&apos;t load this thread.</span>
          </p>
          <div className="nc-row" style={{ marginBottom: 8 }}>
            <button className="nc-btn nc-btn--secondary" type="button" data-autofocus onClick={onRetry}>
              Try again
            </button>
          </div>
        </div>
      ) : view?.root.resolved && !active.expanded ? (
        <div className="nc-resolved-bar">
          {RES_ICON}
          <span style={{ flex: 1, minWidth: 0 }}>
            {view.comments[0]?.author.name}: “{view.comments[0]?.body}”
          </span>
          <button className="nc-btn nc-btn--ghost" type="button" data-autofocus aria-expanded="false" onClick={onExpand}>
            Show {view.comments.length}
          </button>
        </div>
      ) : view ? (
        <div className="nc-pop__body" tabIndex={0} aria-label="Comments">
          <ol className="nc-list">
            {view.comments.map((comment, index) => {
              const own = user?.id === comment.author.id
              const confirming = active.confirmDelete === comment.id
              const replies = index === 0 ? view.comments.length - 1 : 0
              const confirmCopy = replies
                ? `Delete this comment and its ${replies} repl${replies === 1 ? 'y' : 'ies'}? This removes the whole thread.`
                : "Delete your comment? This can't be undone."
              return (
                <li className="nc-c" key={comment.id}>
                  <div className="nc-c__meta">
                    <span className="nc-c__author">{comment.author.name}</span>
                    <time className="nc-c__time" dateTime={comment.createdAt}>
                      {fmtDate(comment.createdAt)}
                    </time>
                    {own && !confirming && !view.root.resolved ? (
                      <button
                        className="nc-btn nc-btn--danger"
                        type="button"
                        aria-label={`Delete your comment from ${fmtDate(comment.createdAt)}`}
                        onClick={() => onAskDelete(comment.id)}
                      >
                        Delete
                      </button>
                    ) : null}
                  </div>
                  <p className="nc-c__body">{comment.body}</p>
                  {confirming ? (
                    <div className="nc-confirm" role="alertdialog" aria-labelledby="nc-dc">
                      <p id="nc-dc">{confirmCopy}</p>
                      <div className="nc-row">
                        <button className="nc-btn nc-btn--ghost" type="button" data-autofocus onClick={onKeepDelete}>
                          Keep
                        </button>
                        <button className="nc-btn nc-btn--danger-solid" type="button" onClick={() => onDelete(comment.id)}>
                          Delete
                        </button>
                      </div>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ol>
        </div>
      ) : null}
      {active.status !== 'error' && view && !view.root.resolved ? (
        <form
          className="nc-pop__foot nc-reply"
          onSubmit={(event) => {
            event.preventDefault()
            onReply()
          }}
        >
          <textarea
            className="nc-field"
            placeholder="Reply…"
            aria-label="Reply"
            readOnly={active.replyStatus === 'saving'}
            value={reply}
            onChange={(event) => onReplyChange(event.target.value)}
          />
          {active.replyStatus === 'error' ? (
            <p className="nc-error" role="alert">
              {ERR_ICON}
              <span>Couldn&apos;t post your reply. Try again.</span>
            </p>
          ) : null}
          <div className="nc-row">
            <span className="nc-hintkey">
              {active.replyStatus === 'saving' ? 'Posting…' : active.status === 'ready' ? `${mod}+Enter to reply` : ''}
            </span>
            <button
              className={`nc-btn nc-btn--primary${active.replyStatus === 'saving' ? ' nc-btn--busy' : ''}`}
              type="submit"
              disabled={active.replyStatus === 'saving' || !reply.trim() || active.status !== 'ready'}
            >
              {active.replyStatus === 'saving' ? (
                <>
                  <span className="nc-spinner" aria-hidden="true" />
                  Posting
                </>
              ) : active.replyStatus === 'error' ? (
                'Retry'
              ) : (
                'Reply'
              )}
            </button>
          </div>
        </form>
      ) : null}
    </>
  )
}

function IndexCard({
  view,
  onShow,
  outdated
}: {
  view: ThreadView
  onShow?: () => void
  outdated?: boolean
}) {
  return (
    <article className={`nc-thread${view.root.resolved ? ' is-resolved' : ''}`}>
      {view.root.anchor ? <p className="nc-index-quote">“{view.root.anchor.quote}”</p> : null}
      <p>
        <strong>{view.root.author.name}</strong> · {fmtDate(view.root.createdAt)}
        {view.root.resolved ? ' · Resolved' : ''}
        {outdated ? ' · Outdated' : ''}
      </p>
      <p>{view.root.body}</p>
      {view.comments.length > 1 ? <p className="nc-empty">{view.comments.length - 1} replies</p> : null}
      {onShow ? (
        <button className="nc-btn nc-btn--secondary" type="button" onClick={onShow}>
          Show on page
        </button>
      ) : null}
    </article>
  )
}
