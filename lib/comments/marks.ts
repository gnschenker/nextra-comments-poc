import { indexArticle, rangeFromOffsets, type ArticleIndex } from './index-dom'

export type MarkSpec = {
  threadId: string
  start: number
  end: number
  resolved: boolean
}

export function unwrapMarks(root: Element): void {
  const marks = Array.from(root.querySelectorAll('mark.nc-mark'))
  for (const mark of marks) {
    const parent = mark.parentNode
    if (!parent) continue
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark)
    parent.removeChild(mark)
  }
  root.normalize()
}

export function wrapMarks(root: HTMLElement, _index: ArticleIndex, specs: MarkSpec[]): void {
  const outerFirst = [...specs].sort((a, b) => b.end - b.start - (a.end - a.start))
  for (const spec of outerFirst) {
    const live = indexArticle(root)
    const range = rangeFromOffsets(live, spec.start, spec.end)
    if (!range) continue
    wrapRange(range, spec.threadId, spec.resolved)
  }
}

function wrapRange(range: Range, threadId: string, resolved: boolean): void {
  if (range.startContainer === range.endContainer && range.startContainer.nodeType === Node.TEXT_NODE) {
    const mark = wrapPortion(
      range.startContainer as Text,
      range.startOffset,
      range.endOffset,
      threadId,
      resolved
    )
    if (mark) mark.id = `nc-mark-${threadId}`
    return
  }
  const parts: Array<{ node: Text; start: number; end: number }> = []
  const rootNode: Node = range.commonAncestorContainer
  const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT)
  let node = walker.currentNode as Text | null
  if (rootNode.nodeType !== Node.TEXT_NODE) node = walker.nextNode() as Text | null
  while (node) {
    if (range.intersectsNode(node) && (node.nodeValue ?? '').length > 0) {
      const start = node === range.startContainer ? range.startOffset : 0
      const end = node === range.endContainer ? range.endOffset : node.length
      if (end > start) parts.push({ node, start, end })
    }
    node = walker.nextNode() as Text | null
  }
  if (range.startContainer.nodeType === Node.TEXT_NODE && parts.length === 0) {
    parts.push({
      node: range.startContainer as Text,
      start: range.startOffset,
      end: range.endOffset
    })
  }

  let first: HTMLElement | null = null
  for (let i = parts.length - 1; i >= 0; i--) {
    const mark = wrapPortion(parts[i].node, parts[i].start, parts[i].end, threadId, resolved)
    if (mark) first = mark
  }
  if (first) first.id = `nc-mark-${threadId}`
}

function wrapPortion(
  node: Text,
  start: number,
  end: number,
  threadId: string,
  resolved: boolean
): HTMLElement | null {
  if (end <= start) return null
  const parent = node.parentElement
  if (parent?.matches(`mark.nc-mark[data-thread="${cssEscape(threadId)}"]`)) return parent

  let target = node
  if (start > 0) target = node.splitText(start)
  const length = end - start
  if (length < target.length) target.splitText(length)

  const mark = document.createElement('mark')
  mark.className = 'nc-mark'
  mark.dataset.thread = threadId
  if (resolved) mark.classList.add('is-resolved')
  target.parentNode?.insertBefore(mark, target)
  mark.appendChild(target)
  return mark
}

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value)
  return value.replace(/"/g, '\\"')
}

export function setPendingHighlight(range: Range | null): void {
  const highlights = (
    CSS as typeof CSS & {
      highlights?: { set: (name: string, highlight: unknown) => void; delete: (name: string) => void }
    }
  ).highlights
  if (!highlights) return
  if (!range) {
    highlights.delete('nc-pending')
    return
  }
  const HighlightCtor = (window as unknown as { Highlight?: new (range: Range) => unknown }).Highlight
  if (!HighlightCtor) return
  highlights.set('nc-pending', new HighlightCtor(range))
}
