import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server@1";
const allowedOrigins=new Set(["https://behindthepaycheck.in","https://www.behindthepaycheck.in","http://localhost:5500","http://127.0.0.1:5500"]);
function json(body:unknown,status=200,origin:string|null=null){const h=new Headers({"Content-Type":"application/json; charset=utf-8","Cache-Control":"public, max-age=60","Vary":"Origin"});if(origin&&allowedOrigins.has(origin))h.set("Access-Control-Allow-Origin",origin);return new Response(JSON.stringify(body),{status,headers:h})}
Deno.serve(withSupabase({auth:"publishable"},async(req:Request,ctx)=>{
 const origin=req.headers.get("origin");
 if(req.method==="OPTIONS"){const h=new Headers({"Access-Control-Allow-Methods":"GET, OPTIONS","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Vary":"Origin"});if(origin&&allowedOrigins.has(origin))h.set("Access-Control-Allow-Origin",origin);return new Response(null,{status:204,headers:h})}
 if(origin&&!allowedOrigins.has(origin))return json({error:"Origin not allowed"},403,origin);
 if(req.method!=="GET")return json({error:"Method not allowed"},405,origin);
 const db=ctx.supabaseAdmin;
 const {data:reports,error}=await db.from("reports").select("id,report_group,company_id,created_at,gender,experience_range").eq("status","approved");
 if(error){console.error("Trend aggregation failed:",error.message);return json({error:"Trends unavailable"},503,origin)}
 const rows=reports||[],ids=rows.map((r:any)=>r.id),companyIds=[...new Set(rows.map((r:any)=>r.company_id).filter(Boolean))];
 let links:any[]=[];if(ids.length){const q=await db.from("report_issues").select("report_id,issue_id").in("report_id",ids);if(q.error){console.error("Issue aggregation failed:",q.error.message);return json({error:"Trends unavailable"},503,origin)}links=q.data||[]}
 const iq=await db.from("issues").select("id,label").eq("active",true);if(iq.error)return json({error:"Trends unavailable"},503,origin);
 let companies:any[]=[];if(companyIds.length){const q=await db.from("companies").select("id,display_name").in("id",companyIds);if(q.error)return json({error:"Trends unavailable"},503,origin);companies=q.data||[]}
 const labelMap=new Map((iq.data||[]).map((x:any)=>[x.id,x.label])),companyMap=new Map(companies.map((x:any)=>[x.id,x.display_name])),counts=new Map<string,number>();
 for(const l of links)counts.set(l.issue_id,(counts.get(l.issue_id)||0)+1);
 const issues=[...counts.entries()].map(([id,count])=>({id,label:labelMap.get(id)||id,count})).sort((a,b)=>b.count-a.count);
 const cc=new Map<string,{company:string,count:number}>();for(const r of rows){if(r.report_group!=="it"||!r.company_id)continue;const name=companyMap.get(r.company_id);if(!name)continue;const key=String(name).toLowerCase(),v=cc.get(key)||{company:name,count:0};v.count++;cc.set(key,v)}
 const publicCompanies=[...cc.values()].filter(x=>x.count>=5).sort((a,b)=>b.count-a.count).slice(0,10);
 const safeBuckets=(field:string,labels:Record<string,string>)=>{const m=new Map<string,number>();for(const r of rows){const v=r[field];if(!v||v==="prefer-not-to-say")continue;m.set(v,(m.get(v)||0)+1)}return [...m.entries()].filter(([,count])=>count>=5).map(([id,count])=>({id,label:labels[id]||id,count})).sort((a,b)=>b.count-a.count)};
 const gender_trends=safeBuckets("gender",{"woman":"Women","man":"Men","non-binary":"Non-binary"});
 const experience_trends=safeBuckets("experience_range",{"0-1":"0–1 years","1-3":"1–3 years","3-5":"3–5 years","5-8":"5–8 years","8+":"8+ years"});

 let policy_changes:any[]=[];const pq=await db.from("policy_changes").select("id,title,description,evidence_url,effective_date,submitted_at,company_id").eq("status","approved").not("evidence_url","is",null).order("effective_date",{ascending:false,nullsFirst:false}).limit(20);if(pq.error){console.error("Policy tracker aggregation failed:",pq.error.message);return json({error:"Trends unavailable"},503,origin)}if((pq.data||[]).length){const pids=[...new Set((pq.data||[]).map((p:any)=>p.company_id).filter(Boolean))];let pcompanies:any[]=[];if(pids.length){const pc=await db.from("companies").select("id,display_name").in("id",pids);if(pc.error)return json({error:"Trends unavailable"},503,origin);pcompanies=pc.data||[]}const pmap=new Map(pcompanies.map((c:any)=>[c.id,c.display_name]));policy_changes=(pq.data||[]).map((p:any)=>({id:p.id,title:p.title,description:p.description,evidence_url:p.evidence_url,effective_date:p.effective_date,company:pmap.get(p.company_id)||"Company not specified"}))}
 const daily=[];for(let i=6;i>=0;i--){const d=new Date(Date.now()-i*86400000),key=d.toLocaleDateString("en-CA",{timeZone:"Asia/Kolkata"});daily.push({day:d.toLocaleDateString("en-IN",{day:"numeric",month:"short",timeZone:"Asia/Kolkata"}),count:rows.filter((r:any)=>new Date(r.created_at).toLocaleDateString("en-CA",{timeZone:"Asia/Kolkata"})===key).length})}
 return json({total_reports:rows.length,personal_reports:rows.filter((r:any)=>r.report_group==="personal").length,it_reports:rows.filter((r:any)=>r.report_group==="it").length,total_issue_selections:links.length,issues,companies:publicCompanies,gender_trends,experience_trends,policy_changes,daily},200,origin);
}));
