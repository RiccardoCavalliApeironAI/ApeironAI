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
