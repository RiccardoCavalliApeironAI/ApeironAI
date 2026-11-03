const REFERENCE_ARCHETYPES = [
  {
    name:"Commercial / sourcing-led",
    examples:["Pharmaidea","Neo Health OTC","Orifarm","Evolan","Goodwill Pharma"],
    description:"Commercial organizations with own portfolio/brands and meaningful external sourcing, in-licensing, distribution partnerships or portfolio acquisition."
  },
  {
    name:"Specialist commercial pharma",
    examples:["Horus Pharma","Brill Pharma","SEID Lab","Exeltis"],
    description:"Focused pharma companies with strong market-facing organization, own brands/portfolio and willingness to source or license products externally. Therapeutic area itself is NOT the similarity signal."
  },
  {
    name:"Manufacturer + commercial portfolio",
    examples:["STADA","Cinfa","Polpharma","Kern Pharma","Bluepharma","Menarini","ESTEVE","Aurovitas","Dr. Reddy's"],
    description:"Integrated manufacturers that also commercialize own portfolios, act as MAH, license/acquire products or maintain active business-development functions. Manufacturing is never a negative signal."
  },
  {
    name:"Regional portfolio builder",
    examples:["PRO.MED.CS Praha a.s.","Farmasyn S.A.","Fertilland","Noscat GmbH","Levante Farma","Frezy Derm","Aboutmeds","Orus Pharma"],
    description:"Independent or regional healthcare companies building portfolios through own brands, sourcing, partnerships, distribution or licensing."
  }
];

const ALL_REFERENCE_NAMES = REFERENCE_ARCHETYPES.flatMap(x => x.examples);

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
          business_model_profile:{type:"string"},
          fit_score:{type:"integer",minimum:0,maximum:100},
          similar_to:{type:"array",items:{type:"string"}},
          why_relevant:{type:"string"},
          evidence_snippet:{type:"string"},
          source_url:{type:"string"}
        },
        required:[
          "name","country","website","domain","business_model_profile","fit_score",
          "similar_to","why_relevant","evidence_snippet","source_url"
        ]
      }
    }
  },
  required:["companies"]
};

function normalizeName(x){
  return String(x||"").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/\b(sp\.?\s*z\.?\s*o\.?\s*o\.?|s\.?a\.?|s\.?l\.?|srl|gmbh|ltd|limited|ab|as|oy|sas|spa|pharma|pharmaceuticals?)\b/g," ")
    .replace(/[^a-z0-9]+/g," ").trim();
}
function normalizeDomain(x){
  return String(x||"").toLowerCase().replace(/^https?:\/\//,"").replace(/^www\./,"").split("/")[0].trim();
}
function isReference(name){
  const n=normalizeName(name);
  return ALL_REFERENCE_NAMES.some(r=>{
    const rn=normalizeName(r);
    return n===rn || (n && rn && (n.includes(rn)||rn.includes(n)));
  });
}
function dedupe(all){
  const m=new Map();
  for(const c of all){
    if(!c?.name || isReference(c.name)) continue;
    c.domain=normalizeDomain(c.domain||c.website);
    const key=c.domain || `${normalizeName(c.name)}|${String(c.country||"").toLowerCase()}`;
    if(!key) continue;
    const prev=m.get(key);
    if(!prev || Number(c.fit_score||0)>Number(prev.fit_score||0)) m.set(key,c);
  }
  return [...m.values()].sort((a,b)=>Number(b.fit_score||0)-Number(a.fit_score||0));
}

function buildPrompt(b, track, batchSize){
  const liked=(b.likedCompanies||[]).slice(0,30);
  const disliked=(b.dislikedCompanies||[]).slice(0,30);
  const excludeNames=(b.excludeNames||[]).slice(0,150);

  return `
You are the discovery engine for Apeiron AI, used by a pharmaceutical business-development company.

PRIMARY TASK:
Find NEW companies whose BUSINESS MODEL resembles one or more of these validated reference archetypes.

REFERENCE ARCHETYPES:
${REFERENCE_ARCHETYPES.map(a=>`- ${a.name}: ${a.examples.join(", ")}. ${a.description}`).join("\n")}

THIS SEARCH TRACK:
${track}

WHAT MAKES A STRONG MATCH:
1. Own portfolio / own brands / MAH or commercial responsibility.
2. External sourcing, in-licensing, product acquisition, private label, distribution partnerships, co-marketing, or third-party finished products.
3. Active portfolio expansion / frequent launches / partnership-driven growth.
4. Real commercial organization and ability to bring products to market.
5. Manufacturing capability may be present or absent; it must NEVER penalize the company.

IMPORTANT:
- Similarity is about BUSINESS MODEL, not therapeutic area.
- Do not over-focus on ophthalmology because Horus and Brill are references.
- Do not over-focus on company size.
- Do not require a company to be "B2B-only".
- Do not require all signals; one archetype match can be enough.
- Exclude pure wholesalers with no own portfolio, pharmacies, hospitals, CRO-only companies, API-only traders, and CDMO-only companies with no meaningful commercial portfolio.
- Do not return any reference company itself.

USER TARGET REGION:
${b.region || "Europe"}

USER FEEDBACK FROM PRIOR SEARCHES:
Liked companies (more like these): ${liked.length ? liked.join("; ") : "none"}
Disliked companies (avoid similar profiles): ${disliked.length ? disliked.join("; ") : "none"}

ALREADY FOUND / DO NOT RETURN:
${excludeNames.length ? excludeNames.join("; ") : "none"}

DISCOVERY RULES:
- Search broadly in English and local-language terms where useful.
- Prefer official company sources for verification.
- Return up to ${batchSize} candidates.
- Every company must be real and have one real source URL.
- Keep the initial assessment concise; deep research happens later.
- fit_score 0–100 should primarily measure business-model fit.
- similar_to should name 1–3 reference companies that are comparable mainly by business model.
- It is acceptable to return smaller, regional, or less famous firms if the business model fits.
- Do NOT invent companies, websites, or evidence.
`;
}

async function runTrack(b,track,batchSize){
  if(!process.env.OPENAI_MODEL) throw new Error("OPENAI_MODEL is not configured.");
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),55000);
  try{
    const r=await fetch("https://api.openai.com/v1/responses",{
      method:"POST",
      signal:controller.signal,
      headers:{
        "Authorization":`Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type":"application/json"
      },
      body:JSON.stringify({
        model:process.env.OPENAI_MODEL,
        store:false,
        reasoning:{effort:"low"},
        tools:[{type:"web_search",search_context_size:"low"}],
        input:buildPrompt(b,track,batchSize),
        text:{format:{type:"json_schema",name:"apeiron_reference_discovery",strict:true,schema:companySchema}}
      })
    });

    const raw=await r.text();
    let data;
    try{data=JSON.parse(raw)}catch{
      throw new Error(`OpenAI returned non-JSON (HTTP ${r.status}): ${raw.slice(0,180)}`);
    }
    if(!r.ok) throw new Error(data?.error?.message || `OpenAI HTTP ${r.status}`);
    const out=extractOutputText(data);
    if(!out) throw new Error("No structured output returned.");
    return JSON.parse(out).companies || [];
  }catch(e){
    if(e?.name==="AbortError") throw new Error("Search track timed out.");
    throw e;
  }finally{clearTimeout(timer)}
}

module.exports=async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({error:"Use POST"});
  if(!process.env.OPENAI_API_KEY) return res.status(500).json({error:"OPENAI_API_KEY is not configured."});
  if(!process.env.OPENAI_MODEL) return res.status(500).json({error:"OPENAI_MODEL is not configured."});

  const b=req.body||{};
  const limit=Math.min(Math.max(Number(b.limit||30),1),50);

  const tracks = limit<=20
    ? [
        "Search broadly for own-brand / MAH / licensing / sourcing-oriented commercial pharma companies.",
        "Search for manufacturer + commercial hybrids and regional portfolio builders."
      ]
    : [
        "Search broadly for own-brand / MAH / licensing / sourcing-oriented commercial pharma companies.",
        "Search for manufacturer + commercial hybrids with active licensing, external sourcing or portfolio acquisition.",
        "Search for independent regional pharma, OTC, medical-device and supplement portfolio builders with their own brands.",
        "Search for specialist commercial pharma companies with strong partnership-driven portfolio growth."
      ];

  const batchSize = limit<=20 ? 15 : 18;

  const settled=await Promise.allSettled(tracks.map(t=>runTrack(b,t,batchSize)));
  const all=[];
  const warnings=[];
  for(const x of settled){
    if(x.status==="fulfilled") all.push(...x.value);
    else warnings.push(x.reason?.message||"Search track failed");
  }

  const companies=dedupe(all).slice(0,limit);

  return res.status(200).json({
    companies,
    meta:{
      requested:limit,
      returned:companies.length,
      reference_companies:ALL_REFERENCE_NAMES.length,
      approach:"reference-first discovery; business-model ranking",
      warnings
    }
  });
};
