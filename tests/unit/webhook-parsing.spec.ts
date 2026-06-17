import { test, expect } from '@playwright/test'

// Test the button-text extraction and opt-out patterns that live in the webhook.
// We extract the logic here so it can be unit-tested without a live DB.

// ─── Button text extraction (mirrors webhook pick() + JSON-parse logic) ────────

function extractButtonText(body: any): string {
  const pick = (...xs: any[]) => { for (const x of xs) if (typeof x === 'string' && x.trim()) return x; return '' }
  let btn = body.button
  if (typeof btn === 'string') { try { btn = JSON.parse(btn) } catch { /* leave as string */ } }
  return pick(
    body.text,
    btn?.text, btn?.payload, btn?.title, btn?.value,
    typeof body.button === 'string' && !body.button.startsWith('{') ? body.button : '',
    body.buttonText, body.button_text, body.payload, body.buttonPayload,
    body.interactive?.button_reply?.title, body.interactive?.button_reply?.id,
    body.content?.text, typeof body.content === 'string' ? body.content : '',
    body.message?.text, body.title,
  )
}

test.describe('MSG91 button text extraction', () => {
  test('plain text message', () => {
    expect(extractButtonText({ text: 'Hello', contentType: 'text' })).toBe('Hello')
  })

  test('button as JSON string (the format MSG91 actually sends)', () => {
    expect(extractButtonText({
      text: '',
      contentType: 'button',
      button: '{"payload":"Yes, share details","text":"Yes, share details"}',
    })).toBe('Yes, share details')
  })

  test('Stop updates button in English', () => {
    expect(extractButtonText({
      text: '',
      contentType: 'button',
      button: '{"payload":"Stop updates","text":"Stop updates"}',
    })).toBe('Stop updates')
  })

  test('Talk to agent button', () => {
    expect(extractButtonText({
      text: '',
      contentType: 'button',
      button: '{"payload":"Talk to agent","text":"Talk to agent"}',
    })).toBe('Talk to agent')
  })

  test('button as plain string (fallback format)', () => {
    expect(extractButtonText({ text: '', button: 'Yes please' })).toBe('Yes please')
  })

  test('interactive button_reply format', () => {
    expect(extractButtonText({
      text: '',
      interactive: { button_reply: { title: 'Confirm visit', id: 'confirm_visit' } }
    })).toBe('Confirm visit')
  })

  test('empty text with no button fields returns empty', () => {
    expect(extractButtonText({ text: '', contentType: 'image' })).toBe('')
  })
})

// ─── Opt-out pattern detection (mirrors webhook logic) ────────────────────────

function isOptOut(messageText: string): boolean {
  const t = messageText.trim().toLowerCase()
  const isBareStop = /^(stop|unsubscribe|opt[\s-]?out|stop messaging|stop messages)\.?$/i.test(t)
  const isExplicitOptOut = /(do ?n.?t|stop|please stop|mat) (message|messaging|contact|text|texting)|unsubscribe me|message mat karo|message मत|मेसेज मत|मेसेज नको|मेसेज बंद/i.test(t)
  const optOutButtons = ['stop updates', 'अपडेट बंद करें', 'अपडेट बंद करा']
  const isButtonOptOut = optOutButtons.includes(t)
  return isBareStop || isExplicitOptOut || isButtonOptOut
}

test.describe('Opt-out pattern detection', () => {
  test('bare STOP triggers opt-out', () => {
    expect(isOptOut('STOP')).toBe(true)
    expect(isOptOut('stop')).toBe(true)
    expect(isOptOut('Stop.')).toBe(true)
  })

  test('unsubscribe triggers opt-out', () => {
    expect(isOptOut('unsubscribe')).toBe(true)
  })

  test('Stop updates button (en) triggers opt-out', () => {
    expect(isOptOut('Stop updates')).toBe(true)
  })

  test('Hindi stop button triggers opt-out', () => {
    expect(isOptOut('अपडेट बंद करें')).toBe(true)
  })

  test('Marathi stop button triggers opt-out', () => {
    expect(isOptOut('अपडेट बंद करा')).toBe(true)
  })

  test('explicit don\'t message me', () => {
    expect(isOptOut("don't message me")).toBe(true)
    expect(isOptOut("please stop messaging")).toBe(true)
  })

  test('innocent messages do NOT trigger opt-out', () => {
    expect(isOptOut('Can I stop by your office?')).toBe(false)
    expect(isOptOut('hello')).toBe(false)
    expect(isOptOut('stop wasting my time and show me the flat')).toBe(false)
    expect(isOptOut('Yes, share details')).toBe(false)
    expect(isOptOut('Talk to agent')).toBe(false)
  })
})

// ─── Content-dedup trigger for button taps without UUID ───────────────────────
// When MSG91 sends a button tap with no uuid, wa_message_id is stored as null.
// Postgres doesn't enforce uniqueness on null, so retries can double-fire the
// engine. The webhook checks for same content <60s when uuid is absent.

function needsContentDedup(waMessageId: string | null | undefined): boolean {
  return !waMessageId
}

test.describe('Content-dedup trigger (button taps without UUID)', () => {
  test('empty uuid → fallback dedup needed', () => { expect(needsContentDedup('')).toBe(true) })
  test('null uuid → fallback dedup needed', () => { expect(needsContentDedup(null)).toBe(true) })
  test('undefined uuid → fallback dedup needed', () => { expect(needsContentDedup(undefined)).toBe(true) })
  test('present uuid → primary dedup handles it, no fallback needed', () => {
    expect(needsContentDedup('wamid.abc123')).toBe(false)
  })
})
