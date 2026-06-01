# LeadNest Project Handoff

*Last Updated: June 1, 2026*

## 🚀 Current Project State

The LeadNest application's core conversational intelligence engine is fully functional and successfully deployed to production. The Next.js frontend and webhook server run 24/7 in the cloud.

### Architecture & Integrations
- **AI Engine:** Google Gemini (`gemini-2.5-flash` model).
- **Database / Memory:** Supabase (stores Agents, Leads, Properties, and Messages).
- **Messaging Provider:** Twilio Sandbox (WhatsApp).
- **Hosting / Deployment:** Google Cloud Run (`gen-lang-client-0794202345` project in `asia-south1` region).
- **Live Webhook URL:** `https://leadnest-app-629032564012.asia-south1.run.app/api/webhook`

## ✅ What Has Been Completed

1. **AI Upgrade:** 
   - Migrated the conversational bot from Anthropic Claude to **Gemini 2.5 Flash** for blazing-fast responses.
   - Customized the AI prompt to proactively ask the user: *"In which area are you looking for a property?"*
2. **Database Connectivity:**
   - Fixed the Supabase integration which was failing due to invalid API keys and mismatched Agent IDs.
   - Successfully seeded the database with the test agent (Shantanu Kulkaarni) and sample properties (e.g., 2BHK in Pune).
3. **End-to-End WhatsApp Flow:**
   - Successfully verified the complete pipeline: User WhatsApp → Twilio Webhook → Next.js API Route → Supabase Memory → Gemini Inference → Twilio Response → User WhatsApp.
4. **Cloud Deployment:**
   - Transitioned from a fragile local `ngrok` tunnel to a fully managed **Google Cloud Run** container using Cloud Build.
   - Updated the Twilio Sandbox webhook configuration to point to the live GCP URL.

## 🚧 What Is Pending (Next Steps)

1. **Authkey.io Integration (High Priority for Production)**
   - **Why:** To move away from the temporary Twilio Sandbox and use a permanent, scalable WhatsApp Business API provider.
   - **Prerequisites Needed:** A registered domain name, a business email address, and official business verification documents for Meta/WhatsApp approval.
   - **Action Items:** Switch out the Twilio webhook logic (`lib/whatsapp.ts` and `app/api/webhook/route.ts`) to parse and send messages using Authkey.io's REST API.

2. **Dashboard UI Polish (Low Priority / Aesthetic)**
   - **Why:** The React implementation of the internal dashboard drifted slightly from the original Figma / HTML designs.
   - **Action Items:** 
     - Rebuild the layout structure of the `dashboard/inbox` page so the "Profile", "Matched properties", and "Activity" tabs display correctly in the right pane without page reloads.
     - Perfect the padding, alignment, and drag-and-drop visuals for the `dashboard/leads` pipeline.
     - Apply exact styling tokens to the property cards on the `dashboard/properties` page.

## 🔐 Credentials & Environment Setup
If you need to run the project locally (`npm run dev`), the local `.env` file is fully configured with valid keys for Supabase, Gemini, and Twilio. **Do not** commit the `.env` file or leak the Gemini key, as Google will automatically disable it.
