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
 const {data:reports,error}=await db.from("reports").select("id,report_group,company_id,created_at").eq("status","approved");
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
 const daily=[];for(let i=6;i>=0;i--){const d=new Date(Date.now()-i*86400000),key=d.toLocaleDateString("en-CA",{timeZone:"Asia/Kolkata"});daily.push({day:d.toLocaleDateString("en-IN",{day:"numeric",month:"short",timeZone:"Asia/Kolkata"}),count:rows.filter((r:any)=>new Date(r.created_at).toLocaleDateString("en-CA",{timeZone:"Asia/Kolkata"})===key).length})}
 return json({total_reports:rows.length,personal_reports:rows.filter((r:any)=>r.report_group==="personal").length,it_reports:rows.filter((r:any)=>r.report_group==="it").length,total_issue_selections:links.length,issues,companies:publicCompanies,daily},200,origin);
}));
