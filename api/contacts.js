const ROLE_WORDS = [
  "business development","licensing","license","portfolio","commercial","international business",
  "partnership","alliances","corporate development","procurement","managing director","chief executive","ceo"
];

const GENERIC_PREFIXES = [
  "businessdevelopment","business-development","bd","licensing","license","commercial","sales",
  "international","partnerships","info","contact"
];

function scoreContact(x){
  const position=(x.position||"").toLowerCase();
  const department=(x.department||"").toLowerCase();
  let s=0;
  for(const w of ROLE_WORDS) if(position.includes(w)) s+=20;
  if(["executive","management","senior"].includes((x.seniority||"").toLowerCase())) s+=8;
  if(["sales","executive","management"].includes(department)) s+=5;
  s += Math.min(Number(x.confidence||0)/10,10);
  return s;
}

module.exports = async function handler(req,res){
  if(req.method!=="GET") return res.status(405).json({error:"Use GET"});
  if(!process.env.HUNTER_API_KEY) return res.status(500).json({error:"HUNTER_API_KEY is not configured on the server."});
  const domain=(req.query.domain||"").trim().toLowerCase();
  if(!domain) return res.status(400).json({error:"Missing domain"});

  try{
    const u=new URL("https://api.hunter.io/v2/domain-search");
    u.searchParams.set("domain",domain);
    u.searchParams.set("limit","100");
    u.searchParams.set("api_key",process.env.HUNTER_API_KEY);

    const r=await fetch(u);
    const data=await r.json();
    if(!r.ok) return res.status(r.status).json({error:data?.errors?.[0]?.details || "Hunter request failed"});

    const emails=data?.data?.emails || [];
    const personal=emails
      .filter(x=>x.type==="personal" && x.value)
      .map(x=>({
        email:x.value,
        first_name:x.first_name||"",
        last_name:x.last_name||"",
        position:x.position||"",
        seniority:x.seniority||"",
        department:x.department||"",
        confidence:x.confidence ?? null,
        linkedin:x.linkedin||"",
        source_note:(x.sources&&x.sources.length) ? `Found in ${x.sources.length} public source(s)` : "Returned by Hunter"
      }))
      .map(x=>({...x,_score:scoreContact(x)}))
      .filter(x=>x._score>=12)
      .sort((a,b)=>b._score-a._score)
      .slice(0,5)
      .map(({_score,...x})=>x);

    const generic=emails
      .filter(x=>x.type==="generic" && x.value)
      .filter(x=>GENERIC_PREFIXES.includes(x.value.split("@")[0].toLowerCase()))
      .slice(0,3)
      .map(x=>({email:x.value,confidence:x.confidence ?? null}));

    return res.status(200).json({
      organization:data?.data?.organization || "",
      pattern:data?.data?.pattern || "",
      contacts:personal,
      fallback:generic
    });
  }catch(e){
    return res.status(500).json({error:e.message || "Unexpected server error"});
  }
};
