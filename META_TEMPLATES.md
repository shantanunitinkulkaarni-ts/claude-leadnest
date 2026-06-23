# Meta WhatsApp Templates — submission specs (Nurture V1)

Create these in **WhatsApp Manager → Message Templates → Create Template**. Use
**positional variables `{{1}} {{2}} …`** (our sender maps values positionally, in the
order below). Provide the **sample value** for each variable at submission (Meta needs
it for review). Approval takes ~24–48h each.

Categories: **Utility** = transactional (faster/cheaper approval, no marketing opt-in);
**Marketing** = re-engagement (needs the recipient's opt-in).

The body wording below MUST match what's in `lib/outreach.ts` (TEMPLATE_BODIES) — names
are the source of truth the cron sends by.

---

## ✅ Already wired in code — just create + approve (enables Plan A + D)

### 1. `lead_new_match` — Marketing — en, hi, mr
Vars: 1=customer_name, 2=agency_name, 3=area, 4=property_type

**EN:** Hi {{1}}, it's {{2}}. A property matching your search just came up in {{3}} — a {{4}} within your budget. Would you like me to share the details?
**HI:** नमस्ते {{1}}, {{2}} की ओर से। {{3}} में आपकी पसंद से मिलती-जुलती एक नई प्रॉपर्टी उपलब्ध हुई है — आपके बजट में {{4}}। क्या मैं आपको इसकी जानकारी भेजूँ?
**MR:** नमस्कार {{1}}, {{2}} कडून. {{3}} मध्ये तुमच्या आवडीशी जुळणारी एक नवीन प्रॉपर्टी उपलब्ध झाली आहे — तुमच्या बजेटमध्ये {{4}}. मी तुम्हाला त्याची माहिती पाठवू का?
Samples: 1=Shantanu, 2=SK Properties, 3=Baner, 4=2BHK apartment

### 2. `lead_visit_invite` — Marketing — en
Vars: 1=customer_name, 2=agency_name, 3=property
**EN:** Hi {{1}}, it's {{2}}. Would you like to see {{3}} in person? I can arrange a quick site visit this week at a time that suits you — morning or evening.
Samples: 1=Shantanu, 2=SK Properties, 3=the 2BHK in Baner

### 3. `lead_final_touch` — Marketing — en
Vars: 1=customer_name, 2=agency_name, 3=area
**EN:** Hi {{1}}, it's {{2}}. I don't want to crowd your inbox, so I'll ease off for now. Whenever you'd like to pick your home search in {{3}} back up, I'm just one message away. Shall I keep you posted on new options?
Samples: 1=Shantanu, 2=SK Properties, 3=Baner

### 4. `visit_reminder` — Utility — en
Vars: 1=customer_name, 2=agency_name, 3=property, 4=visit_date, 5=visit_time
**EN:** Hi {{1}}, a reminder from {{2}} about your site visit:
Property: {{3}}
When: {{4}} at {{5}}
Reply here if you'd like to reschedule — see you soon!
Samples: 1=Shantanu, 2=SK Properties, 3=the 2BHK in Baner, 4=Saturday 14 June, 5=11:00 AM

---

## ➕ New — unlock Plan B (open question) + Plan C (offer). Also need a small code add (planTemplateForFlow) after approval.

### 5. `agent_open_question` — Marketing — en   (Plan B)
Vars: 1=customer_name, 2=agency_name, 3=area
**EN:** Hi {{1}}, it's {{2}}. I wanted to check in — is there anything holding you back on your property search in {{3}}? Budget, location, or timing? Happy to help however I can.
Samples: 1=Shantanu, 2=SK Properties, 3=Baner

### 6. `agent_offer` — Marketing — en   (Plan C)
Vars: 1=customer_name, 2=agency_name, 3=area
**EN:** Hi {{1}}, it's {{2}}. Good news — there are some attractive home-loan offers running this month for homes in {{3}}. Want me to share a few options that fit your budget?
Samples: 1=Shantanu, 2=SK Properties, 3=Baner

---

## After approval
1. In `lib/outreach.ts` TEMPLATES, mark each `approvedLangs` as Meta clears them.
2. Add `agent_open_question` + `agent_offer` to TEMPLATES/TEMPLATE_BODIES and return them
   from `planTemplateForFlow` for plans B / C.
3. Staging test, then set `NURTURE_FLOW_V2=true` + `MSG91_TEMPLATES_LIVE=true` (rename
   later) to light up the full A/B/C/D nurture on Meta.
