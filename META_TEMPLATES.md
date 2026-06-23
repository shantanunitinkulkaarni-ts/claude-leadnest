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

---

## 🌐 Hindi + Marathi versions of the other 5 templates (DRAFTS — founder to fine-tune wording)
So a Hindi/Marathi-preferring lead gets EVERY message in their language, not a mix.
Same variable slots/order as the EN versions. Create each as a language variant
under the same template name.

### `lead_visit_invite` — hi / mr  (1=name, 2=agency, 3=property)
**HI:** नमस्ते {{1}}, {{2}} की ओर से। क्या आप {{3}} को खुद देखना चाहेंगे? मैं इस हफ़्ते आपकी सुविधा अनुसार — सुबह या शाम — एक साइट विज़िट की व्यवस्था कर सकता हूँ।
**MR:** नमस्कार {{1}}, {{2}} कडून. तुम्हाला {{3}} प्रत्यक्ष पाहायला आवडेल का? मी या आठवड्यात तुमच्या सोयीनुसार — सकाळी किंवा संध्याकाळी — साइट व्हिजिट ठरवू शकतो.

### `lead_final_touch` — hi / mr  (1=name, 2=agency, 3=area)
**HI:** नमस्ते {{1}}, {{2}} की ओर से। मैं आपको बार-बार परेशान नहीं करना चाहता, इसलिए अभी के लिए कम संदेश भेजूँगा। जब भी आप {{3}} में अपनी घर की तलाश फिर से शुरू करना चाहें, मैं बस एक संदेश दूर हूँ। क्या मैं आपको नए विकल्पों की जानकारी देता रहूँ?
**MR:** नमस्कार {{1}}, {{2}} कडून. मला तुम्हाला वारंवार त्रास द्यायचा नाही, म्हणून आत्ता कमी संदेश पाठवेन. जेव्हा तुम्हाला {{3}} मधील घराचा शोध पुन्हा सुरू करायचा असेल, तेव्हा मी फक्त एक संदेश दूर आहे. मी तुम्हाला नवीन पर्यायांची माहिती देत राहू का?

### `agent_open_question` — hi / mr  (1=name, 2=agency, 3=area)
**HI:** नमस्ते {{1}}, {{2}} की ओर से। मैं जानना चाहता था — {{3}} में आपकी प्रॉपर्टी खोज में कोई बात रुकावट तो नहीं डाल रही? बजट, लोकेशन या समय? मैं हर तरह से मदद के लिए तैयार हूँ।
**MR:** नमस्कार {{1}}, {{2}} कडून. मला जाणून घ्यायचं होतं — {{3}} मधील तुमच्या प्रॉपर्टी शोधात काही अडचण येत आहे का? बजेट, लोकेशन की वेळ? मी प्रत्येक प्रकारे मदतीसाठी तयार आहे.

### `agent_offer` — hi / mr  (1=name, 2=agency, 3=area)
**HI:** नमस्ते {{1}}, {{2}} की ओर से। अच्छी खबर — इस महीने {{3}} में घरों के लिए कुछ आकर्षक होम-लोन ऑफ़र चल रहे हैं। क्या मैं आपके बजट में फिट होने वाले कुछ विकल्प भेजूँ?
**MR:** नमस्कार {{1}}, {{2}} कडून. एक चांगली बातमी — या महिन्यात {{3}} मधील घरांसाठी काही आकर्षक होम-लोन ऑफर्स सुरू आहेत. तुमच्या बजेटमध्ये बसणारे काही पर्याय मी पाठवू का?

### `visit_reminder` — hi / mr  (Utility; 1=name, 2=agency, 3=property, 4=date, 5=time)
**HI:** नमस्ते {{1}}, {{2}} की ओर से आपकी साइट विज़िट का रिमाइंडर:
प्रॉपर्टी: {{3}}
कब: {{4}} को {{5}} बजे
रीशेड्यूल करना हो तो यहाँ जवाब दें — जल्द मिलते हैं!
**MR:** नमस्कार {{1}}, {{2}} कडून तुमच्या साइट व्हिजिटची आठवण:
प्रॉपर्टी: {{3}}
कधी: {{4}} रोजी {{5}} वाजता
रीशेड्यूल करायचं असल्यास इथे उत्तर द्या — लवकरच भेटूया!

> When approved, add these to `TEMPLATE_BODIES` (lib/outreach.ts) and add `'hi'`/`'mr'`
> to each template's `approvedLangs`. The send already supplies positional values.

## After approval
1. In `lib/outreach.ts` TEMPLATES, mark each `approvedLangs` as Meta clears them.
2. Add `agent_open_question` + `agent_offer` to TEMPLATES/TEMPLATE_BODIES and return them
   from `planTemplateForFlow` for plans B / C.
3. Staging test, then set `NURTURE_FLOW_V2=true` + `MSG91_TEMPLATES_LIVE=true` (rename
   later) to light up the full A/B/C/D nurture on Meta.
