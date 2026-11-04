const REFERENCE_SET = [
  "Goodwill Pharma (Hungary)", "Fertilland (Greece)", "Kern Pharma (Spain)",
  "Noscat GmbH (Austria)", "Cinfa (Spain)", "Horus Pharma (France)",
  "Brill Pharma (Spain)", "Menarini (Italy)", "Polpharma (Poland)",
  "STADA (Germany)", "Bluepharma (Portugal)", "SEID Lab (Spain)",
  "Dr. Reddy's (UK)", "Levante Farma (Italy)", "ESTEVE (Spain)",
  "Evolan (Sweden)", "Orifarm (Denmark)", "Orus Pharma (Denmark)"
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

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({error:"Use POST"});
  if (!process.env.OPENAI_API_KEY) return res.status(500).json({error:"OPENAI_API_KEY is not configured on the server."});

  const b = req.body || {};
  const limit = Math.min(Math.max(Number(b.limit || 20), 1), 50);
  const prompt = `
You are the research engine for Apeiron AI, a pharmaceutical business-development lead finder.

REFERENCE COMPANIES THAT DEFINE THE TARGET PROFILE:
${REFERENCE_SET.join("; ")}

GOAL:
Find NEW companies similar to the reference set. Do not return any reference company itself.

CORE MATCHING LOGIC:
- Commercial pharmaceutical/healthcare company, MAH, distributor with own portfolio, or manufacturer with commercial activity.
- Strong positive signals: own brands/own portfolio, in-licensing, external sourcing, product acquisition, private label, distribution partnerships, active portfolio expansion.
- Relevant segments include generics, medical devices, food supplements, OTC and Rx.
- A company can be specialized in one therapeutic area or multi-therapeutic.
- Do NOT require the company to operate exclusively B2B.
- Exclude pure wholesalers with no own portfolio, retail pharmacies, hospitals, CROs, API-only traders, and companies without relevant commercial activity.
- Never invent revenue, business model, portfolio evidence, licensing activity or URLs. Use "Unknown" if reliable evidence is unavailable.
- Prefer official company sources; reputable business sources may supplement them.
- Each returned company must include at least one web source supporting its relevance.

USER FILTERS:
Region/country: ${b.region || "Europe"}
Therapeutic area: ${b.therapeuticArea || "Any"}
Revenue minimum EUR: ${b.revenueMin || "No minimum"}
Revenue maximum EUR: ${b.revenueMax || "No maximum"}
Segments: ${(b.segments || []).join(", ") || "Any"}
Similarity mode: ${b.mode || "broad"}
Additional exclusions: ${b.exclude || "None"}
Requested companies: ${limit}

SIMILARITY LABEL:
Use only "High", "Medium", or "Low". Prioritize High and Medium. "similar_to" must name 1-3 companies from the reference set that are meaningfully comparable.

Return up to ${limit} genuinely supported companies. It is better to return fewer companies than to fabricate weak matches.
`;

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
            similarity:{type:"string", enum:["High","Medium","Low"]},
            similar_to:{type:"array", items:{type:"string"}},
            segments:{type:"array", items:{type:"string"}},
            therapeutic_areas:{type:"array", items:{type:"string"}},
            own_brand_evidence:{type:"string"},
            licensing_sourcing_evidence:{type:"string"},
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
          required:["name","country","website","domain","revenue_estimate","company_type","similarity","similar_to","segments","therapeutic_areas","own_brand_evidence","licensing_sourcing_evidence","why_relevant","sources"]
        }
      }
    },
    required:["companies"]
  };

  try {
    const r = await fetch("https://api.openai.com/v1/responses", {
      method:"POST",
      headers:{
        "Authorization":`Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type":"application/json"
      },
      body:JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5.6-terra",
        store:false,
        reasoning:{effort:"medium"},
        tools:[{type:"web_search", search_context_size:"high"}],
        input:prompt,
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

    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({error:data?.error?.message || "OpenAI request failed", detail:data});
    const out = extractOutputText(data);
    if (!out) return res.status(500).json({error:"No structured output returned by the research engine."});
    const parsed = JSON.parse(out);
    return res.status(200).json(parsed);
  } catch (e) {
    return res.status(500).json({error:e.message || "Unexpected server error"});
  }
};
