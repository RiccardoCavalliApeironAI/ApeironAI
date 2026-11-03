# Apeiron AI — Similar Company Finder V5

This version is wired for real data.

## What is already connected

1. **Company search and analysis**
   - Server endpoint: `/api/search`
   - Uses the OpenAI Responses API with the built-in web search tool.
   - Uses the 18 Apeiron reference companies as the target profile.
   - Returns sources for each company and does not require a company to be exclusively B2B.

2. **Decision-maker emails**
   - Server endpoint: `/api/contacts`
   - Uses Hunter Domain Search.
   - Prioritizes Business Development, Licensing, Portfolio, Commercial, International Business, Partnerships, Procurement and senior management roles.
   - It does not invent missing emails.

3. **Save lead**
   - Currently stored in the browser using `localStorage`.
   - Supabase can be added after the search quality is validated.

## Required secrets

Set these environment variables on the server:

- `OPENAI_API_KEY`
- `HUNTER_API_KEY`
- Optional: `OPENAI_MODEL` (defaults to `gpt-5.6-terra`)

Never put these keys directly in `index.html`.

## Deploy on Vercel

The project is structured for Vercel serverless functions.

1. Put the folder in a GitHub repository.
2. Import the repository into Vercel.
3. In Vercel Project Settings → Environment Variables, add:
   - `OPENAI_API_KEY`
   - `HUNTER_API_KEY`
   - optionally `OPENAI_MODEL`
4. Deploy.
5. Open the generated Vercel URL.

## Local test (optional)

If Node.js is installed:

```bash
npm install -g vercel
vercel dev
```

Then open the local URL shown by Vercel.

## Important

- Web research can return fewer companies than requested if evidence is weak.
- Revenue is shown as `Unknown` when reliable evidence is not found.
- Hunter coverage varies by company/domain.
- The next production step should be a Supabase database for permanent leads, notes, statuses and duplicate prevention.

## V6 search expansion

V6 no longer asks one model call for all requested companies. It runs multiple independent discovery tracks in parallel (licensing/own-brand, generics/Rx/OTC, devices/supplements, specialist pharma, and manufacturer-commercial hybrids), deduplicates by domain/name, ranks by evidence quality, and runs a long-tail recovery pass when the requested count is not reached. This materially improves coverage for searches requesting 30-50 companies while keeping source requirements.


## V7 business-model update

- Reference set expanded from 18 to 26 unique positive examples.
- Pharmaidea, Neo Health OTC, Horus Pharma and Brill Pharma are high-priority **business-model** anchors.
- Therapeutic area is secondary and only affects matching when explicitly selected by the user.
- Internal manufacturing is not a negative: integrated companies such as STADA, Cinfa, Polpharma, Kern, Menarini and Bluepharma remain strong target archetypes.
- Every result now receives an **Apeiron Fit Score (0–100)** based on:
  - external sourcing / licensing: 30
  - own brand / portfolio: 20
  - portfolio expansion: 15
  - segment relevance: 15
  - commercial reach: 10
  - financial capacity: 5
  - manufacturing / operational maturity: 5
- Results include a business-model archetype and are ranked primarily by Apeiron Fit.


## V8.1 stability fix
- Each OpenAI research track is capped at 85 seconds, so one slow track cannot consume the whole Vercel function window.
- 50-result searches use 4 diversified tracks instead of 5 concurrent tracks.
- Web search context and reasoning effort are tuned for lower latency.
- Frontend now displays the real server error when Vercel returns text/HTML instead of JSON.
- Search still returns partial high-quality results if one research track fails or times out.
