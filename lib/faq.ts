// Shared FAQ knowledge base — rendered as an accordion on /help AND fed to the
// support chat as its grounding context. One source of truth so answers stay
// consistent. (Lightweight "RAG": the whole KB is small enough to inline into
// the prompt; a vector store is overkill at this size.)

export type QA = { q: string; a: string }
export type FaqGroup = { section: string; items: QA[] }

export const FAQS: FaqGroup[] = [
  {
    section: 'Getting started',
    items: [
      { q: 'What is Convorian?', a: 'Convorian is an AI WhatsApp assistant built for Indian real-estate agents. It connects to your WhatsApp number and automatically replies to leads, answers their questions, qualifies them, shares property details, and books site visits — 24/7, in multiple Indian languages.' },
      { q: 'How does the AI assistant work?', a: 'When a lead messages your WhatsApp, Convorian reads the message and replies instantly using your property details, areas and tone. It nurtures the lead through the conversation and notifies you when someone is ready to talk or book a visit. You stay in control and can jump into any chat yourself from the Inbox.' },
      { q: 'How do I connect my WhatsApp number?', a: 'During onboarding we guide you through connecting your number via the official WhatsApp Business (Meta) platform. If you need a hand, message us — we offer concierge onboarding for early customers and will set it up with you.' },
      { q: 'What languages does the bot support?', a: 'Convorian handles English, Hindi, Marathi, Gujarati and more — it replies in the language your lead writes in, so conversations feel natural.' },
    ],
  },
  {
    section: 'Billing & plans',
    items: [
      { q: 'How much does Convorian cost?', a: 'Convorian is ₹999 per month. It auto-renews monthly via UPI Autopay, and you can cancel anytime — you keep access until the end of the period you have already paid for.' },
      { q: 'How do I activate or cancel my subscription?', a: 'Go to the Balance screen in your dashboard. Tap "Activate plan" to start, or "Cancel subscription" to stop auto-renewal. Cancelling keeps your access running until your current paid period ends.' },
      { q: 'Where can I find my invoices / receipts?', a: 'On the Balance screen, scroll to "Billing history". Every payment is listed there with a "Receipt" button — open it and use your browser\'s Print → Save as PDF to download a copy. Note: Convorian is run as a sole proprietorship and is not GST-registered, so these are payment receipts, not tax invoices.' },
      { q: 'What is the "WhatsApp balance" for?', a: 'The WhatsApp balance covers Meta\'s per-message charges for proactive (template) messages you send to leads. It is separate from your ₹999 subscription. You can top it up anytime from the Balance screen.' },
    ],
  },
  {
    section: 'Trust & data',
    items: [
      { q: 'Is my data safe?', a: 'Yes. Your leads and conversations are private to your account, secured in our database, and we never share your data with other agents. See our Privacy Policy for full details.' },
      { q: 'Do my leads have to opt in?', a: 'Yes — that keeps you compliant and your WhatsApp number safe. Leads who message you first are automatically opted in. When you add a lead manually, you confirm you have their consent to message them.' },
    ],
  },
]

// Flatten the KB into plain text for grounding the support chat prompt.
export function faqAsText(): string {
  return FAQS.map(g =>
    `## ${g.section}\n` + g.items.map(i => `Q: ${i.q}\nA: ${i.a}`).join('\n\n')
  ).join('\n\n')
}
