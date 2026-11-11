export const VIEWPORT_MARGIN = 8
export const POP_WIDTH = 360
export const GUTTER_MIN_WIDTH = 280
export const SHEET_MAX_WIDTH = 640
export const GUTTER_MIN_VIEWPORT = 1280

export type PlaceMode = 'sheet' | 'gutter' | 'float'

export function isSheetWidth(width = document.documentElement.clientWidth): boolean {
  return width <= SHEET_MAX_WIDTH
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(value, hi))
}

export function placePopover(options: {
  pop: HTMLElement
  kind: 'compose' | 'thread'
  rects: DOMRect[]
  column: DOMRect
}): PlaceMode {
  const { pop, kind, rects, column } = options
  const vw = document.documentElement.clientWidth
  const vh = window.innerHeight
  const M = VIEWPORT_MARGIN

  if (isSheetWidth(vw) || rects.length === 0) {
    pop.dataset.mode = 'sheet'
    pop.style.left = ''
    pop.style.top = ''
    pop.style.width = ''
    pop.style.maxHeight = ''
    return 'sheet'
  }

  const first = rects[0]
  const last = rects[rects.length - 1]
  pop.style.maxHeight = ''

  if (kind === 'thread' && vw >= GUTTER_MIN_VIEWPORT) {
    let left = column.right + 4
    let width = Math.min(POP_WIDTH, vw - M - left)
    if (width < GUTTER_MIN_WIDTH) {
      width = Math.min(POP_WIDTH, column.left - 2 * M)
      left = column.left - M - width
    }
    if (width >= GUTTER_MIN_WIDTH) {
      pop.dataset.mode = 'gutter'
      pop.style.width = `${width}px`
      const height = pop.offsetHeight
      pop.style.left = `${left}px`
      pop.style.top = `${clamp(first.top - 8, M, vh - M - height)}px`
      return 'gutter'
    }
  }

  pop.dataset.mode = 'float'
  const width =
    kind === 'thread' ? Math.min(column.width, vw - 2 * M) : Math.min(POP_WIDTH, vw - 2 * M)
  const left = clamp(kind === 'thread' ? column.left : first.left, M, vw - M - width)
  pop.style.width = `${width}px`
  const height = pop.offsetHeight
  const below = vh - M - (last.bottom + M)
  const above = first.top - 2 * M
  let top: number
  let maxHeight = 0
  if (height <= below) top = last.bottom + M
  else if (height <= above) top = first.top - M - height
  else if (below >= above) {
    top = last.bottom + M
    maxHeight = below
  } else {
    top = M
    maxHeight = above
  }
  if (maxHeight) pop.style.maxHeight = `${Math.max(200, maxHeight)}px`
  pop.style.left = `${left}px`
  pop.style.top = `${clamp(top, M, Math.max(M, vh - M - pop.offsetHeight))}px`
  return 'float'
}

export function placeSelectionButton(button: HTMLElement, rects: DOMRect[]): void {
  const visible = rects.filter((rect) => rect.width > 0 && rect.height > 0)
  if (visible.length === 0) {
    button.hidden = true
    return
  }
  const first = visible[0]
  const vw = document.documentElement.clientWidth
  const M = VIEWPORT_MARGIN
  const width = button.offsetWidth || 96
  const left = clamp(first.left + first.width / 2 - width / 2, M, vw - M - width)
  const above = first.top - 8 - 36
  const top = above >= M ? above : first.bottom + 8
  button.style.left = `${left}px`
  button.style.top = `${top}px`
}
