'use client'
import { useState, useEffect } from 'react'
import ConnectWhatsAppButton from '@/components/ConnectWhatsAppButton'
import { getSupabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import './onboarding.css'

export default function OnboardingPage() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(0)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [consentGiven, setConsentGiven] = useState(false)
  const [error, setError] = useState('')

  // Step 1: Account (now handled mostly by Google)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')

  // Step 2: Business
  const [phone, setPhone] = useState('') // Moved phone to Business step
  const [agencyName, setAgencyName] = useState('')
  const [city, setCity] = useState('')
  const [stateLoc, setStateLoc] = useState('Maharashtra')
  const [areas, setAreas] = useState<string[]>([])
  const [yearsInBusiness, setYearsInBusiness] = useState('1 – 3 years')

  // Step 3: Preferences
  const [propertyTypes, setPropertyTypes] = useState<string[]>(['residential_sale', 'residential_rental'])
  const [botTone, setBotTone] = useState('friendly')
  const [botLanguage, setBotLanguage] = useState<string[]>(['english'])
  const [officeOpen, setOfficeOpen] = useState('09:00')
  const [officeClose, setOfficeClose] = useState('19:00')
  const [weeklyOff, setWeeklyOff] = useState('')

  // Step 4: WhatsApp
  const [waStatus, setWaStatus] = useState('Pending')
  const [agentId, setAgentId] = useState('') // the new agent's id, for Embedded Signup

  const [authMethod, setAuthMethod] = useState<'google' | 'email' | 'phone'>('email')
  const [signupPassword, setSignupPassword] = useState('')
  const [otpToken, setOtpToken] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [phoneSignup, setPhoneSignup] = useState('')

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsSubmitting(true)
    try {
      const supabase = getSupabase()
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password: signupPassword,
        options: { data: { full_name: `${firstName} ${lastName}`.trim() } }
      })
      if (signUpError) throw signUpError

      // Try immediate sign-in (works if email confirmation is disabled in Supabase)
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: signupPassword
      })

      if (signInError) {
        // Email confirmation is required — tell user to confirm then come back
        setError('Account created! Please check your email inbox to confirm your account, then come back and log in to complete setup.')
        return
      }

      setCurrentStep(1)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSendOtpSignup = async () => {
    setError('')
    if (!phoneSignup || !firstName) { setError('Name and phone number are required'); return; }
    setIsSubmitting(true)
    try {
      const supabase = getSupabase()
      const { error } = await supabase.auth.signInWithOtp({ 
        phone: phoneSignup,
        options: { data: { full_name: `${firstName} ${lastName}`.trim() } }
      })
      if (error) throw error
      setOtpSent(true)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleVerifyOtpSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!otpToken) return
    setIsSubmitting(true)
    try {
      const supabase = getSupabase()
      const { error } = await supabase.auth.verifyOtp({ phone: phoneSignup, token: otpToken, type: 'sms' })
      if (error) throw error
      setPhone(phoneSignup)
      setCurrentStep(1)
    } catch (err: any) {
      setError(err.message)
      setIsSubmitting(false)
    }
  }

  const headers = [
    ['Create your account', "Let's get you set up in under 5 minutes"],
    ['Your business details', 'Tell us about your agency'],
    ['Bot preferences', 'How should your assistant behave?'],
    ['Connect WhatsApp', 'Link your business number to go live'],
    ["You're live!", 'Convorian is now active on your WhatsApp']
  ]
  const progVals = [20, 40, 60, 80, 100]

  const toggleArrayItem = (arr: string[], setArr: any, item: string) => {
    if (arr.includes(item)) setArr(arr.filter((i) => i !== item))
    else setArr([...arr, item])
  }

  useEffect(() => {
    const supabase = getSupabase()
    
    const checkAuthAndRoute = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        setIsAuthenticated(true)
        // Pre-fill data from Google is removed per user request

        // Only auto-route them if they are on Step 0 (just landed from Google Auth)
        if (currentStep === 0) {
          const { data: teamMember } = await supabase
            .from('team_members')
            .select('agent_id')
            .eq('auth_user_id', session.user.id)
            .single()
            
          if (teamMember) {
            router.push('/dashboard')
          } else {
            setCurrentStep(1)
          }
        }
      }
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN') checkAuthAndRoute()
    })

    checkAuthAndRoute()
    
    return () => subscription.unsubscribe()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  const handleGoogleAuth = async () => {
    setError('')
    setIsSubmitting(true)
    try {
      const supabase = getSupabase()
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/auth/callback?next=/onboarding` : undefined
        }
      })
      if (error) throw error
    } catch (err: any) {
      setError(err.message)
      setIsSubmitting(false)
    }
  }

  const handleSaveProfile = async () => {
    setError('')
    if (!agencyName || !city) {
      setError('Agency name and city are required.')
      return
    }
    if (!consentGiven) {
      setError('Please accept the Terms of Service and Privacy Policy to continue.')
      return
    }
    setIsSubmitting(true)
    try {
      const supabase = getSupabase()
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) throw new Error('Not authenticated. Please start over.')

      const userMeta = userData.user.user_metadata || {}
      const finalEmail = email || userData.user.email || ''
      const finalName = (firstName || lastName) ? `${firstName} ${lastName}`.trim() : (userMeta.full_name || userMeta.name || 'Agent')
      const finalPhone = phone || userMeta.phone || ''

      // Free-forever tier: no expiry, 100-message AI allowance, 10 leads / 5
      // properties (see lib/planLimits). WhatsApp charges are billed by Meta
      // directly (Model A) — no in-app wallet.
      const nowIso = new Date().toISOString()

      // Insert into agents (Workspace)
      const { data: agentDataRaw, error: agentError } = await supabase.from('agents').insert({
        email: finalEmail,
        name: finalName,
        phone: finalPhone,
        agency_name: agencyName,
        city,
        state: stateLoc,
        areas,
        property_types: propertyTypes,
        bot_tone: botTone,
        languages: botLanguage,
        office_open: officeOpen,
        office_close: officeClose,
        weekly_off: weeklyOff,
        bot_active: true,
        messages_limit: 100,
        plan: 'free',
        plan_status: 'free',
        plan_started_at: nowIso,
        consent_terms: true,
        consent_marketing: true,
        consent_at: nowIso
      }).select().single()

      if (agentError) throw agentError
      const agentData = agentDataRaw as any
      setAgentId(agentData.id) // make the agent id available to the Connect-WhatsApp step

      // Insert into team_members (User)
      const { error: teamError } = await supabase.from('team_members').insert({
        agent_id: agentData.id,
        auth_user_id: userData.user.id,
        role: 'owner',
        name: finalName,
        email: finalEmail,
        phone: finalPhone
      })

      if (teamError) throw teamError

      setCurrentStep(3)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleConnectWA = async () => {
    // The number isn't auto-connected — our team activates it on the WhatsApp
    // provider within 24h. Submit the request + alert the team, then proceed.
    setWaStatus('Submitting...')
    try {
      await fetch('/api/notify-signup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agency_name: agencyName,
          name: `${firstName} ${lastName}`.trim(),
          phone: phone,
          email: email,
        }),
      })
    } catch { /* never block onboarding on a failed alert */ }
    setWaStatus('Requested')
    setTimeout(() => setCurrentStep(4), 600)
  }

  return (
    <div className="onboarding-app">
      <div className="sidebar">
        <div className="sidebar-bg"></div>
        <div className="sidebar-inner">
          <div className="logo-area">
            <div className="logo-mark">
              <div className="logo-dot">
                <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
              </div>
              <span className="logo-name">Convorian</span>
            </div>
          </div>

          <div className="onboard-headline">Set up your<br/><em>lead machine</em></div>
          <div className="onboard-sub">5 quick steps and your WhatsApp starts working for you — automatically.</div>

          <div className="steps">
            {[
              { label: 'Create your account', desc: 'Name, email and password' },
              { label: 'Business details', desc: 'Agency name, city, areas' },
              { label: 'Your preferences', desc: 'Property types, tone, hours' },
              { label: 'Connect WhatsApp', desc: 'Link your business number' },
              { label: 'Go live', desc: 'Your bot is ready' }
            ].map((s, i) => (
              <div key={i} className={`step-item ${i === currentStep ? 'active' : ''} ${i < currentStep ? 'done' : ''}`}>
                <div className={`step-number ${i === currentStep ? 'active' : ''} ${i < currentStep ? 'done' : ''}`}>
                  {i < currentStep ? '✓' : i + 1}
                </div>
                <div className="step-text">
                  <div className="step-label">{s.label}</div>
                  <div className="step-desc">{s.desc}</div>
                </div>
              </div>
            ))}
          </div>

          <div>
            <div className="progress-bar"><div className="progress-fill" style={{ width: `${progVals[currentStep]}%` }}></div></div>
            <div className="progress-label"><span>Step {currentStep + 1} of 5</span><span>{progVals[currentStep]}%</span></div>
            <div style={{ marginTop: 24, textAlign: 'center' }}>
              <button onClick={async () => {
                await getSupabase().auth.signOut()
                router.push('/login')
              }} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}>
                Sign out & Start over
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="main">
        <div className="main-header">
          <div>
            <div className="main-header-title">{headers[currentStep][0]}</div>
            <div className="main-header-sub">{headers[currentStep][1]}</div>
          </div>
        </div>

        <div className="main-content">
          {error && <div style={{ background: '#FDF0F0', color: '#C0392B', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 20 }}>{error}</div>}

          {currentStep === 0 && (
            <div className="form-card" style={{ padding: '40px 32px' }}>
              {isAuthenticated ? (
                <div style={{ textAlign: 'center' }}>
                  <div className="form-card-icon" style={{ background: '#EEF0FE', margin: '0 auto 16px' }}>✅</div>
                  <div className="form-card-title" style={{ fontSize: 24, marginBottom: 8 }}>Account Connected</div>
                  <div className="form-card-desc" style={{ marginBottom: 32 }}>You are signed in as <strong style={{ color: 'var(--ink)' }}>{email}</strong>.</div>
                  <button className="btn-next" style={{ width: '100%' }} onClick={() => setCurrentStep(1)}>
                    Continue to Business Details
                  </button>
                </div>
              ) : (
                <>
                  <div style={{ textAlign: 'center', marginBottom: 32 }}>
                    <div className="form-card-icon" style={{ background: '#EEF2FF', margin: '0 auto 16px' }}>🚀</div>
                    <div className="form-card-title" style={{ fontSize: 24 }}>Welcome to Convorian</div>
                    <div className="form-card-desc">Create your account to set up your WhatsApp AI assistant.</div>
                  </div>
              
              <div style={{ display: 'flex', gap: 10, marginBottom: 24, borderBottom: '1px solid rgba(26,25,22,0.1)' }}>
                <button onClick={() => { setAuthMethod('google'); setError(''); setOtpSent(false); }} style={{ flex: 1, padding: '10px', background: 'transparent', border: 'none', borderBottom: authMethod === 'google' ? '2px solid var(--ink)' : '2px solid transparent', color: authMethod === 'google' ? 'var(--ink)' : 'var(--ink-4)', fontWeight: authMethod === 'google' ? 500 : 400, cursor: 'pointer', transition: 'all 0.2s' }}>Google</button>
                <button onClick={() => { setAuthMethod('email'); setError(''); setOtpSent(false); }} style={{ flex: 1, padding: '10px', background: 'transparent', border: 'none', borderBottom: authMethod === 'email' ? '2px solid var(--ink)' : '2px solid transparent', color: authMethod === 'email' ? 'var(--ink)' : 'var(--ink-4)', fontWeight: authMethod === 'email' ? 500 : 400, cursor: 'pointer', transition: 'all 0.2s' }}>Email</button>
                <button onClick={() => { setAuthMethod('phone'); setError(''); setOtpSent(false); }} style={{ flex: 1, padding: '10px', background: 'transparent', border: 'none', borderBottom: authMethod === 'phone' ? '2px solid var(--ink)' : '2px solid transparent', color: authMethod === 'phone' ? 'var(--ink)' : 'var(--ink-4)', fontWeight: authMethod === 'phone' ? 500 : 400, cursor: 'pointer', transition: 'all 0.2s' }}>Phone OTP</button>
              </div>

              {authMethod === 'google' && (
                <button 
                  className="btn-next" 
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, background: '#fff', color: '#15161B', border: '1px solid rgba(26,25,22,0.2)', height: 48, cursor: 'pointer' }} 
                  disabled={isSubmitting} 
                  onClick={handleGoogleAuth}
                >
                  <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.7 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
                  {isSubmitting ? 'Connecting...' : 'Sign up with Google'}
                </button>
              )}

              {authMethod === 'email' && (
                <form onSubmit={handleEmailSignup} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 13, marginBottom: 6, color: 'var(--ink-2)' }}>First Name</label>
                      <input required type="text" value={firstName} onChange={e => setFirstName(e.target.value)} style={{ width: '100%', padding: '12px 14px', borderRadius: 8, border: '1px solid rgba(26,25,22,0.18)', fontSize: 14, fontFamily: 'inherit', outline: 'none' }} placeholder="John" />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 13, marginBottom: 6, color: 'var(--ink-2)' }}>Last Name</label>
                      <input required type="text" value={lastName} onChange={e => setLastName(e.target.value)} style={{ width: '100%', padding: '12px 14px', borderRadius: 8, border: '1px solid rgba(26,25,22,0.18)', fontSize: 14, fontFamily: 'inherit', outline: 'none' }} placeholder="Doe" />
                    </div>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, marginBottom: 6, color: 'var(--ink-2)' }}>Email Address</label>
                    <input required type="email" value={email} onChange={e => setEmail(e.target.value)} style={{ width: '100%', padding: '12px 14px', borderRadius: 8, border: '1px solid rgba(26,25,22,0.18)', fontSize: 14, fontFamily: 'inherit', outline: 'none' }} placeholder="you@agency.com" />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, marginBottom: 6, color: 'var(--ink-2)' }}>Password</label>
                    <input required type="password" value={signupPassword} onChange={e => setSignupPassword(e.target.value)} style={{ width: '100%', padding: '12px 14px', borderRadius: 8, border: '1px solid rgba(26,25,22,0.18)', fontSize: 14, fontFamily: 'inherit', outline: 'none' }} placeholder="••••••••" />
                  </div>
                  <button type="submit" className="btn-next" style={{ width: '100%', marginTop: 8 }} disabled={isSubmitting}>
                    {isSubmitting ? 'Creating account...' : 'Create Account'}
                  </button>
                </form>
              )}

              {authMethod === 'phone' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {!otpSent ? (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div>
                          <label style={{ display: 'block', fontSize: 13, marginBottom: 6, color: 'var(--ink-2)' }}>First Name</label>
                          <input required type="text" value={firstName} onChange={e => setFirstName(e.target.value)} style={{ width: '100%', padding: '12px 14px', borderRadius: 8, border: '1px solid rgba(26,25,22,0.18)', fontSize: 14, fontFamily: 'inherit', outline: 'none' }} placeholder="John" />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 13, marginBottom: 6, color: 'var(--ink-2)' }}>Last Name</label>
                          <input required type="text" value={lastName} onChange={e => setLastName(e.target.value)} style={{ width: '100%', padding: '12px 14px', borderRadius: 8, border: '1px solid rgba(26,25,22,0.18)', fontSize: 14, fontFamily: 'inherit', outline: 'none' }} placeholder="Doe" />
                        </div>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 13, marginBottom: 6, color: 'var(--ink-2)' }}>Phone Number (with country code)</label>
                        <input required type="tel" value={phoneSignup} onChange={e => setPhoneSignup(e.target.value)} style={{ width: '100%', padding: '12px 14px', borderRadius: 8, border: '1px solid rgba(26,25,22,0.18)', fontSize: 14, fontFamily: 'inherit', outline: 'none' }} placeholder="+91 9000000000" />
                      </div>
                      <button onClick={handleSendOtpSignup} className="btn-next" style={{ width: '100%', marginTop: 8 }} disabled={isSubmitting || !phoneSignup}>
                        {isSubmitting ? 'Sending...' : 'Send OTP'}
                      </button>
                    </>
                  ) : (
                    <form onSubmit={handleVerifyOtpSignup} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: 13, marginBottom: 6, color: 'var(--ink-2)' }}>Enter 6-digit OTP sent to {phoneSignup}</label>
                        <input required type="text" value={otpToken} onChange={e => setOtpToken(e.target.value)} style={{ width: '100%', padding: '12px 14px', borderRadius: 8, border: '1px solid rgba(26,25,22,0.18)', fontSize: 14, fontFamily: 'inherit', outline: 'none', letterSpacing: '2px' }} placeholder="123456" />
                      </div>
                      <button type="submit" className="btn-next" style={{ width: '100%', marginTop: 8 }} disabled={isSubmitting || !otpToken}>
                        {isSubmitting ? 'Verifying...' : 'Verify & Continue'}
                      </button>
                      <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--ink-4)', marginTop: 8 }}>
                        <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => { setOtpSent(false); setOtpToken(''); }}>Change phone number</span>
                      </div>
                    </form>
                  )}
                </div>
              )}

                  <div style={{ marginTop: 24, fontSize: 13, color: 'var(--ink-4)', textAlign: 'center' }}>
                    Already have an account? <span style={{ color: 'var(--green)', cursor: 'pointer', fontWeight: 500 }} onClick={() => router.push('/login')}>Sign in</span>
                  </div>
                </>
              )}
            </div>
          )}

          {currentStep === 1 && (
            <div className="form-card">
              <div className="form-card-header">
                <div className="form-card-icon" style={{ background: '#EEF0FE' }}>🏢</div>
                <div>
                  <div className="form-card-title">Your business</div>
                  <div className="form-card-desc">This helps the bot introduce itself correctly to your leads</div>
                </div>
              </div>
              <div className="form-body">
                <div className="field">
                  <label className="field-label">Agency / business name</label>
                  <input className="field-input" type="text" placeholder="Rajesh Properties" value={agencyName} onChange={e => setAgencyName(e.target.value)} />
                </div>
                <div className="field">
                  <label className="field-label">Business Phone Number</label>
                  <input className="field-input" type="tel" placeholder="+91 98765 43210" value={phone} onChange={e => setPhone(e.target.value)} />
                </div>
                <div className="field-row">
                  <div className="field">
                    <label className="field-label">City</label>
                    <input className="field-input" type="text" placeholder="Pune" value={city} onChange={e => setCity(e.target.value)} />
                  </div>
                  <div className="field">
                    <label className="field-label">State</label>
                    <select className="field-select" value={stateLoc} onChange={e => setStateLoc(e.target.value)}>
                      <option>Maharashtra</option>
                      <option>Karnataka</option>
                      <option>Gujarat</option>
                    </select>
                  </div>
                </div>
                <div className="field">
                  <label className="field-label">Areas you cover</label>
                  <div className="tag-select" style={{ marginBottom: 12 }}>
                    {areas.map(area => (
                      <span key={area} className="tag-opt sel" onClick={() => setAreas(areas.filter(a => a !== area))}>{area} ✕</span>
                    ))}
                  </div>
                  <input 
                    className="field-input" 
                    type="text" 
                    placeholder="Type an area and press Enter..." 
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const val = e.currentTarget.value.trim();
                        if (val && !areas.includes(val)) {
                          setAreas([...areas, val]);
                        }
                        e.currentTarget.value = '';
                      }
                    }} 
                  />
                  <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 6 }}>Press Enter to add an area</div>
                </div>
              </div>
              <div className="form-footer">
                <button className="btn-back" onClick={() => setCurrentStep(0)}>← Back</button>
                <button className="btn-next" onClick={() => setCurrentStep(2)}>Continue</button>
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="form-card">
               <div className="form-card-header">
                <div className="form-card-icon" style={{ background: '#FDF6EC' }}>⚙️</div>
                <div>
                  <div className="form-card-title">Bot preferences</div>
                  <div className="form-card-desc">How should your AI assistant behave with your leads?</div>
                </div>
              </div>
              <div className="form-body">
                <div className="field">
                  <label className="field-label">Property types</label>
                  <div className="tag-select">
                    {['residential_sale', 'residential_rental', 'commercial_sale'].map(pt => (
                      <span key={pt} className={`tag-opt ${propertyTypes.includes(pt) ? 'sel' : ''}`} onClick={() => toggleArrayItem(propertyTypes, setPropertyTypes, pt)}>{pt}</span>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <label className="field-label">Bot communication tone</label>
                  <div className="tone-grid">
                    {[
                      { id: 'professional', icon: '🤝', name: 'Professional' },
                      { id: 'friendly', icon: '😊', name: 'Friendly' },
                      { id: 'concise', icon: '⚡', name: 'Concise' }
                    ].map(t => (
                      <div key={t.id} className={`tone-card ${botTone === t.id ? 'sel' : ''}`} onClick={() => setBotTone(t.id)}>
                        <div className="tone-icon">{t.icon}</div>
                        <div className="tone-name">{t.name}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <label className="field-label">Weekly day off (optional)</label>
                  <select
                    value={weeklyOff}
                    onChange={e => setWeeklyOff(e.target.value)}
                    style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '1px solid var(--border, rgba(26,25,22,0.18))', fontSize: 14, fontFamily: 'inherit', outline: 'none', background: '#fff' }}
                  >
                    <option value="">No weekly off (open every day)</option>
                    {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(day => (
                      <option key={day} value={day}>{day}</option>
                    ))}
                  </select>
                  <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 6, lineHeight: 1.5 }}>The bot won&apos;t book site visits on this day.</div>
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, margin: '20px 0 4px', fontSize: 13, color: 'var(--ink-2, #4A4843)', lineHeight: 1.5, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={consentGiven}
                  onChange={e => setConsentGiven(e.target.checked)}
                  style={{ marginTop: 2, width: 16, height: 16, flexShrink: 0, cursor: 'pointer' }}
                />
                <span>
                  I agree to Convorian&apos;s <a href="/terms-of-service" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--green, #4F46E5)', textDecoration: 'underline' }}>Terms of Service</a> and <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--green, #4F46E5)', textDecoration: 'underline' }}>Privacy Policy</a>, and consent to receive product updates, tips and offers from Convorian on WhatsApp and email. You can opt out anytime.
                </span>
              </label>
              <div className="form-footer">
                <button className="btn-back" onClick={() => setCurrentStep(1)}>← Back</button>
                <button className="btn-next" disabled={isSubmitting || !consentGiven} onClick={handleSaveProfile}>{isSubmitting ? 'Saving...' : 'Continue'}</button>
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="whatsapp-connect">
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid var(--border)' }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: '#E7F8EE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--ink)', marginBottom: 3 }}>Connect your WhatsApp</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.5 }}>Tap Connect, log in with Facebook, and choose the WhatsApp number for your assistant. It goes live in about a minute — no waiting.</div>
                </div>
              </div>
              <div className="wa-number-display">
                <div className="wa-number-text">
                  <div className="wa-number-label">Your WhatsApp number</div>
                  <div className="wa-number-val">{phone || '+91 -'}</div>
                </div>
                <span className={`wa-status ${(waStatus === 'Requested' || waStatus === 'Submitting...') ? 'connected' : ''}`}>{waStatus === 'Requested' ? 'Submitted ✓' : waStatus === 'Submitting...' ? 'Submitting…' : 'Pending'}</span>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)', lineHeight: 1.6, marginTop: 14, background: '#F4F8FD', border: '1px solid rgba(26,95,165,0.12)', borderRadius: 8, padding: '10px 12px' }}>
                ℹ️ Tip: if you want to keep using WhatsApp normally on your current number, give us a separate number for the assistant — a number on the AI can&apos;t also be used in the WhatsApp app.
              </div>
              <div style={{ marginTop: 20 }}>
                <ConnectWhatsAppButton
                  agentId={agentId}
                  onConnected={() => handleConnectWA()}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
                <button className="btn-back" onClick={() => setCurrentStep(2)}>← Back</button>
                <button className="btn-back" onClick={() => setCurrentStep(4)} style={{ border: '1px solid rgba(26,25,22,0.1)' }}>Skip for now</button>
              </div>
            </div>
          )}

          {currentStep === 4 && (
            <div className="complete-card">
              <div className="complete-icon">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <div className="complete-title">You're all set, {firstName}!</div>
              <div className="complete-sub">Your account is ready. If you connected WhatsApp, your assistant is already live on your number. If you skipped, you can connect it anytime from Settings. Meanwhile, add your properties so the bot is ready to convert from day one.</div>
              <button className="btn-launch" onClick={() => router.push('/dashboard')}>
                Open my dashboard
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
