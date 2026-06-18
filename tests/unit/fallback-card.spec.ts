import { test, expect } from '@playwright/test'
import { buildAgentContactCard } from '../../lib/fallbackCard'

test.describe('buildAgentContactCard', () => {
  test('renders a full card with all fields', () => {
    const card = buildAgentContactCard({
      name: 'Rajesh Sharma', agency_name: 'SK Properties', phone: '+91 75591 97426',
      office_address: 'Office 204, Amar Business Zone, Baner', city: 'Pune',
      office_open: '09:00', office_close: '19:00', weekly_off: 'Sunday',
      holidays: 'Closed on public holidays',
    })
    console.log('\n===== FULL CARD =====\n' + card + '\n')
    expect(card).toContain('SK Properties')
    expect(card).toContain('Rajesh Sharma')
    expect(card).toContain('+91 75591 97426')
    expect(card).toContain('Office 204, Amar Business Zone, Baner')
    expect(card).toContain('9 AM–7 PM')
    expect(card).toContain('closed Sunday')
  })

  test('gracefully skips fields the agent has not filled yet', () => {
    const card = buildAgentContactCard({
      name: 'Priya Patel', agency_name: 'Dream Homes', phone: '9876543210',
      city: 'Mumbai', office_open: '10:00', office_close: '18:30',
    })
    console.log('\n===== PARTIAL CARD =====\n' + card + '\n')
    expect(card).toContain('Dream Homes')
    expect(card).toContain('Mumbai') // falls back to city when no address
    expect(card).toContain('10 AM–6:30 PM')
    expect(card).not.toContain('undefined')
    expect(card).not.toContain('closed') // no weekly_off provided
  })

  test('never shows blanks when most fields are missing', () => {
    const card = buildAgentContactCard({ phone: '9876543210' })
    expect(card).toContain('I have informed our team to connect with you')
    expect(card).toContain('9876543210')
    expect(card).not.toContain('undefined')
    expect(card).not.toContain('null')
  })

  test('formats times correctly (AM/PM, noon/midnight edges)', () => {
    const card = buildAgentContactCard({ office_open: '00:00', office_close: '12:00' })
    expect(card).toContain('12 AM–12 PM')
  })
})
