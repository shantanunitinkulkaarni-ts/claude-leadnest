import { test, expect } from '@playwright/test'
import { createLogger } from '../../lib/logger'

function captureConsole() {
  const logLines: string[] = []
  const errorLines: string[] = []
  const origLog = console.log
  const origError = console.error
  console.log = (line: string) => logLines.push(line)
  console.error = (line: string) => errorLines.push(line)
  const restore = () => { console.log = origLog; console.error = origError }
  return { logLines, errorLines, restore }
}

test.describe('createLogger', () => {
  test('log() writes JSON with traceId, ts, and event', () => {
    const cap = captureConsole()
    try {
      const { log } = createLogger('trace-123')
      log('something_happened', { foo: 'bar' })
      expect(cap.logLines).toHaveLength(1)
      const parsed = JSON.parse(cap.logLines[0])
      expect(parsed.traceId).toBe('trace-123')
      expect(parsed.event).toBe('something_happened')
      expect(parsed.foo).toBe('bar')
      expect(typeof parsed.ts).toBe('number')
    } finally {
      cap.restore()
    }
  })

  test('logError() routes through console.error with the same shape', () => {
    const cap = captureConsole()
    try {
      const { logError } = createLogger('trace-456')
      logError('it_broke', { reason: 'oops' })
      expect(cap.errorLines).toHaveLength(1)
      expect(cap.logLines).toHaveLength(0)
      const parsed = JSON.parse(cap.errorLines[0])
      expect(parsed.traceId).toBe('trace-456')
      expect(parsed.event).toBe('it_broke')
      expect(parsed.reason).toBe('oops')
    } finally {
      cap.restore()
    }
  })

  test('setContext() merges into every subsequent log line', () => {
    const cap = captureConsole()
    try {
      const { log, setContext } = createLogger('trace-789')
      log('before_context')
      setContext({ agentId: 'a1' })
      log('after_context')
      setContext({ leadId: 'l1' })
      log('after_second_context')

      const before = JSON.parse(cap.logLines[0])
      const after = JSON.parse(cap.logLines[1])
      const afterSecond = JSON.parse(cap.logLines[2])

      expect(before.agentId).toBeUndefined()
      expect(after.agentId).toBe('a1')
      expect(afterSecond.agentId).toBe('a1')
      expect(afterSecond.leadId).toBe('l1')
    } finally {
      cap.restore()
    }
  })

  test('per-call data overrides context for that one line without mutating context', () => {
    const cap = captureConsole()
    try {
      const { log, setContext } = createLogger('trace-abc')
      setContext({ agentId: 'a1' })
      log('override_once', { agentId: 'a2' })
      log('back_to_context')

      const overridden = JSON.parse(cap.logLines[0])
      const reverted = JSON.parse(cap.logLines[1])
      expect(overridden.agentId).toBe('a2')
      expect(reverted.agentId).toBe('a1')
    } finally {
      cap.restore()
    }
  })
})
