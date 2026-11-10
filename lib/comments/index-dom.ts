import type { Anchor, DocumentText } from './types'

export type TextSpan = {
  node: Text
  start: number
  end: number
}

export type ArticleIndex = {
  doc: DocumentText
  spans: TextSpan[]
}

const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT'])

export function indexArticle(root: Element): ArticleIndex {
  const spans: TextSpan[] = []
  const headingRanges: DocumentText['headingRanges'] = []
  let text = ''
  let currentHeading: { id: string; start: number } | null = null

  const closeHeading = (end: number) => {
    if (currentHeading) {
      headingRanges.push({ id: currentHeading.id, start: currentHeading.start, end })
    }
  }

  const walk = (node: Node) => {
    if (node instanceof HTMLElement) {
      if (SKIP.has(node.tagName) || node.dataset.ncUi !== undefined) return
      if (/^H[1-6]$/.test(node.tagName) && node.id) {
        closeHeading(text.length)
        currentHeading = { id: node.id, start: text.length }
      }
    }
    if (node.nodeType === Node.TEXT_NODE) {
      const value = node.nodeValue ?? ''
      if (value.length > 0) {
        spans.push({ node: node as Text, start: text.length, end: text.length + value.length })
        text += value
      }
      return
    }
    for (const child of Array.from(node.childNodes)) walk(child)
  }

  walk(root)
  closeHeading(text.length)
  return { doc: { text, headingRanges }, spans }
}

export function captureAnchor(index: ArticleIndex, range: Range, contextChars = 40): Anchor | null {
  const located = offsetsForRange(index, range)
  if (!located) return null
  const quote = index.doc.text.slice(located.start, located.end)
  if (!quote.trim()) return null
  const prefix = index.doc.text.slice(Math.max(0, located.start - contextChars), located.start)
  const suffix = index.doc.text.slice(located.end, located.end + contextChars)
  const heading = headingIdAt(index.doc, located.start)
  return { quote, prefix, suffix, headingId: heading }
}

export function headingIdAt(doc: DocumentText, offset: number): string | null {
  for (const range of doc.headingRanges) {
    if (range.start <= offset && offset < range.end) return range.id
  }
  return null
}

export function rangeFromOffsets(index: ArticleIndex, start: number, end: number): Range | null {
  const startHit = spanAt(index.spans, start)
  const endHit = spanAt(index.spans, Math.max(start, end - 1))
  if (!startHit || !endHit) return null
  const range = document.createRange()
  range.setStart(startHit.span.node, start - startHit.span.start)
  range.setEnd(endHit.span.node, end - endHit.span.start)
  return range
}

function spanAt(spans: TextSpan[], offset: number): { span: TextSpan } | null {
  for (const span of spans) {
    if (offset >= span.start && offset < span.end) return { span }
    if (offset === span.end && span === spans[spans.length - 1]) return { span }
  }
  return null
}

function offsetsForRange(index: ArticleIndex, range: Range): { start: number; end: number } | null {
  const startOffset = nodeOffset(index.spans, range.startContainer, range.startOffset)
  const endOffset = nodeOffset(index.spans, range.endContainer, range.endOffset)
  if (startOffset === null || endOffset === null || endOffset <= startOffset) return null
  return { start: startOffset, end: endOffset }
}

function nodeOffset(spans: TextSpan[], node: Node, offset: number): number | null {
  if (node.nodeType === Node.TEXT_NODE) {
    const span = spans.find((s) => s.node === node)
    if (!span) return null
    return span.start + offset
  }
  if (node.nodeType === Node.ELEMENT_NODE) {
    const children = node.childNodes
    if (offset >= children.length) {
      const last = lastTextDescendant(node)
      if (!last) return null
      const span = spans.find((s) => s.node === last)
      return span ? span.end : null
    }
    const child = children[offset]
    const first = firstTextDescendant(child) ?? firstTextAfter(spans, child)
    if (!first) return null
    const span = spans.find((s) => s.node === first)
    return span ? span.start : null
  }
  return null
}

function firstTextDescendant(node: Node): Text | null {
  if (node.nodeType === Node.TEXT_NODE) return node as Text
  for (const child of Array.from(node.childNodes)) {
    const found = firstTextDescendant(child)
    if (found) return found
  }
  return null
}

function lastTextDescendant(node: Node): Text | null {
  if (node.nodeType === Node.TEXT_NODE) return node as Text
  const children = Array.from(node.childNodes)
  for (let i = children.length - 1; i >= 0; i--) {
    const found = lastTextDescendant(children[i])
    if (found) return found
  }
  return null
}

function firstTextAfter(spans: TextSpan[], node: Node): Text | null {
  for (const span of spans) {
    const relation = node.compareDocumentPosition(span.node)
    if (relation & Node.DOCUMENT_POSITION_FOLLOWING) return span.node
  }
  return null
}
