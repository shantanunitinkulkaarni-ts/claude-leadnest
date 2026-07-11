import { test, expect } from '@playwright/test'
import { detectMessageLanguage } from '@/lib/promptEngine'

// ─── Server-side language detector unit tests ─────────────────────────────────
// These run without a DB or LLM — pure function tests.

test.describe('detectMessageLanguage()', () => {

  // ── Marathi Devanagari ────────────────────────────────────────────────────
  test('Marathi Devanagari: मला बाणेरमध्ये 2bhk घर हवंय', () => {
    expect(detectMessageLanguage('मला बाणेरमध्ये 2bhk घर हवंय')).toBe('mr')
  })
  test('Marathi Devanagari: पाहिजे marker', () => {
    expect(detectMessageLanguage('मला flat पाहिजे')).toBe('mr')
  })
  test('Marathi Devanagari: आहे marker', () => {
    expect(detectMessageLanguage('किंमत काय आहे?')).toBe('mr')
  })
  test('Marathi Devanagari: नको marker', () => {
    expect(detectMessageLanguage('मला हे नको आहे')).toBe('mr')
  })

  // ── Hindi Devanagari ─────────────────────────────────────────────────────
  test('Hindi Devanagari: मुझे बानेर में 2bhk चाहिए', () => {
    expect(detectMessageLanguage('मुझे बानेर में 2bhk चाहिए')).toBe('hi')
  })
  test('Hindi Devanagari: है marker', () => {
    expect(detectMessageLanguage('कितना है?')).toBe('hi')
  })
  test('Hindi Devanagari: क्या marker', () => {
    expect(detectMessageLanguage('क्या यह available है?')).toBe('hi')
  })

  // ── Marathi in Latin letters ─────────────────────────────────────────────
  test('Marathi Latin: pahije', () => {
    expect(detectMessageLanguage('mala 2bhk flat pahije baner madhe')).toBe('mr')
  })
  test('Marathi Latin: hava', () => {
    expect(detectMessageLanguage('mala ghar hava')).toBe('mr')
  })
  test('Marathi Latin: aahe', () => {
    expect(detectMessageLanguage('budget 50 lakh aahe')).toBe('mr')
  })
  test('Marathi Latin: nako', () => {
    expect(detectMessageLanguage('mala he nako')).toBe('mr')
  })
  test('Marathi Latin: mala', () => {
    expect(detectMessageLanguage('mala flat pahije')).toBe('mr')
  })
  test('Marathi Latin: amhi', () => {
    expect(detectMessageLanguage('amhi baner la rahato')).toBe('mr')
  })
  test('Marathi Latin: tumhi', () => {
    expect(detectMessageLanguage('tumhi kiti rate sangal?')).toBe('mr')
  })
  test('Marathi Latin: sangto', () => {
    expect(detectMessageLanguage('mi tula nanter sangto')).toBe('mr')
  })
  test('Marathi Latin: naahi', () => {
    expect(detectMessageLanguage('budget naahi fix yet')).toBe('mr')
  })
  test('Marathi Latin: baghto', () => {
    expect(detectMessageLanguage('property baghto aahe')).toBe('mr')
  })

  // ── Hindi in Latin letters (Hinglish) ────────────────────────────────────
  test('Hindi Latin: chahiye', () => {
    expect(detectMessageLanguage('mujhe ek flat chahiye')).toBe('hi')
  })
  test('Hindi Latin: mujhe', () => {
    expect(detectMessageLanguage('mujhe baner area mein dekhna hai')).toBe('hi')
  })
  test('Hindi Latin: theek hai', () => {
    expect(detectMessageLanguage('theek hai bhai')).toBe('hi')
  })
  test('Hindi Latin: bilkul', () => {
    expect(detectMessageLanguage('bilkul batao')).toBe('hi')
  })
  test('Hindi Latin: hain plural', () => {
    expect(detectMessageLanguage('aur kya options hain?')).toBe('hi')
  })

  // ── Ambiguous short messages → rely on stored language ───────────────────
  test('Short "ok" with stored Marathi → returns mr', () => {
    expect(detectMessageLanguage('ok', 'mr')).toBe('mr')
  })
  test('Short "yes" with stored Hindi → returns hi', () => {
    expect(detectMessageLanguage('yes', 'hi')).toBe('hi')
  })
  test('Short "thanks" with no stored lang → returns null', () => {
    expect(detectMessageLanguage('thanks')).toBeNull()
  })
  test('"hello" with no stored lang → returns null', () => {
    expect(detectMessageLanguage('hello')).toBeNull()
  })

  // ── English ───────────────────────────────────────────────────────────────
  test('Clear English message → returns null (default to English)', () => {
    expect(detectMessageLanguage('I am looking for a 2bhk flat in Baner')).toBeNull()
  })
  test('English with stored Marathi (short reply) → returns mr', () => {
    expect(detectMessageLanguage('sure', 'mr')).toBe('mr')
  })

  // ── Do NOT confuse Hindi and Marathi Latin ────────────────────────────────
  test('Hindi "chahiye" must NOT be detected as Marathi', () => {
    expect(detectMessageLanguage('mujhe flat chahiye baner mein')).toBe('hi')
  })
  test('Marathi "pahije" must NOT be detected as Hindi', () => {
    expect(detectMessageLanguage('ghar pahije mala')).toBe('mr')
  })
})
