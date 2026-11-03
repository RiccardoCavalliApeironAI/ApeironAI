const REFERENCE_SET = [
  "Goodwill Pharma (Hungary)","Fertilland (Greece)","Kern Pharma (Spain)",
  "Noscat GmbH (Austria)","Cinfa (Spain)","Horus Pharma (France)",
  "Brill Pharma (Spain)","Menarini (Italy)","Polpharma (Poland)",
  "STADA (Germany)","Bluepharma (Portugal)","SEID Lab (Spain)",
  "Dr. Reddy's (UK)","Levante Farma (Italy)","ESTEVE (Spain)",
  "Evolan (Sweden)","Orifarm (Denmark)","Orus Pharma (Denmark)",
  "Exeltis","Aboutmeds","Pharmaidea","Aurovitas","Farmasyn S.A.",
  "Frezy Derm","Neo Health OTC","PRO.MED.CS Praha a.s."
];

const PRIORITY_ANCHORS = ["Pharmaidea","Neo Health OTC","Horus Pharma","Brill Pharma"];

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

const schema = {
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
          apeiron_fit_score:{type:"integer",minimum:0,maximum:100},
          similarity:{type:"string",enum:["High","Medium","Low"]},
          similar_to:{type:"array",items:{type:"string"}},
          segments:{type:"array",items:{type:"string"}},
          why_relevant:{type:"string"},
          source_url:{type:"string"}
        },
        required:["name","country","website","domain","business_model_profile","apeiron_fit_score","similarity","similar_to","segments","why_relevant","source_url"]
      }
    }
  },
  required:["companies"]
};

function normalizeDomain(x){
  return String(x||"").toLowerCase().replace(/^https?:\/\//,"").replace(/^www\./,"").split("/")[0].trim();
}
function normalizeName(x){
  return String(x||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/\b(sp\.?\s*z\.?\s*o\.?\s*o\.?|s\.?a\.?|s\.?l\.?|srl|gmbh|ltd|limited|ab|as|oy|sas|spa|pharma|pharmaceuticals?)\b/g," ")
    .replace(/[^a-z0-9]+/g," ").trim();
}
function isReference(name){
  const n=normalizeName(name);
  return REFERENCE_SET.some(r=>{
    const rn=normalizeName(r.replace(/\s*\([^)]*\)\s*$/,""));
    return n===rn || (n && rn && (n.includes(rn)||rn.includes(n)));
  });
}

function buildPrompt(b, batchSize, variant){
  const therapy = b.therapeuticArea
    ? `Use "${b.therapeuticArea}" as an explicit filter.`
    : `Therapeutic area is NOT a similarity factor. Do not favor ophthalmology merely because Horus/Brill are references.`;

  const variantText = variant===1
    ? "Prioritize commercial / sourcing-led, MAH, own-brand, licensing and specialist-commercial companies."
    : "Prioritize manufacturer + commercial hybrids, generics/OTC/device/supplement portfolio companies, and less obvious national/regional players.";

  return `
You are the FAST DISCOVERY layer of Apeiron AI.

REFERENCE COMPANIES (all strong positive examples):
${REFERENCE_SET.join("; ")}

Higher-weight BUSINESS-MODEL anchors:
${PRIORITY_ANCHORS.join("; ")}

Goal: find NEW companies Apeiron could approach as buyers, licensees, MAHs, own-brand commercial partners, or companies likely to source/in-license finished products from third parties.

BUSINESS MODEL FIRST:
- strong signals: own portfolio/brands, in-licensing, external sourcing, product acquisition, distribution partnerships, portfolio expansion, commercial organization.
- manufacturing is NOT a negative; manufacturer-commercial hybrids like STADA/Cinfa/Polpharma/Kern/Bluepharma are excellent targets.
- exclude pure wholesalers with no own portfolio, retail pharmacies, hospitals, CRO-only, API-only traders.
- ${therapy}
- ${variantText}

USER FILTERS:
Region/country: ${b.region || "Europe"}
Revenue min EUR: ${b.revenueMin || "none"}
Revenue max EUR: ${b.revenueMax || "none"}
Segments: ${(b.segments||[]).join(", ") || "any"}
Mode: ${b.mode || "broad"}
Additional exclusions: ${b.exclude || "none"}
Already found / DO NOT RETURN AGAIN: ${(b.excludeNames || []).join("; ") || "none"}

FAST MODE RULES:
- Return up to ${batchSize} companies.
- Keep each company concise.
- Do not deeply research every candidate.
- Use web search to verify the company exists and that at least one strong business-model signal is plausible.
- source_url must be a real supporting URL, preferably official.
- Never invent a company or URL.
- Do not return any reference company.
- Score 0-100 for Apeiron fit, based mainly on business model.
`;
}

async function runBatch(b,batchSize,variant){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),45000);
  try{
    const r=await fetch("https://api.openai.com/v1/responses",{
      method:"POST",
      signal:controller.signal,
      headers:{
        "Authorization":`Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type":"application/json"
      },
      body:JSON.stringify({
        model:process.env.OPENAI_MODEL || "chat-latest",
        store:false,
        reasoning:{effort:"low"},
        tools:[{type:"web_search",search_context_size:"low"}],
        input:buildPrompt(b,batchSize,variant),
        text:{format:{type:"json_schema",name:"apeiron_fast_search",strict:true,schema}}
      })
    });

    const raw=await r.text();
    let data;
    try{data=JSON.parse(raw)}catch{
      throw new Error(`OpenAI returned non-JSON (HTTP ${r.status}): ${raw.slice(0,180)}`);
    }
    if(!r.ok) throw new Error(data?.error?.message || `OpenAI HTTP ${r.status}`);
    const out=extractOutputText(data);
    if(!out) throw new Error("No structured output");
    return JSON.parse(out).companies || [];
  } finally {
    clearTimeout(timer);
  }
}

module.exports=async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({error:"Use POST"});
  if(!process.env.OPENAI_API_KEY) return res.status(500).json({error:"OPENAI_API_KEY missing"});

  const b=req.body||{};
  const limit=Math.min(Math.max(Number(b.limit||20),1),50);

  try{
    // 1 call for <=25, 2 diversified calls for 30-50.
    const calls = limit<=25
      ? [runBatch(b,Math.min(limit+5,30),1)]
      : [
          runBatch(b,30,1),
          runBatch(b,30,2)
        ];

    const settled=await Promise.allSettled(calls);
    const all=[];
    const warnings=[];
    for(const x of settled){
      if(x.status==="fulfilled") all.push(...x.value);
      else warnings.push(x.reason?.message || "batch failed");
    }

    const map=new Map();
    for(const c of all){
      if(!c?.name || isReference(c.name)) continue;
      c.domain=normalizeDomain(c.domain||c.website);
      const key=c.domain || `${normalizeName(c.name)}|${String(c.country||"").toLowerCase()}`;
      if(!key) continue;
      const prev=map.get(key);
      if(!prev || Number(c.apeiron_fit_score||0)>Number(prev.apeiron_fit_score||0)) map.set(key,c);
    }

    const companies=[...map.values()]
      .sort((a,b)=>Number(b.apeiron_fit_score||0)-Number(a.apeiron_fit_score||0))
      .slice(0,limit);

    return res.status(200).json({
      companies,
      meta:{
        requested:limit,
        returned:companies.length,
        mode:"fast discovery",
        warnings
      }
    });
  }catch(e){
    return res.status(500).json({error:e.message||"Unexpected server error"});
  }
};
