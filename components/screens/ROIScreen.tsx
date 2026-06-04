'use client'
import { useState, useEffect } from 'react'

const G = {
  bg: '#FAFAF7',
  card: '#FFFFFF',
  border: '#E8E5DF',
  text: '#1A1916',
  muted: '#6B6860',
  green: '#2E8B5F',
  greenLight: '#EBF5EE',
  gold: '#B8955A',
  goldLight: '#FBF5EA',
  blue: '#2563EB',
  blueLight: '#EFF6FF',
  red: '#DC2626',
  redLight: '#FEF2F2',
  purple: '#7C3AED',
  purpleLight: '#F5F3FF',
  amber: '#D97706',
  amberLight: '#FFFBEB',
}

function fmt(n: number) {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`
  if (n >= 1000) return `₹${(n / 1000).toFixed(0)}K`
  return `₹${n.toFixed(0)}`
}

function Card({ children, style }: any) {
  return <div style={{ background: G.card, border: `1px solid ${G.border}`, borderRadius: 12, ...style }}>{children}</div>
}

function Metric({ label, value, sub, color, icon, trend }: any) {
  return (
    <Card style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 11, color: G.muted, fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8 }}>{label}</div>
          <div style={{ fontSize: 28, fontWeight: 600, color: color || G.text, letterSpacing: '-0.02em' }}>{value}</div>
          {sub && <div style={{ fontSize: 12, color: G.muted, marginTop: 4 }}>{sub}</div>}
          {trend !== undefined && (
            <div style={{ fontSize: 11, color: trend >= 0 ? G.green : G.red, marginTop: 4, fontWeight: 500 }}>
              {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}% vs last period
            </div>
          )}
        </div>
        <div style={{ fontSize: 24 }}>{icon}</div>
      </div>
    </Card>
  )
}

function FunnelBar({ stage, count, pct, color, maxCount }: any) {
  const width = maxCount > 0 ? (count / maxCount) * 100 : pct
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: 12, color: G.text, fontWeight: 500 }}>{stage}</span>
        <span style={{ fontSize: 12, color: G.muted }}>{count} leads · {pct}%</span>
      </div>
      <div style={{ height: 8, background: G.border, borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${width}%`, background: color, borderRadius: 4, transition: 'width 0.8s ease' }} />
      </div>
    </div>
  )
}

function MiniChart({ data }: { data: { label: string; leads: number }[] }) {
  if (!data || data.length === 0) return null
  const max = Math.max(...data.map(d => d.leads), 1)
  const show = data.slice(-14) // last 14 days

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 60, paddingTop: 4 }}>
      {show.map((d, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <div style={{ width: '100%', background: d.leads > 0 ? G.green : G.border, borderRadius: '2px 2px 0 0', height: `${Math.max((d.leads / max) * 52, d.leads > 0 ? 4 : 2)}px`, transition: 'height 0.5s ease' }} />
        </div>
      ))}
    </div>
  )
}

function ConversionStep({ label, value, from, to }: any) {
  const pct = parseFloat(value) || 0
  const color = pct >= 30 ? G.green : pct >= 15 ? G.amber : G.red
  return (
    <div style={{ textAlign: 'center', flex: 1 }}>
      <div style={{ fontSize: 22, fontWeight: 700, color, letterSpacing: '-0.02em' }}>{value}%</div>
      <div style={{ fontSize: 10, color: G.muted, marginTop: 2, lineHeight: 1.4 }}>{from} → {to}</div>
    </div>
  )
}

export function ROIScreen({ agentId }: { agentId: string }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState(30)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/roi?agent_id=${agentId}&period=${period}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [agentId, period])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 12 }}>
      <div style={{ width: 32, height: 32, border: `3px solid ${G.border}`, borderTopColor: G.green, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <div style={{ fontSize: 13, color: G.muted }}>Computing your ROI...</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  if (!data) return <div style={{ padding: 32, color: G.muted }}>Failed to load ROI data.</div>

  const { summary, conversion, roi, bot, leakage, charts, activity, agent } = data

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 600, color: G.text, letterSpacing: '-0.02em' }}>ROI Dashboard</div>
          <div style={{ fontSize: 13, color: G.muted, marginTop: 3 }}>{agent?.agency} · Performance analytics</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[7, 30, 90].map(d => (
            <button key={d} onClick={() => setPeriod(d)} style={{ padding: '6px 14px', borderRadius: 8, border: `1px solid ${period === d ? G.green : G.border}`, background: period === d ? G.greenLight : G.card, color: period === d ? G.green : G.muted, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
              {d === 7 ? '7D' : d === 30 ? '30D' : '90D'}
            </button>
          ))}
        </div>
      </div>

      {/* ROI Hero Banner */}
      <div style={{ background: 'linear-gradient(135deg, #1A1916 0%, #2E3B2E 100%)', borderRadius: 16, padding: '28px 32px', marginBottom: 24, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', width: 300, height: 300, background: 'radial-gradient(circle, rgba(46,139,95,0.2) 0%, transparent 70%)', top: -80, right: -50 }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Estimated Commission Generated — Last {period} Days</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 48, fontWeight: 700, color: '#fff', letterSpacing: '-0.03em' }}>{fmt(roi.periodCommission)}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', textDecoration: 'line-through' }}>vs ₹0 without LeadNest</div>
              <div style={{ fontSize: 13, color: '#4DB88A', fontWeight: 500 }}>
                {roi.roiMultiple > 0 ? `${roi.roiMultiple}x return` : 'ROI builds with leads'} on ₹{agent?.planCost}/month
              </div>
            </div>
          </div>
          <div style={{ marginTop: 16, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>Deals Closed</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: '#fff' }}>{summary.dealsClosedPeriod}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>Visits Booked</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: '#fff' }}>{summary.visitsBooked}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>Bot Handled</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: '#fff' }}>{bot.botHandledPct}%</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>Total Commission (All Time)</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: '#B8955A' }}>{fmt(roi.totalCommission)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Metrics row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <Metric label="Total Leads" value={summary.totalLeads} sub={`${summary.hotLeads} hot · ${summary.warmLeads} warm`} icon="👥" trend={parseInt(summary.leadGrowth)} />
        <Metric label="Qualified" value={summary.qualifiedLeads} sub={`${conversion.leadToQualified}% conversion`} icon="✅" color={G.green} />
        <Metric label="Bot Messages" value={bot.totalMessages.toLocaleString()} sub={`${bot.botHandledPct}% automated`} icon="🤖" color={G.blue} />
        <Metric label="Lead Leakage" value={`${leakage.leakagePct}%`} sub={`${leakage.leakageCount} leads at risk`} icon="⚠️" color={leakage.leakagePct > 40 ? G.red : G.amber} />
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, marginBottom: 24 }}>
        {/* Daily leads chart */}
        <Card style={{ padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: G.text }}>Daily Lead Volume</div>
              <div style={{ fontSize: 12, color: G.muted }}>Last {Math.min(period, 14)} days</div>
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: G.green }}>{summary.totalLeads}</div>
          </div>
          <MiniChart data={charts.daily} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
            <span style={{ fontSize: 10, color: G.muted }}>{charts.daily[0]?.label}</span>
            <span style={{ fontSize: 10, color: G.muted }}>{charts.daily[charts.daily.length - 1]?.label}</span>
          </div>
        </Card>

        {/* Conversion funnel */}
        <Card style={{ padding: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: G.text, marginBottom: 4 }}>Conversion Funnel</div>
          <div style={{ fontSize: 12, color: G.muted, marginBottom: 16 }}>Lead → Deal pipeline</div>
          {charts.funnel.map((f: any) => (
            <FunnelBar key={f.stage} {...f} maxCount={summary.totalLeads} />
          ))}
        </Card>
      </div>

      {/* Conversion rates + Bot performance */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <Card style={{ padding: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: G.text, marginBottom: 4 }}>Conversion Rates</div>
          <div style={{ fontSize: 12, color: G.muted, marginBottom: 20 }}>At each stage of your pipeline</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <ConversionStep label="Engage" value={conversion.leadToQualified} from="Lead" to="Qualified" />
            <div style={{ width: 1, background: G.border }} />
            <ConversionStep label="Visit" value={conversion.qualifiedToVisit} from="Qualified" to="Visit" />
            <div style={{ width: 1, background: G.border }} />
            <ConversionStep label="Close" value={conversion.visitToDeal} from="Visit" to="Deal" />
            <div style={{ width: 1, background: G.border }} />
            <ConversionStep label="Overall" value={conversion.overallConversion} from="Lead" to="Deal" />
          </div>
        </Card>

        <Card style={{ padding: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: G.text, marginBottom: 4 }}>Bot Performance</div>
          <div style={{ fontSize: 12, color: G.muted, marginBottom: 16 }}>Automation saving you time</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: G.muted }}>Messages automated</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: G.text }}>{bot.botHandledPct}%</span>
              </div>
              <div style={{ height: 6, background: G.border, borderRadius: 3 }}>
                <div style={{ height: '100%', width: `${bot.botHandledPct}%`, background: G.green, borderRadius: 3 }} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ background: G.greenLight, borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: G.green }}>{bot.botMessages.toLocaleString()}</div>
                <div style={{ fontSize: 11, color: G.green, marginTop: 2 }}>Bot replies</div>
              </div>
              <div style={{ background: G.blueLight, borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: G.blue }}>{(bot.totalMessages - bot.botMessages).toLocaleString()}</div>
                <div style={{ fontSize: 11, color: G.blue, marginTop: 2 }}>Manual replies</div>
              </div>
            </div>
            <div style={{ fontSize: 11, color: G.muted, background: G.bg, borderRadius: 8, padding: '8px 12px' }}>
              ⏱ Avg response time: &lt;30 seconds (bot) vs 2-4 hours (manual)
            </div>
          </div>
        </Card>
      </div>

      {/* Lead leakage + Activity */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 16, marginBottom: 24 }}>
        <Card style={{ padding: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: G.text, marginBottom: 4 }}>Lead Leakage Analysis</div>
          <div style={{ fontSize: 12, color: G.muted, marginBottom: 16 }}>Leads at risk of being lost</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: leakage.coldLeadsCount > 0 ? G.amberLight : G.bg, borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ fontSize: 12, color: G.text }}>🧊 Cold leads (no response)</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: G.amber }}>{leakage.coldLeadsCount}</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: leakage.lostLeads > 0 ? G.redLight : G.bg, borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ fontSize: 12, color: G.text }}>❌ Marked as lost</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: G.red }}>{leakage.lostLeads}</div>
            </div>
            <div style={{ background: G.greenLight, borderRadius: 8, padding: '12px 14px', marginTop: 4 }}>
              <div style={{ fontSize: 11, color: G.green, fontWeight: 500, marginBottom: 3 }}>💡 Potential revenue at risk</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: G.green }}>
                {fmt(leakage.leakageCount * 112500)}
              </div>
              <div style={{ fontSize: 10, color: G.green, marginTop: 2 }}>If even 10% of cold leads close</div>
            </div>
          </div>
        </Card>

        <Card style={{ padding: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: G.text, marginBottom: 16 }}>Recent Activity</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 220, overflowY: 'auto' }}>
            {activity.length === 0 && <div style={{ fontSize: 12, color: G.muted }}>No activity yet</div>}
            {activity.map((a: any) => (
              <div key={a.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: G.greenLight, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}>
                  {a.type === 'lead_created' ? '👤' : a.type === 'score_updated' ? '📊' : a.type === 'visit_booked' ? '📅' : '✅'}
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: G.text }}>{a.title}</div>
                  {a.description && <div style={{ fontSize: 11, color: G.muted, marginTop: 1 }}>{a.description}</div>}
                  <div style={{ fontSize: 10, color: G.muted, marginTop: 2 }}>{new Date(a.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Bottom: Plan vs ROI */}
      <Card style={{ padding: 24, background: 'linear-gradient(135deg, #F0FDF4, #FAFAF7)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: G.text }}>Your Investment vs Return</div>
            <div style={{ fontSize: 12, color: G.muted, marginTop: 2 }}>LeadNest {agent?.plan} plan</div>
          </div>
          <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: G.muted }}>You Pay</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: G.red }}>₹{agent?.planCost}/mo</div>
            </div>
            <div style={{ fontSize: 28, color: G.muted, alignSelf: 'center' }}>→</div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: G.muted }}>You Earned</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: G.green }}>{fmt(roi.periodCommission)}</div>
            </div>
            <div style={{ fontSize: 28, color: G.muted, alignSelf: 'center' }}>=</div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: G.muted }}>Your ROI</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: G.green }}>{roi.roiMultiple > 0 ? `${roi.roiMultiple}x` : '—'}</div>
            </div>
          </div>
        </div>
      </Card>

    </div>
  )
}
