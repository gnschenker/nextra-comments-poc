import type { Anchor, Attachment, DocumentText } from './types'

const FUZZY_THRESHOLD = 0.78
const CONTEXT_WINDOW = 12

export function headingAt(doc: DocumentText, offset: number): string | null {
  let found: string | null = null
  for (const range of doc.headingRanges) {
    if (range.start <= offset && offset < range.end) {
      found = range.id
      break
    }
  }
  return found
}

export function attachAnchor(doc: DocumentText, anchor: Anchor): Attachment {
  const quote = anchor.quote
  if (!quote) return { status: 'outdated' }

  const exact = findExact(doc.text, quote)
  if (exact.length === 1) {
    return toExact(doc, exact[0], quote.length)
  }
  if (exact.length > 1) {
    const best = pickBest(doc, anchor, exact.map((start) => ({ start, end: start + quote.length, similarity: 1 })))
    return { status: 'exact', start: best.start, end: best.end, headingId: headingAt(doc, best.start) }
  }

  const fuzzy = findFuzzy(doc, anchor)
  if (fuzzy.length === 0) return { status: 'outdated' }

  const best = pickBest(doc, anchor, fuzzy)
  if (best.similarity < FUZZY_THRESHOLD) return { status: 'outdated' }
  return { status: 'fuzzy', start: best.start, end: best.end, headingId: headingAt(doc, best.start) }
}

type Candidate = {
  start: number
  end: number
  similarity: number
}

function toExact(doc: DocumentText, start: number, length: number): Attachment {
  return {
    status: 'exact',
    start,
    end: start + length,
    headingId: headingAt(doc, start)
  }
}

function findExact(text: string, quote: string): number[] {
  const hits: number[] = []
  let from = 0
  while (from <= text.length - quote.length) {
    const idx = text.indexOf(quote, from)
    if (idx === -1) break
    hits.push(idx)
    from = idx + 1
  }
  return hits
}

function findFuzzy(doc: DocumentText, anchor: Anchor): Candidate[] {
  const quote = anchor.quote
  const windows: Array<{ start: number; end: number }> = []
  if (anchor.headingId) {
    const heading = doc.headingRanges.find((range) => range.id === anchor.headingId)
    if (heading) {
      windows.push({
        start: Math.max(0, heading.start - 80),
        end: Math.min(doc.text.length, heading.end + 80)
      })
    }
  }
  windows.push({ start: 0, end: doc.text.length })

  for (const window of windows) {
    const found = fuzzyInRange(doc.text, quote, window.start, window.end)
    if (found.length > 0) return found
  }
  return []
}

function fuzzyInRange(text: string, quote: string, from: number, to: number): Candidate[] {
  const minLen = Math.max(1, Math.floor(quote.length * 0.7))
  const maxLen = Math.min(to - from, Math.ceil(quote.length * 1.35))
  if (maxLen < minLen) return []
  const found: Candidate[] = []
  let best = FUZZY_THRESHOLD
  const step = Math.max(1, Math.floor(quote.length / 10))

  for (let len = minLen; len <= maxLen; len++) {
    for (let start = from; start + len <= to; start += step) {
      const slice = text.slice(start, start + len)
      const similarity = stringSimilarity(quote, slice)
      if (similarity >= FUZZY_THRESHOLD && similarity >= best - 0.05) {
        found.push({ start, end: start + len, similarity })
        if (similarity > best) best = similarity
      }
    }
  }

  return found.filter((c) => c.similarity >= FUZZY_THRESHOLD)
}

function pickBest(doc: DocumentText, anchor: Anchor, candidates: Candidate[]): Candidate {
  let best = candidates[0]
  let bestScore = -Infinity
  for (const candidate of candidates) {
    const score = scoreCandidate(doc, anchor, candidate)
    if (score > bestScore) {
      best = candidate
      bestScore = score
    }
  }
  return best
}

function scoreCandidate(doc: DocumentText, anchor: Anchor, candidate: Candidate): number {
  const before = doc.text.slice(Math.max(0, candidate.start - Math.max(anchor.prefix.length, CONTEXT_WINDOW)), candidate.start)
  const after = doc.text.slice(candidate.end, candidate.end + Math.max(anchor.suffix.length, CONTEXT_WINDOW))
  const prefixScore = overlapFromEnd(before, anchor.prefix)
  const suffixScore = overlapFromStart(after, anchor.suffix)
  const heading = headingAt(doc, candidate.start)
  const headingScore = anchor.headingId && heading === anchor.headingId ? 40 : 0
  return candidate.similarity * 10 + prefixScore + suffixScore + headingScore
}

function overlapFromEnd(haystack: string, needle: string): number {
  if (!needle) return 0
  const n = Math.min(haystack.length, needle.length)
  for (let len = n; len > 0; len--) {
    if (haystack.slice(-len) === needle.slice(-len)) return len
  }
  return 0
}

function overlapFromStart(haystack: string, needle: string): number {
  if (!needle) return 0
  const n = Math.min(haystack.length, needle.length)
  for (let len = n; len > 0; len--) {
    if (haystack.slice(0, len) === needle.slice(0, len)) return len
  }
  return 0
}

export function stringSimilarity(a: string, b: string): number {
  if (a === b) return 1
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1
  return 1 - levenshtein(a, b) / maxLen
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  if (a.length < b.length) return levenshtein(b, a)

  const row = new Array<number>(b.length + 1)
  for (let j = 0; j <= b.length; j++) row[j] = j

  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j]
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost)
      prev = cur
    }
  }
  return row[b.length]
}
