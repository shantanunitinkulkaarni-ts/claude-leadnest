// lib/bot/tutorial.ts 
// Deterministic tutorial-mode decisions for the onboarding walkthrough. 
// Extracted from lib/ai-bot.ts as part of the Phase 1 refactor. 
 
import type { BotStage, TutorialDecision } from './types' 
 
export function getTutorialDecision( 
  messageCount: number, 
  message: string, 
  agent: any, 
  lead: any, 
): TutorialDecision | null { 
  const clean = (message || '').trim() 
  const email = lead?.email || agent?.email || '' 
  if (messageCount === 1) { 
    return { reply: "Hello! I'd love to help you with your property search. Which language are you most comfortable in: English, Hindi, or Hinglish?" } 
  } 
  if (messageCount === 2) { 
    const wantsHindi = /hindi/i.test(clean) 
    const wantsHinglish = /hinglish/i.test(clean) 
    return { 
      reply: wantsHindi ? 'Great, we can continue in Hindi. May I know your name?' : wantsHinglish ? 'Perfect, we can continue in Hinglish. May I know your name?' : 'Perfect, we can continue in English. May I know your name?', 
      updates: { language: wantsHindi ? 'hi' : wantsHinglish ? 'hinglish' : 'en' }, 
    } 
  } 
  if (messageCount === 3) { 
    const extracted = clean.match(/my name is\s+(.+)/i)?.[1]?.trim() || clean 
    const firstName = extracted.replace(/[.!,]+$/g, '').trim() 
    return { reply: `Nice to meet you, ${firstName}. Are you looking to rent or buy, and what kind of home are you searching for?`, updates: { name: firstName } } 
  } 
  if (messageCount === 4) { 
    return { reply: "Got it. You're looking to buy a 2 BHK in Wakad. What budget would you like me to work with?", updates: { intent: 'buy', preferred_areas: ['Wakad'], bhk: '2 BHK' } } 
  } 
  if (messageCount === 5) { 
    return { reply: "Thanks, that's helpful.", updates: { budget_max: 9000000 }, action: 'search_properties' } 
  } 
  if (messageCount === 6) { 
    return { reply: 'Excellent choice. What day and time would suit you for a site visit?' } 
  } 
  if (messageCount === 7) { 
    return { reply: `I can try to arrange that slot. Please share your email address so I can send the visit confirmation to you and ${agent?.name || 'our team'}.`, updates: { visit_time: clean } } 
  } 
  if (messageCount === 8) { 
    return { reply: email && clean === email ? `Thanks. I'm confirming the visit now and the email confirmation will be sent to ${clean}.` : "Thanks. I'm confirming the visit now and I'll send the email confirmation there.", updates: { email: clean }, action: 'book_visit' } 
  } 
  return null 
} 
 
export function tutorialStageForMessage(messageCount: number): BotStage { 
  return messageCount <= 2 ? 'language' : messageCount === 3 ? 'name' : messageCount <= 5 ? 'qualifying' : messageCount === 6 ? 'property_shown' : messageCount === 7 ? 'awaiting_visit_time' : 'awaiting_email' 
} 
