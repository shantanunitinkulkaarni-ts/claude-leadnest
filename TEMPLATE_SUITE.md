# Convorian WhatsApp Template Suite — paste-ready for MSG91

*Designed June 13, 2026. Create each in MSG91 exactly as written (name,
category, language, body, buttons, sample values). Tell Claude which get
approved → it wires the names into the engine.*

## How to read this
- **Name** = the template's registered name (snake_case, lowercase). This is what the code calls.
- **Category** = Marketing or Utility (set this in MSG91 — it affects cost/approval).
- **Language** = create the template under this language code.
- **Body** = exact text. `{{1}} {{2}}…` are variables (numbered, in order).
- **Buttons** = Quick Reply buttons (tapping them sends that text back → reopens the free 24h window).
- **Samples** = the example values MSG91/Meta asks for during submission.

---

## CORE SET (submit these first)

### 1. `lead_new_match`  · Marketing · en
The workhorse re-engagement: a quiet lead, a new matching property.
**Body:**
```
Hi {{1}}! A property matching your search just came up in {{2}} — a {{3}} within your budget. Would you like me to share the details?
```
**Footer:** `Convorian — your AI property assistant`
**Buttons (Quick Reply):** `Yes, share details` · `Not right now`
**Samples:** {{1}}=Rahul · {{2}}=Baner · {{3}}=2BHK apartment

### 2. `lead_visit_invite`  · Marketing · en
Push a qualified-but-unbooked lead toward a site visit.
**Body:**
```
Hi {{1}}, would you like to see {{2}} in person? I can arrange a quick site visit this week at a time that suits you — morning or evening.
```
**Footer:** `Convorian — your AI property assistant`
**Buttons (Quick Reply):** `Book a visit` · `Maybe later`
**Samples:** {{1}}=Rahul · {{2}}=the 3BHK in Baner

### 3. `visit_reminder`  · Utility · en
Appointment reminder (works outside the 24h window — that's why it's Utility).
**Body:**
```
Hi {{1}}, a reminder of your site visit:
Property: {{2}}
When: {{3}} at {{4}}
Reply here if you'd like to reschedule — see you soon!
```
**Footer:** `Convorian`
**Buttons (Quick Reply):** `Confirm` · `Reschedule`
**Samples:** {{1}}=Rahul · {{2}}=Skyline Residency, Baner · {{3}}=Saturday 14 June · {{4}}=11:00 AM

### 4. `lead_final_touch`  · Marketing · en
The graceful last touch before a lead goes dormant (protects quality rating).
**Body:**
```
Hi {{1}}, I don't want to crowd your inbox, so I'll pause updates for now. Whenever you're ready to explore homes in {{2}}, just message me here and I'll pick right back up.
```
**Footer:** `Convorian — your AI property assistant`
**Buttons (Quick Reply):** `Keep me posted` · `Stop updates`
**Samples:** {{1}}=Rahul · {{2}}=Baner

---

## MULTILINGUAL (add these once the English set is approved)
Meta supports the SAME template name in multiple languages. Create `lead_new_match`
again under language `hi` and `mr` (Maharashtra audience). Same for `lead_visit_invite`.

### `lead_new_match` · Marketing · hi (Hindi)
```
नमस्ते {{1}}! {{2}} में आपकी पसंद से मिलती-जुलती एक नई प्रॉपर्टी उपलब्ध हुई है — आपके बजट में {{3}}। क्या मैं आपको इसकी जानकारी भेजूँ?
```
**Buttons:** `हाँ, जानकारी भेजें` · `अभी नहीं`
**Samples:** {{1}}=Rahul · {{2}}=Baner · {{3}}=2BHK फ्लैट

### `lead_new_match` · Marketing · mr (Marathi)
```
नमस्कार {{1}}! {{2}} मध्ये तुमच्या आवडीशी जुळणारी एक नवीन प्रॉपर्टी उपलब्ध झाली आहे — तुमच्या बजेटमध्ये {{3}}. मी तुम्हाला त्याची माहिती पाठवू का?
```
**Buttons:** `हो, माहिती पाठवा` · `आत्ता नको`
**Samples:** {{1}}=Rahul · {{2}}=Baner · {{3}}=2BHK फ्लॅट

---

## PHASE 2 (nice-to-have, add later)

### 5. `post_visit_followup`  · Utility · en
```
Hi {{1}}, hope your visit to {{2}} went well! Do you have any questions, or shall we talk about the next steps?
```
**Buttons:** `I'm interested` · `I have a question`
**Samples:** {{1}}=Rahul · {{2}}=Skyline Residency

### 6. `lead_still_looking`  · Marketing · en
```
Hi {{1}}, still looking for a place in {{2}}? I've got a few options I can line up whenever you're ready — no rush.
```
**Buttons:** `Yes, I'm looking` · `Pause for now`
**Samples:** {{1}}=Rahul · {{2}}=Baner

---

## How the engine picks a template (Claude wires this after approval)
`decideOutreach` already decides WHEN + lead value. Selection of WHICH template:
| Lead state | Template |
|---|---|
| Upcoming visit within ~24h, reminder not sent | `visit_reminder` (Utility) |
| `post_visit_result` set, no decision | `post_visit_followup` |
| Qualified / score ≥ 6, no visit booked | `lead_visit_invite` |
| Has criteria (area/intent), warm/cold, quiet | `lead_new_match` |
| On the final allowed touch before dormant | `lead_final_touch` |

Variable values are filled from lead data (name, area, BHK, property, date/time).
Language variant chosen from the lead's detected conversation language (EN default).

## Meta approval tips (to clear first-pass)
- Keep emojis minimal (0–1), no ALL CAPS, no "free!!!", no misleading claims.
- Every variable needs a sample value (filled above).
- Don't start the body with a variable; `Hi {{1}},` is fine and standard.
- Marketing templates can be rate-limited by quality rating — the buttons +
  graceful opt-out here keep it healthy.
- Utility templates (reminders) approve fastest and deliver best — submit
  `visit_reminder` even if you delay the Marketing ones.
