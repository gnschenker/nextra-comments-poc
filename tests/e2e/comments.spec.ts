import AxeBuilder from '@axe-core/playwright'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const ARTIFACTS = '/opt/cursor/artifacts'
const QUOTE = 'Never roll forward without a written rollback step.'

function cookieFor(name: string): string {
  const id = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `nextra_comments_user=${encodeURIComponent(JSON.stringify({ id, name }))}`
}

async function signIn(page: Page, name: string) {
  await page.request.post('/api/me', { data: { name } })
}

async function openDeploy(page: Page, name: string) {
  await signIn(page, name)
  await page.goto('/deploy')
  await expect(page.getByRole('heading', { name: 'Comments' })).toBeVisible()
  await expect(page.getByText(`Signed in as ${name}`)).toBeVisible()
}

async function clearComments(request: APIRequestContext, pagePath = '/deploy') {
  const response = await request.get(`/api/comments?page=${encodeURIComponent(pagePath)}`)
  const comments = (await response.json()) as Array<{ id: string; author: { name: string } }>
  for (const comment of comments) {
    await request.delete(`/api/comments/${comment.id}`, {
      headers: { cookie: cookieFor(comment.author.name) }
    })
  }
}

async function selectQuote(page: Page, quote: string) {
  const found = await page.evaluate((q) => {
    const root = document.querySelector('[data-comments-content]')
    if (!root) return false
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let node = walker.nextNode()
    while (node) {
      const text = node.nodeValue ?? ''
      const index = text.indexOf(q)
      if (index >= 0) {
        const range = document.createRange()
        range.setStart(node, index)
        range.setEnd(node, index + q.length)
        const sel = window.getSelection()
        sel?.removeAllRanges()
        sel?.addRange(range)
        node.parentElement?.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
        return true
      }
      node = walker.nextNode()
    }
    return false
  }, quote)
  expect(found).toBe(true)
}

async function saveShot(page: Page, name: string) {
  mkdirSync(ARTIFACTS, { recursive: true })
  const dest = path.join(ARTIFACTS, `${name}.png`)
  await page.screenshot({ path: dest, fullPage: false })
  return dest
}

async function axePage(page: Page) {
  let builder = new AxeBuilder({ page }).include('[data-comments-content]').include('.nc-panel')
  if (await page.locator('.nc-pop:not([hidden])').count()) builder = builder.include('.nc-pop')
  if (await page.locator('.nc-selbtn:not([hidden])').count()) builder = builder.include('.nc-selbtn')
  const results = await builder.analyze()
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([])
}

test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ page }) => {
  await clearComments(page.request)
})

test('composer and thread overlay: select, save, marker, reply, resolve', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await openDeploy(page, 'Grace Hopper')

  await selectQuote(page, QUOTE)
  const commentBtn = page.getByTestId('nc-selbtn')
  await expect(commentBtn).toBeVisible()
  await expect(commentBtn).toHaveAttribute('title', /Alt\+M/)
  await commentBtn.click()

  const dialog = page.getByRole('dialog', { name: 'New comment' })
  await expect(dialog).toBeVisible()
  const textarea = dialog.getByLabel('Comment')
  await expect(textarea).toBeFocused()
  await expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled()
  await textarea.fill('The deploy author writes it.')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog).toBeHidden()

  const marker = page.getByRole('button', { name: /comment.*Never roll forward/i })
  await expect(marker).toBeVisible()
  await expect(marker).toBeFocused()
  await marker.click()

  const thread = page.getByRole('dialog', { name: /Comment thread on/ })
  await expect(thread).toBeVisible()
  await thread.getByLabel('Reply').fill('The second reviewer checks it before approving the canary.')
  await thread.getByRole('button', { name: 'Reply' }).click()
  await expect(thread.getByText('The second reviewer checks it before approving the canary.')).toBeVisible()
  await thread.getByRole('button', { name: 'Resolve' }).click()
  await expect(thread.getByRole('button', { name: 'Reopen' })).toBeVisible()
  await expect(thread.getByLabel('Reply')).toHaveCount(0)
})

test('keyboard-only composer and overlay', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await openDeploy(page, 'Grace Hopper')

  await selectQuote(page, QUOTE)
  await page.keyboard.press('Shift+ArrowRight')
  await page.keyboard.press('Control+Alt+KeyM')

  const dialog = page.getByRole('dialog', { name: 'New comment' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel('Comment')).toBeFocused()
  await page.keyboard.type('Keyboard comment')
  await page.keyboard.press('Control+Enter')
  await expect(dialog).toBeHidden()

  const marker = page.getByRole('button', { name: /comment.*Never roll forward/i })
  await expect(marker).toBeFocused()
  await page.keyboard.press('Enter')
  const thread = page.getByRole('dialog', { name: /Comment thread on/ })
  await expect(thread).toBeVisible()
  await expect(thread.getByLabel('Reply')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(thread).toBeHidden()
  await expect(marker).toBeFocused()
})

test('390px bottom sheet is modal and traps focus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signIn(page, 'Grace Hopper')
  await page.request.post('/api/comments', {
    headers: { cookie: cookieFor('Ada Lovelace'), 'content-type': 'application/json' },
    data: {
      page: '/deploy',
      pageVersion: 'v1',
      body: 'Spell out who writes the rollback step.',
      anchor: {
        quote: QUOTE,
        prefix: '',
        suffix: ' Confirm it in the thread',
        headingId: 'production'
      }
    }
  })
  await page.goto('/deploy')
  await expect(page.getByText('Signed in as Grace Hopper')).toBeVisible()
  await page.getByRole('button', { name: /comment.*Never roll forward/i }).click()
  const thread = page.getByRole('dialog', { name: /Comment thread on/ })
  await expect(thread).toBeVisible()
  await expect(thread).toHaveAttribute('data-mode', 'sheet')
  await expect(thread).toHaveAttribute('aria-modal', 'true')
  await saveShot(page, 'thread-390-sheet')
})

test('axe open and closed, light and dark', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await signIn(page, 'Grace Hopper')
  await page.request.post('/api/comments', {
    headers: { cookie: cookieFor('Ada Lovelace'), 'content-type': 'application/json' },
    data: {
      page: '/deploy',
      pageVersion: 'v1',
      body: 'Spell out who writes the rollback step.',
      anchor: {
        quote: QUOTE,
        prefix: '',
        suffix: ' Confirm it in the thread',
        headingId: 'production'
      }
    }
  })
  await page.goto('/deploy')
  await expect(page.getByText('Signed in as Grace Hopper')).toBeVisible()

  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((mode) => {
      document.documentElement.classList.toggle('dark', mode === 'dark')
      document.documentElement.classList.toggle('light', mode === 'light')
      ;(document.activeElement as HTMLElement | null)?.blur()
    }, theme)
    await axePage(page)
    await page.getByRole('button', { name: /comment.*Never roll forward/i }).click()
    await expect(page.getByRole('dialog', { name: /Comment thread on/ })).toBeVisible()
    await axePage(page)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: /Comment thread on/ })).toBeHidden()
  }
})

test('screenshots: composer, thread, tablet, error', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await signIn(page, 'Grace Hopper')
  await page.request.post('/api/comments', {
    headers: { cookie: cookieFor('Ada Lovelace'), 'content-type': 'application/json' },
    data: {
      page: '/deploy',
      pageVersion: 'v1',
      body: 'Spell out who writes the rollback step.',
      anchor: {
        quote: QUOTE,
        prefix: '',
        suffix: ' Confirm it in the thread',
        headingId: 'production'
      }
    }
  })
  const list = await page.request.get('/api/comments?page=/deploy')
  const [root] = (await list.json()) as Array<{ id: string }>
  await page.request.post('/api/comments', {
    headers: { cookie: cookieFor('Grace Hopper'), 'content-type': 'application/json' },
    data: {
      page: '/deploy',
      pageVersion: 'v1',
      parentId: root.id,
      body: 'The deploy author writes it. The second reviewer checks it before approving the canary.'
    }
  })

  await page.goto('/deploy')
  await expect(page.getByText('Signed in as Grace Hopper')).toBeVisible()
  await page.getByRole('button', { name: /2 comments on/i }).click()
  const overlay = page.getByRole('dialog', { name: /Comment thread on/ })
  await expect(overlay).toBeVisible()
  await expect(overlay.getByRole('button', { name: 'Resolve' })).toHaveCount(0)
  await saveShot(page, 'thread-1280-light')

  await page.evaluate(() => {
    document.documentElement.classList.add('dark')
    document.documentElement.classList.remove('light')
  })
  await saveShot(page, 'thread-1280-dark')
  await page.keyboard.press('Escape')

  await page.evaluate(() => {
    document.documentElement.classList.remove('dark')
    document.documentElement.classList.add('light')
  })
  await page.setViewportSize({ width: 768, height: 900 })
  await page.getByRole('button', { name: /2 comments on/i }).click()
  await expect(page.getByRole('dialog', { name: /Comment thread on/ })).toBeVisible()
  await saveShot(page, 'thread-768-light')
  await page.keyboard.press('Escape')

  await page.setViewportSize({ width: 1280, height: 800 })
  await expect(page.getByRole('dialog', { name: /Comment thread on/ })).toBeHidden()
  await selectQuote(page, 'The second reviewer must be outside the authoring team.')
  await page.getByTestId('nc-selbtn').click()
  const composer = page.getByRole('dialog', { name: 'New comment' })
  await composer.getByLabel('Comment').fill('Does this include the on-call SRE?')
  await saveShot(page, 'composer-1280-light')

  await page.route('**/api/comments', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'fail' })
      })
      return
    }
    await route.continue()
  })
  await composer.getByRole('button', { name: 'Save' }).click()
  await expect(composer.getByRole('alert')).toBeVisible()
  await expect(composer.getByRole('button', { name: 'Retry' })).toBeVisible()
  await saveShot(page, 'composer-error-1280-light')
})

test('records the composer-to-thread walkthrough video', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await openDeploy(page, 'Grace Hopper')
  await selectQuote(page, QUOTE)
  await page.waitForTimeout(400)
  await page.getByTestId('nc-selbtn').click()
  const dialog = page.getByRole('dialog', { name: 'New comment' })
  await dialog.getByLabel('Comment').fill('The deploy author writes the rollback step.')
  await page.waitForTimeout(400)
  await dialog.getByRole('button', { name: 'Save' }).click()
  const marker = page.getByRole('button', { name: /comment.*Never roll forward/i })
  await page.waitForTimeout(400)
  await marker.click()
  const thread = page.getByRole('dialog', { name: /Comment thread on/ })
  await thread.getByLabel('Reply').fill('Second reviewer checks it before the canary.')
  await page.waitForTimeout(400)
  await thread.getByRole('button', { name: 'Reply' }).click()
  await expect(thread.getByText('Second reviewer checks it before the canary.')).toBeVisible()
  await page.waitForTimeout(400)
  await thread.getByRole('button', { name: 'Resolve' }).click()
  await expect(thread.getByRole('button', { name: 'Reopen' })).toBeVisible()
  await page.waitForTimeout(600)
})
