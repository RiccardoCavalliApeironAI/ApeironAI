const REFERENCE_SET = [
  "Goodwill Pharma (Hungary)",
  "Fertilland (Greece)",
  "Kern Pharma (Spain)",
  "Noscat GmbH (Austria)",
  "Cinfa (Spain)",
  "Horus Pharma (France)",
  "Brill Pharma (Spain)",
  "Menarini (Italy)",
  "Polpharma (Poland)",
  "STADA (Germany)",
  "Bluepharma (Portugal)",
  "SEID Lab (Spain)",
  "Dr. Reddy's (UK)",
  "Levante Farma (Italy)",
  "ESTEVE (Spain)",
  "Evolan (Sweden)",
  "Orifarm (Denmark)",
  "Orus Pharma (Denmark)",
  "Exeltis",
  "Aboutmeds",
  "Pharmaidea",
  "Aurovitas",
  "Farmasyn S.A.",
  "Frezy Derm",
  "Neo Health OTC",
  "PRO.MED.CS Praha a.s."
];

const HIGH_PRIORITY_BUSINESS_MODEL_ANCHORS = [
  "Pharmaidea",
  "Neo Health OTC",
  "Horus Pharma",
  "Brill Pharma"
];

const BUSINESS_MODEL_ARCHETYPES = [
  "Commercial / sourcing-led",
  "Specialist commercial pharma",
  "Manufacturer + commercial portfolio",
  "MAH + licensing",
  "Distributor + own brand",
  "Integrated pharma"
];

const SEARCH_STRATEGIES = [
  {
    name: "commercial-sourcing-led",
    focus: "Find commercial pharma/healthcare companies whose growth model relies on sourcing, in-licensing, product acquisition, distribution partnerships, private label or externally manufactured finished products. Therapeutic area is NOT a similarity criterion unless the user explicitly filters by it."
  },
  {
    name: "manufacturer-commercial-hybrid",
    focus: "Find manufacturers that also own and actively commercialize a portfolio, act as MAH, launch third-party or licensed products, acquire products/brands, or maintain a meaningful business-development/licensing function. Internal manufacturing must not penalize the candidate."
  },
  {
    name: "mahs-licensing-portfolio",
    focus: "Find MAHs and portfolio-driven pharmaceutical companies with evidence of in-licensing, business development, external sourcing, product acquisition, co-marketing or frequent portfolio expansion."
  },
  {
    name: "own-brand-consumer-health",
    focus: "Find companies with own brands across generics, OTC, medical devices or food supplements, especially where products are sourced from external manufacturers or added through licensing/distribution agreements."
  },
  {
    name: "specialist-commercial-model",
    focus: "Find specialist pharma companies whose BUSINESS MODEL resembles Horus Pharma or Brill: own commercial portfolio, strong market-facing organization, partnerships and external product sourcing/licensing. Do not match them merely because of ophthalmology or any therapeutic area."
  }
];

function extractOutputText(data) {
  if (typeof data.output_text === "string") return data.output_text;
  for (const item of (data.output || [])) {
    if (item.type === "message") {
      for (const c of (item.content || [])) {
        if (c.type === "output_text" && typeof c.text === "string") return c.text;
      }
    }
  }
  return null;
}

const companySchema = {
  type:"object",
  additionalProperties:false,
  properties:{
    companies:{
      type:"array",
      items:{
        type:"object",
        additionalProperties:false,
        properties:{
          name:{type:"string"},
          country:{type:"string"},
          website:{type:"string"},
          domain:{type:"string"},
          revenue_estimate:{type:"string"},
          company_type:{type:"string"},
          business_model_profile:{type:"string"},
          similarity:{type:"string", enum:["High","Medium","Low"]},
          similar_to:{type:"array", items:{type:"string"}},
          segments:{type:"array", items:{type:"string"}},
          therapeutic_areas:{type:"array", items:{type:"string"}},
          own_brand_evidence:{type:"string"},
          licensing_sourcing_evidence:{type:"string"},
          portfolio_expansion_evidence:{type:"string"},
          commercial_reach_evidence:{type:"string"},
          score_components:{
            type:"object",
            additionalProperties:false,
            properties:{
              external_sourcing_licensing:{type:"integer", minimum:0, maximum:30},
              own_brand_portfolio:{type:"integer", minimum:0, maximum:20},
              portfolio_expansion:{type:"integer", minimum:0, maximum:15},
              segment_relevance:{type:"integer", minimum:0, maximum:15},
              commercial_reach:{type:"integer", minimum:0, maximum:10},
              financial_capacity:{type:"integer", minimum:0, maximum:5},
              manufacturing_operational_maturity:{type:"integer", minimum:0, maximum:5}
            },
            required:[
              "external_sourcing_licensing","own_brand_portfolio","portfolio_expansion",
              "segment_relevance","commercial_reach","financial_capacity",
              "manufacturing_operational_maturity"
            ]
          },
          why_relevant:{type:"string"},
          sources:{
            type:"array",
            items:{
              type:"object",
              additionalProperties:false,
              properties:{title:{type:"string"},url:{type:"string"}},
              required:["title","url"]
            }
          }
        },
        required:[
          "name","country","website","domain","revenue_estimate","company_type",
          "business_model_profile","similarity","similar_to","segments","therapeutic_areas",
          "own_brand_evidence","licensing_sourcing_evidence","portfolio_expansion_evidence",
          "commercial_reach_evidence","score_components","why_relevant","sources"
        ]
      }
    }
  },
  required:["companies"]
};

function normalizeDomain(domain) {
  return String(domain || "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .trim();
}

function normalizeName(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(sp\.?\s*z\.?\s*o\.?\s*o\.?|s\.?a\.?|s\.?l\.?|srl|gmbh|ltd|limited|ab|as|oy|sas|spa|pharma|pharmaceuticals?)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isReferenceCompany(c) {
  const n = normalizeName(c.name);
  return REFERENCE_SET.some(r => {
    const rn = normalizeName(r.replace(/\s*\([^)]*\)\s*$/, ""));
    return n === rn || (n && rn && (n.includes(rn) || rn.includes(n)));
  });
}

function fitScore(c) {
  const s = c.score_components || {};
  const total =
    Number(s.external_sourcing_licensing || 0) +
    Number(s.own_brand_portfolio || 0) +
    Number(s.portfolio_expansion || 0) +
    Number(s.segment_relevance || 0) +
    Number(s.commercial_reach || 0) +
    Number(s.financial_capacity || 0) +
    Number(s.manufacturing_operational_maturity || 0);
  return Math.max(0, Math.min(100, total));
}

function qualityScore(c) {
  const score = fitScore(c);
  const sources = Math.min((c.sources || []).length, 3) * 3;
  const sim = c.similarity === "High" ? 5 : c.similarity === "Medium" ? 2 : 0;
  return score + sources + sim;
}

function dedupeCompanies(all) {
  const map = new Map();
  for (const c of all) {
    if (!c || !c.name || isReferenceCompany(c)) continue;
    c.domain = normalizeDomain(c.domain || c.website);
    c.apeiron_fit_score = fitScore(c);
    const key = c.domain || `${normalizeName(c.name)}|${String(c.country||"").toLowerCase()}`;
    if (!key) continue;
    const prev = map.get(key);
    if (!prev || qualityScore(c) > qualityScore(prev)) map.set(key, c);
  }
  return [...map.values()].sort((a,b) => qualityScore(b)-qualityScore(a));
}

function buildPrompt(b, strategy, batchSize, excludedNames=[]) {
  const therapeuticRule = b.therapeuticArea
    ? `The user explicitly selected therapeutic area "${b.therapeuticArea}", so use it as a filter/relevance signal.`
    : `The user did NOT select a therapeutic area. Do not award similarity points for sharing a therapeutic area with a reference company. Therapeutic area is descriptive only.`;

  return `
You are one research track inside Apeiron AI, a pharmaceutical business-development lead finder.

REFERENCE COMPANIES — ALL ARE IMPORTANT POSITIVE EXAMPLES:
${REFERENCE_SET.join("; ")}

HIGH-PRIORITY BUSINESS-MODEL ANCHORS:
${HIGH_PRIORITY_BUSINESS_MODEL_ANCHORS.join("; ")}

IMPORTANT INTERPRETATION:
The high-priority anchors are weighted more strongly ONLY because their BUSINESS MODEL is especially representative.
Do not infer that the other reference companies are less commercially valuable.
In particular, large integrated companies such as STADA, Cinfa, Polpharma, Menarini, Kern, Bluepharma and similar manufacturer-commercial hybrids remain excellent targets.
Internal manufacturing is NEVER a negative signal by itself.

BUSINESS MODEL ARCHETYPES:
${BUSINESS_MODEL_ARCHETYPES.join("; ")}

GOAL:
Discover NEW companies that Apeiron could realistically approach to supply, license or source finished pharmaceutical/healthcare products.
Do not return any reference company itself.

PRIMARY QUESTION:
"Does this company have both the commercial capability and a plausible reason to buy, in-license, acquire, source or commercialize products from external partners?"

THIS TRACK'S SEARCH FOCUS:
${strategy.focus}

CORE MATCHING LOGIC — BUSINESS MODEL FIRST:
1. External sourcing / in-licensing / product acquisition / partnership propensity.
2. Own-brand or own-portfolio commercial activity.
3. Active portfolio expansion, frequent launches, partnerships or acquisitions.
4. Relevance in generics, medical devices, food supplements, OTC and/or Rx.
5. Commercial reach and market-facing organization.
6. Financial/organizational capacity.
7. Manufacturing capability is a small positive maturity signal when present, never a penalty.

THERAPEUTIC AREA RULE:
${therapeuticRule}

APEIRON FIT SCORE — score each company using these exact maximums:
- external_sourcing_licensing: 0–30
- own_brand_portfolio: 0–20
- portfolio_expansion: 0–15
- segment_relevance: 0–15
- commercial_reach: 0–10
- financial_capacity: 0–5
- manufacturing_operational_maturity: 0–5
Total maximum = 100.
Use conservative scores and only award points supported by evidence. Unknown facts should not receive points.

EXCLUSIONS:
- Pure wholesalers without own portfolio/brands
- Retail pharmacies
- Hospitals
- CRO-only businesses
- API-only traders
- Companies with no meaningful market-facing commercial activity
- ${b.exclude || "No additional exclusions"}

RESEARCH RULES:
- Search in English and local language where useful.
- Prefer official company sources; reputable regulator, trade, industry and business sources may supplement them.
- Never invent companies, URLs, revenue, licensing evidence or portfolio facts.
- If revenue is not reliably available, use "Unknown".
- A candidate may still be strong even when revenue or exact therapeutic areas are unknown.
- Each company must have at least one real supporting source.
- "similar_to" must name 1–3 companies from the reference set based mainly on BUSINESS MODEL, not merely therapeutic area.
- business_model_profile should use the closest archetype above, or a concise equivalent when necessary.

USER FILTERS:
Region/country: ${b.region || "Europe"}
Therapeutic area: ${b.therapeuticArea || "Any / not used for default similarity"}
Revenue minimum EUR: ${b.revenueMin || "No minimum"}
Revenue maximum EUR: ${b.revenueMax || "No maximum"}
Segments: ${(b.segments || []).join(", ") || "Any"}
Similarity mode: ${b.mode || "broad"}

ALREADY FOUND / DO NOT RETURN:
${excludedNames.length ? excludedNames.join("; ") : "None"}

SIMILARITY LABEL:
- High: strong business-model fit and multiple supported positive signals
- Medium: credible fit but fewer supported signals
- Low: only use when still plausibly relevant
Prioritize High and Medium.

Return up to ${batchSize} supported companies for THIS track. Aim to fill the batch without fabricating weak candidates.
`;
}

async function runTrack(b, strategy, batchSize, excludedNames=[]) {
  const controller = new AbortController();
  const timeoutMs = 85000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const r = await fetch("https://api.openai.com/v1/responses", {
      method:"POST",
      signal:controller.signal,
      headers:{
        "Authorization":`Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type":"application/json"
      },
      body:JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-6.1-terra",
        store:false,
        reasoning:{effort:"low"},
        tools:[{type:"web_search", search_context_size:"medium"}],
        input:buildPrompt(b, strategy, batchSize, excludedNames),
        text:{
          format:{
            type:"json_schema",
            name:"apeiron_company_search",
            strict:true,
            schema:companySchema
          }
        }
      })
    });

    const raw = await r.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(
        `OpenAI returned a non-JSON response in ${strategy.name} (HTTP ${r.status}): ${raw.slice(0,220)}`
      );
    }

    if (!r.ok) {
      throw new Error(data?.error?.message || `OpenAI request failed in ${strategy.name} (HTTP ${r.status})`);
    }

    const out = extractOutputText(data);
    if (!out) throw new Error(`No structured output returned in ${strategy.name}`);

    try {
      return JSON.parse(out).companies || [];
    } catch {
      throw new Error(`Structured output could not be parsed in ${strategy.name}`);
    }
  } catch (e) {
    if (e?.name === "AbortError") {
      throw new Error(`${strategy.name} timed out after ${Math.round(timeoutMs/1000)} seconds`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({error:"Use POST"});
  if (!process.env.OPENAI_API_KEY) return res.status(500).json({error:"OPENAI_API_KEY is not configured on the server."});

  const b = req.body || {};
  const limit = Math.min(Math.max(Number(b.limit || 20), 1), 50);

  const trackCount = limit <= 10 ? 2 : limit <= 20 ? 3 : 4;
  const strategies = SEARCH_STRATEGIES.slice(0, trackCount);
  const batchSize = Math.min(20, Math.max(10, Math.ceil((limit * 1.7) / trackCount)));

  try {
    const settled = await Promise.allSettled(
      strategies.map(s => runTrack(b, s, batchSize))
    );

    const raw = [];
    const warnings = [];
    for (let i=0;i<settled.length;i++) {
      const x = settled[i];
      if (x.status === "fulfilled") raw.push(...x.value);
      else warnings.push(`${strategies[i].name}: ${x.reason?.message || "failed"}`);
    }

    let merged = dedupeCompanies(raw);

    if (merged.length < limit && merged.length >= Math.min(8, Math.ceil(limit * 0.2))) {
      const missing = limit - merged.length;
      const recoverySize = Math.min(20, Math.max(10, missing + 7));
      try {
        const recovery = await runTrack(
          b,
          {
            name:"long-tail-recovery",
            focus:"Search the long tail for independent national pharma companies, regional MAHs, portfolio-driven commercial companies, specialist pharma, consumer-health firms, own-brand distributors and manufacturer-commercial hybrids. Focus on BUSINESS MODEL fit and external sourcing/licensing potential. Avoid already-found names."
          },
          recoverySize,
          merged.map(c => c.name).slice(0,100)
        );
        merged = dedupeCompanies([...merged, ...recovery]);
      } catch (e) {
        warnings.push(`long-tail-recovery: ${e.message}`);
      }
    }

    const companies = merged.slice(0, limit);
    return res.status(200).json({
      companies,
      meta:{
        requested:limit,
        returned:companies.length,
        raw_candidates:raw.length,
        search_tracks:strategies.length,
        scoring:"Apeiron Fit 0-100, business-model first",
        warnings
      }
    });
  } catch (e) {
    return res.status(500).json({error:e.message || "Unexpected server error"});
  }
};
