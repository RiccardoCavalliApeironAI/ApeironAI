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

const schema={
  type:"object",additionalProperties:false,
  properties:{
    revenue_estimate:{type:"string"},
    company_type:{type:"string"},
    own_brand_evidence:{type:"string"},
    licensing_sourcing_evidence:{type:"string"},
    portfolio_expansion_evidence:{type:"string"},
    commercial_reach_evidence:{type:"string"},
    relevant_segments:{type:"array",items:{type:"string"}},
    why_relevant:{type:"string"},
    sources:{
      type:"array",
      items:{
        type:"object",additionalProperties:false,
        properties:{title:{type:"string"},url:{type:"string"}},
        required:["title","url"]
      }
    }
  },
  required:["revenue_estimate","company_type","own_brand_evidence","licensing_sourcing_evidence","portfolio_expansion_evidence","commercial_reach_evidence","relevant_segments","why_relevant","sources"]
};

module.exports=async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({error:"Use POST"});
  if(!process.env.OPENAI_API_KEY) return res.status(500).json({error:"OPENAI_API_KEY missing"});
  if(!process.env.OPENAI_MODEL) return res.status(500).json({error:"OPENAI_MODEL missing"});
  const b=req.body||{};
  if(!b.name && !b.domain) return res.status(400).json({error:"Missing company"});

  const prompt=`
Deeply research this company for Apeiron Pharma business development.

Company: ${b.name||""}
Domain: ${b.domain||""}
Country: ${b.country||""}

Assess BUSINESS MODEL:
- own brands / own portfolio / MAH
- evidence of in-licensing, external sourcing, acquisition, third-party finished products, private label or distribution partnerships
- portfolio expansion / new launches
- commercial reach and market presence
- relevant generics, Rx, OTC, medical devices, supplements
- revenue only if reliably available; otherwise "Unknown"

Therapeutic area itself is not a similarity criterion.
Prefer official sources. Never invent facts.
`;

  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),65000);
  try{
    const r=await fetch("https://api.openai.com/v1/responses",{
      method:"POST",signal:controller.signal,
      headers:{"Authorization":`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},
      body:JSON.stringify({
        model:process.env.OPENAI_MODEL,store:false,reasoning:{effort:"low"},
        tools:[{type:"web_search",search_context_size:"medium"}],
        input:prompt,
        text:{format:{type:"json_schema",name:"apeiron_company_enrichment",strict:true,schema}}
      })
    });
    const raw=await r.text();let data;
    try{data=JSON.parse(raw)}catch{return res.status(502).json({error:`Non-JSON response: ${raw.slice(0,180)}`})}
    if(!r.ok) return res.status(r.status).json({error:data?.error?.message||`OpenAI HTTP ${r.status}`});
    const out=extractOutputText(data);
    if(!out) return res.status(500).json({error:"No structured output"});
    return res.status(200).json(JSON.parse(out));
  }catch(e){
    if(e?.name==="AbortError") return res.status(504).json({error:"Analysis timed out"});
    return res.status(500).json({error:e.message||"Unexpected error"});
  }finally{clearTimeout(timer)}
};
