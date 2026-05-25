# Golden Meat Inbound Call Management System

Production-safe inbound call management system for Golden Meat restaurant using Vapi, Supabase, and Next.js.

## 🚀 Setup Instructions

### 1. Supabase Setup
1. Create a new project on [Supabase](https://supabase.com).
2. Go to the **SQL Editor**.
3. Copy the content of `supabase/migrations/20240509_init.sql` and run it. This will create all required tables, indexes, and triggers.

### 2. Environment Variables
1. Copy `.env.example` to `.env.local`.
2. Fill in your Supabase credentials:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (CRITICAL: Used for backend bypass)
3. Fill in your `VAPI_TOKEN`.
4. Set an `ADMIN_PASSWORD` (Default in code login is `admin123`).
5. Set `PUBLIC_APP_URL` to your production URL or tunnel URL.

### 3. Local Installation & Run
```bash
npm install
npm run dev
```
The app will be available at `http://localhost:3000`.

### 4. Vapi Webhook Setup (Local Testing)
1. Start a tunnel (e.g., `ngrok http 3000`).
2. Update your `PUBLIC_APP_URL` in `.env.local` with the tunnel URL.
3. In Vapi Dashboard, for each Tool, set the URL to `{{PUBLIC_APP_URL}}/api/vapi/[endpoint-name]`.

### 5. Admin Panel Login
1. Navigate to `/admin/login`.
2. Enter the password (default: `admin123`).
3. You can now monitor calls and manage reservation statuses.

## 🧪 Testing the Endpoints
You can test the API endpoints locally without making a phone call:
1. Ensure the dev server is running (`npm run dev`).
2. Run the test script:
```bash
node scripts/test-endpoints.js
```
This script tests both **direct JSON payloads** and **nested Vapi tool-call formats**.

## 🚢 Production Deployment
1. **Deploy to Vercel**: Connect this repository to Vercel.
2. **Environment Variables**: Add all variables from `.env.local` to Vercel Project Settings.
3. **Database**: Ensure the Supabase migration was run successfully on your production Supabase instance.
4. **Vapi**: Update your Vapi tools to point to your Vercel deployment URL.

## 📁 Configuration Reference
- `vapi-config/assistant.json`: System prompt and assistant configuration.
- `vapi-config/tools.json`: Tool schemas for import into Vapi.
- `supabase/migrations/`: SQL schema definition.
