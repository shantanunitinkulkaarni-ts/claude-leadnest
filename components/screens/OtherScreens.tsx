'use client'

// LeadsScreen
export function LeadsScreen({ agentId }: { agentId: string }) {
  const cols = [
    { label: 'New', count: 3, leads: [{ name: 'Rahul Kumar', prop: '3BHK · Baner', budget: '₹90L', score: 9, sc: 'hi' }, { name: 'Sunita Joshi', prop: '2BHK Rental · Kothrud', budget: '₹18K/mo', score: 6, sc: 'mid' }, { name: 'Vikram Nair', prop: 'Plot · Hinjewadi', budget: '₹40L', score: 5, sc: 'lo' }] },
    { label: 'Qualified', count: 2, leads: [{ name: 'Priya Sharma', prop: '2BHK · Wakad', budget: '₹65L', score: 8, sc: 'hi' }, { name: 'Deepak Rao', prop: '3BHK · Aundh', budget: '₹1.1Cr', score: 7, sc: 'mid' }] },
    { label: 'Visit booked', count: 2, leads: [{ name: 'Anita Desai', prop: '4BHK · Koregaon Park', budget: '₹2.2Cr', score: 9, sc: 'hi' }, { name: 'Mohammed Iqbal', prop: 'Shop · Hadapsar', budget: '₹55L', score: 8, sc: 'hi' }] },
    { label: 'Closed', count: 5, leads: [{ name: 'Kiran Patil ✓', prop: '2BHK · Baner — Won', budget: '', score: 0, sc: 'won' }, { name: 'Ravi Gupta', prop: 'Plot — Not interested', budget: '', score: 0, sc: 'lost' }] },
  ]
  const scoreStyle: Record<string, { bg: string; c: string }> = { hi: { bg: '#E8F5EE', c: '#1A6B4A' }, mid: { bg: '#FEF9E7', c: '#7A5200' }, lo: { bg: '#EEF4FC', c: '#0F3D6E' }, won: { bg: '#E8F5EE', c: '#1A6B4A' }, lost: { bg: '#F4F3EE', c: '#9E9B92' } }
  return (
    <div style={{ padding: '24px 28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 500, color: '#1A1916' }}>Lead pipeline</div>
        <button style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, background: '#1A1916', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'inherit' }}>+ Add lead</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
        {cols.map(col => (
          <div key={col.label} style={{ background: '#F4F3EE', border: '1px solid rgba(26,25,22,0.08)', borderRadius: 14, padding: 12, minHeight: 280 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 500, color: '#6B6860', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{col.label}</span>
              <span style={{ fontSize: 10, background: '#fff', border: '1px solid rgba(26,25,22,0.13)', color: '#6B6860', padding: '1px 7px', borderRadius: 10 }}>{col.count}</span>
            </div>
            {col.leads.map((lead, i) => {
              const ss = scoreStyle[lead.sc]
              return (
                <div key={i} style={{ background: '#fff', border: '1px solid rgba(26,25,22,0.08)', borderRadius: 9, padding: '11px 13px', marginBottom: 7, cursor: 'pointer', transition: 'all 0.15s' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: lead.sc === 'won' ? '#1A6B4A' : lead.sc === 'lost' ? '#9E9B92' : '#1A1916' }}>{lead.name}</div>
                    {lead.score > 0 && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, fontWeight: 500, background: ss.bg, color: ss.c }}>{lead.score}/10</span>}
                  </div>
                  <div style={{ fontSize: 11, color: '#9E9B92', marginTop: 2 }}>{lead.prop}</div>
                  {lead.budget && <div style={{ fontSize: 11, color: '#6B6860', marginTop: 4 }}>{lead.budget}</div>}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

// PropertiesScreen
export function PropertiesScreen({ agentId }: { agentId: string }) {
  const props = [
    { icon: '🏢', bg: '#EEF4FC', title: '3BHK Apartment — Baner', loc: 'Baner, Pune', price: '₹88,00,000', tags: ['Sale', '1,450 sqft', 'East facing'], status: 'Active', statusOk: true },
    { icon: '🏠', bg: '#E8F5EE', title: '2BHK Flat — Wakad', loc: 'Wakad, Pune', price: '₹62,00,000', tags: ['Sale', '1,100 sqft', '2 Parking'], status: 'Active', statusOk: true },
    { icon: '🚪', bg: '#FEF9E7', title: '2BHK Rental — Kothrud', loc: 'Kothrud, Pune', price: '₹22,000 / month', tags: ['Rental', 'Semi-furnished'], status: 'Active', statusOk: true },
    { icon: '🗺', bg: '#F4F3EE', title: 'Residential Plot — Hinjewadi', loc: 'Hinjewadi, Pune', price: '₹45,00,000', tags: ['Sale', '1,800 sqft'], status: 'Sold', statusOk: false },
  ]
  return (
    <div style={{ padding: '24px 28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 500, color: '#1A1916' }}>Properties</div>
        <button style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, background: '#1A1916', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'inherit' }}>+ Add property</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
        {props.map((p, i) => (
          <div key={i} style={{ background: '#fff', border: '1px solid rgba(26,25,22,0.08)', borderRadius: 14, overflow: 'hidden', cursor: 'pointer', opacity: p.statusOk ? 1 : 0.65, transition: 'all 0.15s' }}>
            <div style={{ height: 90, background: p.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, position: 'relative' }}>
              {p.icon}
              <span style={{ position: 'absolute', top: 8, right: 8, fontSize: 10, padding: '3px 8px', borderRadius: 20, fontWeight: 500, background: 'rgba(255,255,255,0.92)', color: p.statusOk ? '#1A6B4A' : '#6B6860', border: `1px solid ${p.statusOk ? 'rgba(46,139,95,0.2)' : 'rgba(26,25,22,0.13)'}` }}>{p.status}</span>
            </div>
            <div style={{ padding: '14px 15px' }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#1A1916', marginBottom: 2 }}>{p.title}</div>
              <div style={{ fontSize: 11, color: '#9E9B92' }}>{p.loc}</div>
              <div style={{ fontSize: 16, fontWeight: 500, color: '#1A5FA5', margin: '8px 0' }}>{p.price}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {p.tags.map(t => <span key={t} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 6, background: '#F4F3EE', color: '#6B6860', border: '1px solid rgba(26,25,22,0.08)' }}>{t}</span>)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// AppointmentsScreen
export function AppointmentsScreen({ agentId }: { agentId: string }) {
  const appts = [
    { day: '28', month: 'May', name: 'Rahul Kumar', prop: '3BHK Apartment — Baner, Pune', time: '11:00 AM · +91 98765 43210', status: 'Upcoming', statusBg: '#E8F5EE', statusC: '#1A6B4A', dateBg: '#E8F5EE', dateC: '#1A6B4A' },
    { day: '26', month: 'May', name: 'Anita Desai', prop: '4BHK — Koregaon Park, Pune', time: '3:00 PM · Result pending', status: 'Awaiting update', statusBg: '#FEF9E7', statusC: '#7A5200', dateBg: '#FEF9E7', dateC: '#7A5200' },
    { day: '22', month: 'May', name: 'Mohammed Iqbal', prop: 'Commercial Shop — Hadapsar, Pune', time: '10:00 AM', status: 'Done', statusBg: '#F4F3EE', statusC: '#9E9B92', dateBg: '#F4F3EE', dateC: '#9E9B92' },
  ]
  return (
    <div style={{ padding: '24px 28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 500, color: '#1A1916' }}>Appointments</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['Upcoming', 'All'].map(f => <button key={f} style={{ fontSize: 11, padding: '6px 12px', borderRadius: 7, border: '1px solid rgba(26,25,22,0.18)', background: '#fff', color: '#6B6860', cursor: 'pointer', fontFamily: 'inherit' }}>{f}</button>)}
        </div>
      </div>
      {appts.map((a, i) => (
        <div key={i} style={{ background: '#fff', border: '1px solid rgba(26,25,22,0.08)', borderRadius: 14, padding: '16px 18px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ textAlign: 'center', minWidth: 48, background: a.dateBg, borderRadius: 9, padding: 8, border: '1px solid rgba(26,25,22,0.08)' }}>
            <div style={{ fontSize: 22, fontWeight: 500, color: a.dateC, lineHeight: 1 }}>{a.day}</div>
            <div style={{ fontSize: 10, color: a.dateC, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{a.month}</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: '#1A1916' }}>{a.name}</div>
            <div style={{ fontSize: 12, color: '#6B6860', marginTop: 2 }}>{a.prop}</div>
            <div style={{ fontSize: 12, color: '#9E9B92', marginTop: 4 }}>🕐 {a.time}</div>
          </div>
          <span style={{ fontSize: 11, padding: '4px 12px', borderRadius: 20, fontWeight: 500, background: a.statusBg, color: a.statusC }}>{a.status}</span>
        </div>
      ))}
    </div>
  )
}

// AnalyticsScreen
export function AnalyticsScreen({ agentId }: { agentId: string }) {
  return (
    <div style={{ padding: '24px 28px' }}>
      <div style={{ fontSize: 15, fontWeight: 500, color: '#1A1916', marginBottom: 16 }}>Analytics</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
        {[{ label: 'Conversion rate', val: '6.4%', sub: 'Leads → visits' }, { label: 'Avg response time', val: '4s', sub: 'Bot handled' }, { label: 'Bot takeovers', val: '6%', sub: 'Manual override' }].map((m, i) => (
          <div key={i} style={{ background: '#fff', border: '1px solid rgba(26,25,22,0.08)', borderRadius: 14, padding: '18px 20px' }}>
            <div style={{ fontSize: 11, color: '#9E9B92', marginBottom: 6 }}>{m.label}</div>
            <div style={{ fontSize: 26, fontWeight: 500, color: '#1A1916', lineHeight: 1, marginBottom: 4 }}>{m.val}</div>
            <div style={{ fontSize: 11, color: '#9E9B92' }}>{m.sub}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {[
          { title: 'Lead sources', bars: [{ l: 'WA inbound', v: 34, max: 50, c: '#1A5FA5' }, { l: 'Referral', v: 9, max: 50, c: '#2E8B5F' }, { l: 'Manual', v: 4, max: 50, c: '#B7770D' }] },
          { title: 'Intent breakdown', bars: [{ l: 'Buy', v: 32, max: 50, c: '#1A5FA5' }, { l: 'Rent', v: 15, max: 50, c: '#2E8B5F' }] },
        ].map((card, ci) => (
          <div key={ci} style={{ background: '#fff', border: '1px solid rgba(26,25,22,0.08)', borderRadius: 14, padding: '18px 20px' }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: '#6B6860', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 14 }}>{card.title}</div>
            {card.bars.map((b, bi) => (
              <div key={bi} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: '#6B6860', width: 70 }}>{b.l}</span>
                <div style={{ flex: 1, height: 7, background: '#ECEAE0', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(b.v / b.max) * 100}%`, background: b.c, borderRadius: 4 }} />
                </div>
                <span style={{ fontSize: 11, color: '#6B6860', width: 20, textAlign: 'right' }}>{b.v}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// BalanceScreen
export function BalanceScreen({ agentId }: { agentId: string }) {
  const txns = [
    { desc: 'Top-up via UPI', date: '24 May', amount: '+₹500', credit: true },
    { desc: 'Appointment reminder — Rahul Kumar', date: '23 May', amount: '−₹0.32', credit: false },
    { desc: 'Nurture follow-up — 8 leads', date: '22 May', amount: '−₹6.16', credit: false },
    { desc: 'Re-engagement — 12 cold leads', date: '20 May', amount: '−₹9.24', credit: false },
    { desc: 'Top-up via UPI', date: '15 May', amount: '+₹200', credit: true },
  ]
  return (
    <div style={{ padding: '24px 28px', maxWidth: 580 }}>
      <div style={{ fontSize: 15, fontWeight: 500, color: '#1A1916', marginBottom: 16 }}>WhatsApp balance</div>
      <div style={{ background: '#fff', border: '1px solid rgba(26,25,22,0.08)', borderRadius: 14, padding: 24, marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: '#9E9B92' }}>Available balance</div>
        <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 42, color: '#1A1916', lineHeight: 1, margin: '4px 0' }}>₹342</div>
        <div style={{ fontSize: 12, color: '#9E9B92' }}>Used for outbound template messages · Meta charges deducted automatically</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginTop: 18 }}>
          {['+ ₹100', '+ ₹500', '+ ₹1,000'].map(a => (
            <button key={a} style={{ padding: 11, borderRadius: 9, border: '1px solid rgba(26,25,22,0.18)', background: '#F4F3EE', cursor: 'pointer', textAlign: 'center', fontSize: 13, fontWeight: 500, color: '#3D3B34', fontFamily: 'inherit', transition: 'all 0.15s' }}>{a}</button>
          ))}
        </div>
      </div>
      <div style={{ background: '#fff', border: '1px solid rgba(26,25,22,0.08)', borderRadius: 14, padding: '18px 20px' }}>
        <div style={{ fontSize: 11, fontWeight: 500, color: '#6B6860', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 }}>Transaction history</div>
        {txns.map((t, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: i < txns.length - 1 ? '1px solid rgba(26,25,22,0.06)' : 'none', fontSize: 12 }}>
            <span style={{ color: '#3D3B34' }}>{t.desc}</span>
            <span style={{ color: '#C8C5BC', fontSize: 11, margin: '0 12px' }}>{t.date}</span>
            <span style={{ fontWeight: 500, color: t.credit ? '#1A6B4A' : '#C0392B' }}>{t.amount}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// SettingsScreen
export function SettingsScreen({ agentId }: { agentId: string }) {
  return (
    <div style={{ padding: '24px 28px', maxWidth: 640 }}>
      <div style={{ fontSize: 15, fontWeight: 500, color: '#1A1916', marginBottom: 16 }}>Settings</div>
      {[
        { title: 'Business details', rows: [{ k: 'Agency name', v: 'Rajesh Properties' }, { k: 'City', v: 'Pune, Maharashtra' }, { k: 'Areas covered', v: 'Baner, Wakad, Kothrud' }, { k: 'Bot tone', v: 'Friendly' }, { k: 'Office hours', v: '9:00 AM – 7:00 PM' }, { k: 'Language', v: 'English + Hindi + Marathi' }], toggles: [] },
        { title: 'Bot controls', rows: [], toggles: [{ k: 'Bot active', v: 'Running on WhatsApp', on: true }, { k: '23h window keep-alive', v: 'Auto re-engage before window closes', on: true }, { k: 'Low balance alerts', v: 'Notify at ₹50 remaining', on: true }, { k: 'Post-visit prompts', v: 'Ask agent after each site visit', on: true }] },
        { title: 'Subscription', rows: [{ k: 'Plan', v: 'Monthly — ₹999 / month' }, { k: 'Next billing', v: '25 Jun 2026' }, { k: 'Message usage', v: '3,241 / 5,000 this month' }, { k: 'WhatsApp', v: '+91 98765 43210 — Connected ✓' }], toggles: [] },
      ].map(section => (
        <div key={section.title} style={{ background: '#fff', border: '1px solid rgba(26,25,22,0.08)', borderRadius: 14, padding: '20px 22px', marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#1A1916', marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid rgba(26,25,22,0.08)' }}>{section.title}</div>
          {section.rows.map((row, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: i < section.rows.length - 1 ? '1px solid rgba(26,25,22,0.06)' : 'none' }}>
              <span style={{ fontSize: 13, color: '#3D3B34' }}>{row.k}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 12, color: '#6B6860' }}>{row.v}</span>
                <span style={{ fontSize: 11, color: '#1A5FA5', cursor: 'pointer', fontWeight: 500 }}>Edit</span>
              </div>
            </div>
          ))}
          {section.toggles.map((row, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: i < section.toggles.length - 1 ? '1px solid rgba(26,25,22,0.06)' : 'none' }}>
              <div>
                <div style={{ fontSize: 13, color: '#3D3B34' }}>{row.k}</div>
                <div style={{ fontSize: 11, color: '#9E9B92', marginTop: 1 }}>{row.v}</div>
              </div>
              <div style={{ width: 36, height: 20, borderRadius: 20, background: row.on ? '#2E8B5F' : '#ECEAE0', position: 'relative', cursor: 'pointer', flexShrink: 0, transition: 'background 0.2s', border: `1px solid ${row.on ? '#2E8B5F' : 'rgba(26,25,22,0.18)'}` }}>
                <div style={{ position: 'absolute', width: 14, height: 14, borderRadius: '50%', background: '#fff', top: 2, left: row.on ? 18 : 2, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }} />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
