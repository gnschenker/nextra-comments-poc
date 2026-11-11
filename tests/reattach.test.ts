import { describe, expect, it } from 'vitest'
import { attachAnchor } from '@/lib/comments/reattach'
import type { Anchor, DocumentText } from '@/lib/comments/types'

function doc(text: string, headings: DocumentText['headingRanges'] = []): DocumentText {
  return { text, headingRanges: headings }
}

function anchor(partial: Partial<Anchor> & Pick<Anchor, 'quote'>): Anchor {
  return {
    prefix: '',
    suffix: '',
    headingId: null,
    ...partial
  }
}

describe('attachAnchor', () => {
  it('reattaches an unchanged quote with an exact match', () => {
    const text = 'Before shipping, wait for the health check to return 200. Then route traffic.'
    const quote = 'wait for the health check to return 200'
    const result = attachAnchor(
      doc(text),
      anchor({
        quote,
        prefix: 'Before shipping, ',
        suffix: '. Then route traffic.'
      })
    )
    expect(result.status).toBe('exact')
    if (result.status === 'outdated') throw new Error('expected a match')
    expect(text.slice(result.start, result.end)).toBe(quote)
  })

  it('still finds a quote when nearby text was edited', () => {
    const originalQuote = 'wait for the health check to return 200'
    const text = 'After the canary finishes, wait for the health check to return 200 and only then route traffic.'
    const result = attachAnchor(
      doc(text),
      anchor({
        quote: originalQuote,
        prefix: 'Before shipping, ',
        suffix: '. Then route traffic.'
      })
    )
    expect(result.status).toBe('exact')
    if (result.status === 'outdated') throw new Error('expected a match')
    expect(text.slice(result.start, result.end)).toBe(originalQuote)
  })

  it('fuzzy-matches a quote whose own text was lightly edited', () => {
    const text = 'Deployments require two code reviewers before merge.'
    const result = attachAnchor(
      doc(text),
      anchor({
        quote: 'Deployments require two reviewers before merge.',
        prefix: '',
        suffix: ''
      })
    )
    expect(result.status).toBe('fuzzy')
    if (result.status === 'outdated') throw new Error('expected a match')
    expect(text.slice(result.start, result.end)).toBe('Deployments require two code reviewers before merge.')
  })

  it('resolves a duplicate quote using prefix and suffix', () => {
    const quote = 'Wait for the health check to return 200 before routing traffic.'
    const text =
      'In staging: Wait for the health check to return 200 before routing traffic. ' +
      'In production: Wait for the health check to return 200 before routing traffic.'
    const result = attachAnchor(
      doc(text),
      anchor({
        quote,
        prefix: 'In production: ',
        suffix: ''
      })
    )
    expect(result.status).toBe('exact')
    if (result.status === 'outdated') throw new Error('expected a match')
    expect(text.slice(Math.max(0, result.start - 16), result.start)).toContain('production')
    expect(text.slice(result.start, result.end)).toBe(quote)
  })

  it('resolves a duplicate quote using the nearest heading id', () => {
    const quote = 'review the runbook'
    const first = 'Please review the runbook before paging. '
    const second = 'Later, review the runbook after the incident.'
    const text = first + second
    const headings = [
      { id: 'before-you-page', start: 0, end: first.length },
      { id: 'after-the-incident', start: first.length, end: text.length }
    ]
    const result = attachAnchor(doc(text, headings), anchor({ quote, headingId: 'after-the-incident' }))
    expect(result.status).toBe('exact')
    if (result.status === 'outdated') throw new Error('expected a match')
    expect(result.headingId).toBe('after-the-incident')
    expect(result.start).toBe(text.lastIndexOf(quote))
  })

  it('marks a missing quote as outdated', () => {
    const result = attachAnchor(
      doc('This page no longer mentions rollbacks at all.'),
      anchor({
        quote: 'Never roll forward without a written rollback step.',
        prefix: 'Production rule: ',
        suffix: ' Confirm it in the thread.'
      })
    )
    expect(result).toEqual({ status: 'outdated' })
  })
})
