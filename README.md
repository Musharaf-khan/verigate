# VeriGate — Credence ID Solutions Engineer prototype

Digital age-eligibility verification using Credence ID Cloud SDK (Flow A: Digital Credentials API / ISO mdoc) and a clearly segregated **simulation** mode.

## Run locally

1. `npm install`
2. `cp .env.example .env.local`
3. In `.env.local`, set **private** license key, Profile ID (UUID) and the EXACT HTTPS origin you registered. Do not share or commit keys.
4. `npm run dev`, then visit `http://localhost:3000`.
5. Demo mode works without credentials. Live mode needs valid credentials, compatible browser + digital ID wallet, and correct registered origin.

## Deploy

Push the files to a private/public GitHub repo with `.env.local` ignored. Import into Vercel. Configure the 3 env vars in Vercel project settings. If your real deployment is `https://your-app.vercel.app`, **register that exact origin with Credence** by issuing a new Cloud SDK evaluation license (a license bound to `https://verigate.com` cannot be activated from another browser origin). Re-deploy after setting env vars. For testing live mode, browse from the matching deployed origin.

## Verification contract

Backend setup: `/v1/setup` with license/profile/origin. Short lived token cached and refreshed through `/v1/refresh`.

Backend initiate: `/v1/getDocRequest`. Browser invokes `navigator.credentials.get({digital:{requests:[{protocol:'org-iso-mdoc',data:deviceRequest}]},mediation:'required'})`. Backend verifies response using `/v1/verifyDocRequest`.

Age decisions use `birth_date` when provided by profile. If missing, result is **needs review**, never a false approval. Only decision metadata is returned; claims are not stored. Browser session history is in-memory only and explicitly distinguishes simulated and live results.

## Critical boundaries

This is an evaluation prototype, not a production-ready identity solution. There is no authentication, RBAC, multi-tenant persistence, abuse protection, consent audit storage, shared token cache, or hardened session binding. Do not use real customer data in demo mode. Never claim demo simulations are real ID validations. Real SDK flow requires a compatible wallet and genuine issued identity credential. Confirm your Credence profile requests DOB if you wish to demonstrate real age decisions.

Reference: https://credenceid.com/mobile-id/developer-documentation/integration-guide/
