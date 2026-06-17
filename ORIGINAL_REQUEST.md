# Original User Request

## Initial Request — 2026-06-04T17:40:00Z

# Teamwork Project Prompt — Draft

> Status: Ready for launch — awaiting user approval.
> Goal: Craft prompt → get user approval → delegate to teamwork_preview

Fix all critical bugs, security gaps, and UI issues in the LeadNest Next.js application to elevate it to a production-ready, enterprise-level standard.

Working directory: c:\LN\claude-leadnest
Integrity mode: development

## Requirements

### R1. Backend Security and Auth Fixes
- Fix `app/api/agent/route.ts` PATCH method: implement a strict field allowlist to prevent arbitrary column updates, and ensure it safely handles updates.
- Fix `app/onboarding/page.tsx`: ensure that users signing up via Google OAuth properly save their name and email to the `agents` table (reading from `session.user.user_metadata`), rather than inserting blank values.
- Audit `app/auth/callback/route.ts` for Next.js 15 cookie compatibility if required.

### R2. Frontend UI and Logic Fixes
- Fix `app/login/page.tsx`: ensure the loading spinner stops (`setIsLoading(false)`) when a login succeeds but returns a null session (e.g. unverified email), preventing UI hangs.
- Fix `components/screens/SettingsScreen.tsx`:
  - `handleEditDetail` must persist changes to the database using the `/api/agent` PATCH route, rather than just updating local state.
  - Resolve the `agent` prop TypeScript mismatch between `dashboard/page.tsx` and `SettingsScreen.tsx`.
  - Replace hardcoded subscription, billing, and WhatsApp data with actual agent data from the database.
- Fix `components/screens/InboxScreen.tsx`: Replace the hardcoded dummy WhatsApp "To" number (`+919999999999`) in simulate mode with the agent's actual registered WhatsApp number.
- Fix `components/screens/LeadsScreen.tsx`: Uncomment `fetchLeads()` in the catch block of `handleDrop` to revert optimistic UI updates on API error.
- Fix `components/screens/OverviewScreen.tsx`: Ensure the WhatsApp balance usage bar calculates against a sensible threshold instead of always displaying 100%.

### R3. Comprehensive QA and Testing
- The agent team must programmatically or manually test every fixed tab and route (Overview, Inbox, Leads, Settings) to ensure no regressions.
- All forms and interactive elements must feature proper error handling that displays clear feedback to the user rather than failing silently.

## Acceptance Criteria

### Security & Backend
- [ ] `/api/agent/route.ts` PATCH only accepts a predefined list of safe fields.
- [ ] Google OAuth signups correctly populate `name` and `email` in the `agents` table upon onboarding completion.

### UI & Frontend
- [ ] Settings changes via "Edit" persist across page reloads.
- [ ] Settings screen correctly displays the dynamic WhatsApp number and subscription data.
- [ ] TypeScript compiles without errors regarding the `agent` prop in SettingsScreen.
- [ ] Simulate mode in InboxScreen routes to the correct agent WhatsApp number.
- [ ] Drag-and-drop failures in LeadsScreen revert the UI to its previous state.
- [ ] Login screen correctly stops the loading spinner if the session is null.

### Quality Assurance
- [ ] No hardcoded placeholder numbers or text remain in functional flows.
- [ ] The app runs cleanly on `npm run dev` with no runtime crashes or unhandled promise rejections.
