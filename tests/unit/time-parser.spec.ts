/**
 * Unit Tests: timeParser.ts (Playwright)
 * Pure time/date parsing functions
 */

import { test, expect } from '@playwright/test'
import {
  parseTimeString,
  formatIST,
  visitHourIST,
  parseHourLabel,
  humanizeTimeLabel,
  visitWeekdayIST,
  bookingTimeIssue,
  isValidEmail,
  detectLanguageSwitchRequest,
  decodeVisitTimeWithAI,
  formatVisitConfirmationWithAI,
} from '@/lib/timeParser'

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000

function expectedYearForMonthDay(monthIndex: number, day: number): number {
  const istNow = new Date(Date.now() + IST_OFFSET_MS)
  const currentYear = istNow.getUTCFullYear()
  const currentMonth = istNow.getUTCMonth()
  const currentDay = istNow.getUTCDate()
  if (currentMonth > monthIndex || (currentMonth === monthIndex && currentDay > day)) {
    return currentYear + 1
  }
  return currentYear
}

test.describe('timeParser', () => {
  test.describe('parseTimeString', () => {
    test('ISO date with time', () => {
      const result = parseTimeString('2026-07-05 13:00')
      expect(result).toBe('2026-07-05T13:00:00+05:30')
    })

    test('ISO date without time defaults to 11 AM', () => {
      const result = parseTimeString('2026-07-05')
      expect(result).toMatch(/2026-07-05T11:00:00/)
    })

    test('ISO date with pm time', () => {
      const result = parseTimeString('2026-06-22 3 pm')
      expect(result).toBe('2026-06-22T15:00:00+05:30')
    })

    test('standard am/pm time', () => {
      const result = parseTimeString('tomorrow at 3 PM')
      expect(result).not.toBeNull()
      if (result) {
        expect(result).toMatch(/T15:00:00/)
      }
    })

    test('standard am time', () => {
      const result = parseTimeString('tomorrow at 10 AM')
      expect(result).not.toBeNull()
      if (result) {
        expect(result).toMatch(/T10:00:00/)
      }
    })

    test('HH:MM format', () => {
      const result = parseTimeString('tomorrow 14:30')
      expect(result).not.toBeNull()
      if (result) {
        expect(result).toMatch(/T14:30:00/)
      }
    })

    test('o\'clock format', () => {
      const result = parseTimeString('tomorrow 3 o\'clock')
      expect(result).not.toBeNull()
      if (result) {
        expect(result).toMatch(/T03:00:00/)
      }
    })

    test('day after tomorrow', () => {
      const result = parseTimeString('day after tomorrow at 11 AM')
      expect(result).not.toBeNull()
      if (result) {
        // Should be 2 days from now
        const today = new Date()
        const resultDate = new Date(result)
        const diffDays = Math.round((resultDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
        expect(diffDays).toBeGreaterThanOrEqual(1)
        expect(diffDays).toBeLessThanOrEqual(3)
      }
    })

    test('next week', () => {
      const result = parseTimeString('next week monday at 2 PM')
      expect(result).not.toBeNull()
      if (result) {
        expect(result).toMatch(/T14:00:00/)
      }
    })

    test('dd-mm date format (Indian style)', () => {
      const result = parseTimeString('22-06 at 3 PM')
      expect(result).not.toBeNull()
      if (result) {
        expect(result).toMatch(/T15:00:00/)
      }
    })

    test('month name date', () => {
      const result = parseTimeString('5 july at 1 PM')
      expect(result).not.toBeNull()
      if (result) {
        const expectedYear = expectedYearForMonthDay(6, 5)
        expect(result).toMatch(/T13:00:00/)
        expect(result).toMatch(new RegExp(`${expectedYear}-07-05`))
      }
    })

    test('month name with ordinal', () => {
      const result = parseTimeString('5th july at 1pm')
      expect(result).not.toBeNull()
      if (result) {
        const expectedYear = expectedYearForMonthDay(6, 5)
        expect(result).toMatch(/T13:00:00/)
        expect(result).toMatch(new RegExp(`${expectedYear}-07-05`))
      }
    })

    test('today keyword', () => {
      const result = parseTimeString('today at 5 PM')
      expect(result).not.toBeNull()
      if (result) {
        expect(result).toMatch(/T17:00:00/)
      }
    })

    test('this morning', () => {
      const result = parseTimeString('this morning at 9 AM')
      expect(result).not.toBeNull()
      if (result) {
        expect(result).toMatch(/T09:00:00/)
      }
    })

    test('this afternoon', () => {
      const result = parseTimeString('this afternoon at 2 PM')
      expect(result).not.toBeNull()
      if (result) {
        expect(result).toMatch(/T14:00:00/)
      }
    })

    test('returns null for empty string', () => {
      expect(parseTimeString('')).toBeNull()
    })

    test('returns null for no time', () => {
      expect(parseTimeString('sometime next week')).toBeNull()
    })

    // ─── Hindi / Hinglish Time Expressions ───────────────────────────────

    test('Hinglish: kal subah (tomorrow morning)', () => {
      const result = parseTimeString('kal subah 10 baje')
      expect(result).not.toBeNull()
      if (result) {
        expect(result).toMatch(/T10:00:00/)
      }
    })

    test('Hinglish: kal shaam (tomorrow evening)', () => {
      const result = parseTimeString('kal shaam 5 baje')
      expect(result).not.toBeNull()
      if (result) {
        expect(result).toMatch(/T17:00:00/)
      }
    })

    test('Hinglish: parson (day after tomorrow)', () => {
      const result = parseTimeString('parson 11 baje')
      expect(result).not.toBeNull()
      if (result) {
        expect(result).toMatch(/T11:00:00/)
      }
    })

    test('Hinglish: aaj (today)', () => {
      const result = parseTimeString('aaj 3 baje')
      expect(result).not.toBeNull()
      if (result) {
        expect(result).toMatch(/T15:00:00/)
      }
    })

    test('Hinglish: saade (half past)', () => {
      const result = parseTimeString('kal saade 3 baje')
      expect(result).not.toBeNull()
      if (result) {
        expect(result).toMatch(/T15:30:00/)
      }
    })

    test('Hinglish: sava (quarter past)', () => {
      const result = parseTimeString('kal sava 3 baje')
      expect(result).not.toBeNull()
      if (result) {
        expect(result).toMatch(/T15:15:00/)
      }
    })

    test('Hinglish: paune (quarter to)', () => {
      const result = parseTimeString('kal paune 3 baje')
      expect(result).not.toBeNull()
      if (result) {
        // paune 3 = quarter to 3 = 2:45
        expect(result).toMatch(/T14:45:00/)
      }
    })

    test('Hinglish: bajkar (past the hour)', () => {
      const result = parseTimeString('kal 3 bajkar 30')
      expect(result).not.toBeNull()
      if (result) {
        expect(result).toMatch(/T15:30:00/)
      }
    })

    test('Hinglish: agale hafte (next week)', () => {
      const result = parseTimeString('agale hafte somvar 2 baje')
      expect(result).not.toBeNull()
      if (result) {
        expect(result).toMatch(/T14:00:00/)
      }
    })

    test('Hinglish: mixed sentence', () => {
      const result = parseTimeString('mujhe kal subah 10 baje visit karna hai')
      expect(result).not.toBeNull()
      if (result) {
        expect(result).toMatch(/T10:00:00/)
      }
    })

    test('Hinglish: aadhi raat (midnight)', () => {
      const result = parseTimeString('aadhi raat 12 baje')
      expect(result).not.toBeNull()
      if (result) {
        expect(result).toMatch(/T00:00:00/)
      }
    })
  })

  test.describe('formatIST', () => {
    test('formats ISO string to IST', () => {
      const result = formatIST('2026-07-05T13:00:00+05:30')
      expect(result).toContain('Jul')
      expect(result).toContain('2026')
    })

    test('returns original on invalid input', () => {
      expect(formatIST('not-a-date')).toBe('not-a-date')
    })
  })

  test.describe('visitHourIST', () => {
    test('extracts hour from ISO string', () => {
      expect(visitHourIST('2026-07-05T13:00:00+05:30')).toBe(13)
    })

    test('converts stored UTC visit time back to IST hour', () => {
      expect(visitHourIST('2026-07-08T05:30:00.000Z')).toBe(11)
    })

    test('returns -1 for invalid input', () => {
      expect(visitHourIST('')).toBe(-1)
    })
  })

  test.describe('parseHourLabel', () => {
    test('parses 12-hour format with AM', () => {
      expect(parseHourLabel('9:00 AM')).toBe(9)
    })

    test('parses 12-hour format with PM', () => {
      expect(parseHourLabel('3:00 PM')).toBe(15)
    })

    test('parses 24-hour format', () => {
      expect(parseHourLabel('14:30')).toBe(14)
    })

    test('parses bare hour with PM', () => {
      expect(parseHourLabel('7 PM')).toBe(19)
    })

    test('returns null for invalid input', () => {
      expect(parseHourLabel('')).toBeNull()
    })
  })

  test.describe('humanizeTimeLabel', () => {
    test('converts 09:00 to 9 AM', () => {
      expect(humanizeTimeLabel('09:00')).toBe('9 AM')
    })

    test('converts 19:00 to 7 PM', () => {
      expect(humanizeTimeLabel('19:00')).toBe('7 PM')
    })

    test('converts 13:30 to 1:30 PM', () => {
      expect(humanizeTimeLabel('13:30')).toBe('1:30 PM')
    })
  })

  test.describe('visitWeekdayIST', () => {
    test('returns weekday for valid ISO', () => {
      // 2026-07-05 is a Sunday
      const result = visitWeekdayIST('2026-07-05T13:00:00+05:30')
      expect(result.toLowerCase()).toBe('sunday')
    })

    test('returns empty for invalid input', () => {
      expect(visitWeekdayIST('')).toBe('')
    })
  })

  test.describe('bookingTimeIssue', () => {
    const agent = {
      office_open: '09:00',
      office_close: '19:00',
      weekly_off: 'Sunday',
    }

    test('returns null for valid time', () => {
      const result = bookingTimeIssue('2026-07-06T14:00:00+05:30', agent) // Monday
      expect(result).toBeNull()
    })

    test('allows valid IST time stored as UTC', () => {
      const result = bookingTimeIssue('2026-07-08T05:30:00.000Z', agent) // Wednesday, 11 AM IST
      expect(result).toBeNull()
    })

    test('blocks out-of-hours IST time stored as UTC', () => {
      const result = bookingTimeIssue('2026-07-08T14:30:00.000Z', agent) // Wednesday, 8 PM IST
      expect(result).not.toBeNull()
      expect(result).toContain('site visits are between')
    })

    test('flags out-of-hours time', () => {
      const result = bookingTimeIssue('2026-07-06T20:00:00+05:30', agent) // 8 PM
      expect(result).not.toBeNull()
      expect(result).toContain('site visits are between')
    })

    test('flags weekly off day', () => {
      const result = bookingTimeIssue('2026-07-05T14:00:00+05:30', agent) // Sunday
      expect(result).not.toBeNull()
      expect(result).toContain('closed on')
    })

    test('flags early morning time', () => {
      const result = bookingTimeIssue('2026-07-06T06:00:00+05:30', agent) // 6 AM
      expect(result).not.toBeNull()
      expect(result).toContain('site visits are between')
    })

    test('flags explicit holiday date', () => {
      const holidayAgent = {
        ...agent,
        holidays: '2026-07-06',
      }
      const result = bookingTimeIssue('2026-07-06T11:00:00+05:30', holidayAgent)
      expect(result).not.toBeNull()
      expect(result).toContain('closed on')
    })

    test('flags common public holiday when policy says public holidays are closed', () => {
      const holidayAgent = {
        ...agent,
        holidays: 'Closed on public holidays',
      }
      const result = bookingTimeIssue('2026-08-15T11:00:00+05:30', holidayAgent)
      expect(result).not.toBeNull()
      expect(result).toContain('public holidays')
    })
  })

  test.describe('AI-assisted visit time', () => {
    test('decodes Indian language timing into IST ISO', async () => {
      const fakeLLM = async () => '{"ok":true,"iso":"2026-07-06T14:00:00+05:30","language":"hi"}'

      const result = await decodeVisitTimeWithAI('kal 2 baje', {
        llm: fakeLLM as any,
        now: new Date('2026-07-05T06:30:00.000Z'), // 12:00 IST
      })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.iso).toBe('2026-07-06T14:00:00+05:30')
        expect(result.language).toBe('hi')
      }
    })

    test('rejects AI output that is not an IST app timestamp', async () => {
      const fakeLLM = async () => '{"ok":true,"iso":"2026-07-06T08:30:00.000Z","language":"hi"}'

      const result = await decodeVisitTimeWithAI('kal 2 baje', { llm: fakeLLM as any })

      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.reason).toBe('invalid_ai_time')
    })

    test('honours a not-bookable AI decode', async () => {
      const fakeLLM = async () => '{"ok":false,"reason":"outside_hours","bookable":false,"language":"hi"}'

      const result = await decodeVisitTimeWithAI('kal 2 baje', {
        llm: fakeLLM as any,
        bookingKnowledge: 'Office hours: 09:00 to 19:00',
      })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.reason).toBe('outside_hours')
      }
    })

    test('formats confirmation after the app has scheduled the visit', async () => {
      const fakeLLM = async (_messages: any[]) => 'Done, your site visit is confirmed for 6 Jul at 2 PM.'

      const result = await formatVisitConfirmationWithAI({
        scheduledIso: '2026-07-06T14:00:00+05:30',
        customerText: 'kal 2 baje',
        language: 'en',
      }, { llm: fakeLLM as any })

      expect(result).toBe('Done, your site visit is confirmed for 6 Jul at 2 PM.')
    })

    test('hardcodes the full confirmation rule for Indian languages', async () => {
      let capturedMessages: any[] = []
      const fakeLLM = async (messages: any[]) => {
        capturedMessages = messages
        return 'Done, your site visit is confirmed for 6 Jul at 2 PM.'
      }

      await formatVisitConfirmationWithAI({
        scheduledIso: '2026-07-06T14:00:00+05:30',
        customerText: 'कल 2 बजे',
        language: 'hi',
      }, { llm: fakeLLM as any })

      const systemPrompt = capturedMessages.find((m) => m.role === 'system')?.content || ''
      const userPrompt = capturedMessages.find((m) => m.role === 'user')?.content || ''

      expect(systemPrompt).toContain('Always write a full natural sentence')
      expect(systemPrompt).toContain('never echo the customer text by itself')
      expect(systemPrompt).toContain('Hindi')
      expect(systemPrompt).toContain('Marathi')
      expect(systemPrompt).toContain('Assamese')
      expect(userPrompt).toContain('Requested language: Hindi')
    })
  })

  test.describe('isValidEmail', () => {
    test('valid email', () => {
      expect(isValidEmail('test@example.com')).toBe(true)
    })

    test('invalid email - no @', () => {
      expect(isValidEmail('testexample.com')).toBe(false)
    })

    test('invalid email - no domain', () => {
      expect(isValidEmail('test@')).toBe(false)
    })

    test('empty string', () => {
      expect(isValidEmail('')).toBe(false)
    })
  })

  test.describe('detectLanguageSwitchRequest', () => {
    test('detects english request', () => {
      expect(detectLanguageSwitchRequest('english please')).toBe('en')
    })

    test('detects hindi request', () => {
      expect(detectLanguageSwitchRequest('hindi me bolo')).toBe('hi')
    })

    test('detects hinglish request', () => {
      expect(detectLanguageSwitchRequest('hinglish')).toBe('hinglish')
    })

    test('detects marathi request', () => {
      expect(detectLanguageSwitchRequest('marathi')).toBe('mr')
    })

    test('returns null for no match', () => {
      expect(detectLanguageSwitchRequest('hello')).toBeNull()
    })
  })
})
