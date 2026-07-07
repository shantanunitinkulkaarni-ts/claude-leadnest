import { test, expect } from '@playwright/test'
import { buildAgentBookingRagMarkdown, buildAgentBookingRagSnapshot } from '../../lib/bookingRag'

const agent = {
  id: 'agent-1',
  name: 'Shantanu Kulkaarni',
  agency_name: 'Leadnest Homes',
  office_open: '09:00',
  office_close: '19:00',
  weekly_off: 'Sunday',
  holidays: '2026-08-15',
}

const properties = [
  {
    id: 'p1',
    title: 'Lodha One',
    location: 'Hinjewadi',
    type: 'sale',
    status: 'active',
    price: 9000000,
    bhk: '2BHK',
  },
  {
    id: 'p2',
    title: 'Skyline Heights',
    location: 'Baner',
    type: 'sale',
    status: 'sold',
    price: 12000000,
    bhk: '3BHK',
  },
]

test.describe('bookingRag', () => {
  test('builds a readable booking knowledge pack', () => {
    const markdown = buildAgentBookingRagMarkdown(agent, properties, { selectedPropertyId: 'p1' })
    expect(markdown).toContain('Booking Knowledge Pack')
    expect(markdown).toContain('Shantanu Kulkaarni')
    expect(markdown).toContain('Office hours: 09:00 to 19:00')
    expect(markdown).toContain('Selected property')
    expect(markdown).toContain('Lodha One')
    expect(markdown).toContain('Skyline Heights')
    expect(markdown).toContain('not bookable')
  })

  test('builds a snapshot with counts and selected ids', () => {
    const snapshot = buildAgentBookingRagSnapshot(agent, properties, { selectedPropertyId: 'p2' })
    expect(snapshot.timezone).toBe('Asia/Kolkata')
    expect(snapshot.counts.active).toBe(1)
    expect(snapshot.counts.unavailable).toBe(1)
    expect(snapshot.selected_property_ids).toEqual(['p2'])
    expect(snapshot.markdown).toContain('Holiday policy: 2026-08-15')
  })
})
