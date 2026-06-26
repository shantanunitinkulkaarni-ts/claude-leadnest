'use client'

import { useState, useEffect } from 'react'

// Alpha disclaimer banner. The assistant handles LIVE leads while the product is
// in early testing, so agents must be told: expect occasional hiccups and don't
// connect their most premium clients yet. Shown in English / Hindi / Marathi.

type Lang = 'en' | 'hi' | 'mr'

const COPY: Record<Lang, { short: string; full: string }> = {
  en: {
    short: 'Alpha — Convorian is in early testing.',
    full: 'Convorian is in its alpha stage. The AI assistant chats with your real leads, so occasional hiccups or pauses are possible while we improve it. Please don\'t connect your most premium/high-value clients just yet — use it with regular leads while we stabilise. Thank you for testing with us 🙏',
  },
  hi: {
    short: 'अल्फा — Convorian अभी शुरुआती परीक्षण में है।',
    full: 'Convorian अभी अल्फा चरण में है। AI असिस्टेंट आपकी असली लीड्स से बात करता है, इसलिए सुधार के दौरान कभी-कभी रुकावट या देरी हो सकती है। कृपया अभी अपने सबसे प्रीमियम/महत्वपूर्ण क्लाइंट न जोड़ें — स्थिर होने तक इसे सामान्य लीड्स के साथ इस्तेमाल करें। परीक्षण में साथ देने के लिए धन्यवाद 🙏',
  },
  mr: {
    short: 'अल्फा — Convorian सध्या सुरुवातीच्या चाचणीत आहे.',
    full: 'Convorian सध्या अल्फा टप्प्यात आहे. AI असिस्टंट तुमच्या प्रत्यक्ष लीड्सशी संवाद साधतो, त्यामुळे आम्ही सुधारणा करत असताना कधीकधी अडथळे किंवा विलंब होऊ शकतो. कृपया तुमचे सर्वात प्रीमियम/महत्त्वाचे ग्राहक अजून जोडू नका — स्थिर होईपर्यंत सामान्य लीड्ससोबत वापरा. चाचणीत सहभागी झाल्याबद्दल धन्यवाद 🙏',
  },
}

export default function AlphaBanner() {
  const [lang, setLang] = useState<Lang>('en')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const saved = localStorage.getItem('leadnest_banner_lang') as Lang | null
    if (saved && (saved === 'en' || saved === 'hi' || saved === 'mr')) setLang(saved)
  }, [])

  const pick = (l: Lang) => { setLang(l); if (typeof window !== 'undefined') localStorage.setItem('leadnest_banner_lang', l) }
  const c = COPY[lang]

  return (
    <div style={{ background: '#FEF6E0', borderBottom: '1px solid #F0D98C', color: '#7A5200', fontSize: 12.5, lineHeight: 1.55 }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>⚠️ {c.short}</span>
        <button onClick={() => setOpen(o => !o)} style={{ background: 'none', border: 'none', color: '#9A6B00', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, textDecoration: 'underline', fontFamily: 'inherit', padding: 0 }}>
          {open ? 'Hide' : 'Details'}
        </button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {(['en', 'hi', 'mr'] as Lang[]).map(l => (
            <button key={l} onClick={() => pick(l)} style={{ background: lang === l ? '#7A5200' : 'transparent', color: lang === l ? '#fff' : '#9A6B00', border: '1px solid #E6C56A', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              {l === 'en' ? 'EN' : l === 'hi' ? 'हिं' : 'मरा'}
            </button>
          ))}
        </div>
        {open && <div style={{ flexBasis: '100%', paddingTop: 4 }}>{c.full}</div>}
      </div>
    </div>
  )
}
