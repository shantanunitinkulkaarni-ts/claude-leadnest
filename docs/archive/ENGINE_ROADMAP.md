# Convorian Engine Roadmap — the moat

*Living doc. The bot engine (`lib/gemini.ts`, Groq/Llama 3.3 70B today) is our core differentiator. Goal: a champion **sales converter** that is human-like, emotionally intelligent, personalised per client, and **gets smarter over time** from real deal outcomes. "Claude for marketing."*

> Read this before working on the engine. Update it as phases ship.

## The honest moat
We don't train foundation models. The moat = **sales-tuned playbook (prompt) + per-lead personalisation + a data flywheel learning from real deal outcomes.** That compounds and is uncopyable without our data. A frontier model can be swapped in for hard turns later; the system around it is the IP.

## Architecture (6 layers)
1. **Sales Brain** — system prompt as a real playbook: SPIN/consultative, BANT qualification, objection handling, rapport, urgency-without-pushiness, advance-vs-pull-back, emotional mirroring. (Foundation exists: stage instructions in `lib/gemini.ts`.)
2. **Lead Understanding** — per-lead inferred profile: intent, budget, temperature (`ai_score`), comm style, sentiment/emotion, objections. Privacy-safe: conversation-only, consent captured, anonymise for cross-client learning.
3. **Memory & Context** — per-lead rolling memory + long-thread summarisation; per-agent context (properties/areas/tone).
4. **Timing & Cadence** — when to send (lead's active hours), follow-up spacing, multi-month long-game nurture, when to do nothing. Respect WhatsApp 24h window + templates (no WABA bans).
5. **Content Intelligence** — when to send pics / which property; A/B-tested copy.
6. **Learning Flywheel** — capture deal outcomes → mine winning plays → few-shot best plays → A/B test → propagate winners across clients → periodic fine-tune.

## Phases (by ROI)
- **Phase 1 — Sales-grade prompt overhaul** *(in progress)*: human persona, emotional intelligence, read-the-lead, advance/pull-back logic, restraint. Fixes language-switching & too-casual tone. No new infra.
- **Phase 2 — Lead profiling & dynamic strategy**: richer profile each turn; bot selects a strategy per lead state.
- **Phase 3 — Timing & long-game cadence**: optimal send-time, follow-up spacing, multi-month re-engagement.
- **Phase 4 — Content & A/B experimentation**: pic timing, message-variant testing + logging.
- **Phase 5 — Outcome capture & flywheel**: dashboard signal for deal closed/rented/lost → outcome-labelled dataset → few-shot winning plays → cross-client propagation. *(Conversation logging foundation exists.)*
- **Phase 6 — Self-improvement loop**: eval set of outcome-labelled conversations; every prompt change measured (no regressions). Human-in-the-loop iteration first; automated suggestion later.

## How "the way Claude is built" maps
- System prompt/constitution → sales playbook + guardrails.
- RLHF → 👍/👎 + **deal outcomes** as reward signal.
- Evals → outcome-labelled conversation test set; changes measured, not vibes.
- Iterative refinement → ship → measure → analyse → refine.

## Guardrails (non-negotiable)
- Privacy: conversation-only data; consent captured; anonymise for cross-client learning.
- Anti-ban: strict WhatsApp 24h-window + template compliance.
- No fabrication of property details. Trust = conversion.

## Metrics
Reply rate · qualification rate · visit-booking rate · **deal-close rate / client** · trial→paid renewal. The engine's job is moving these.
