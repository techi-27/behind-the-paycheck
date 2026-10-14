import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server@1";
const origins=new Set(["https://behindthepaycheck.in","https://www.behindthepaycheck.in","http://localhost:5500","http://127.0.0.1:5500"]);
function reply(body:unknown,status=200,origin:string|null=null){const h=new Headers({"Content-Type":"application/json; charset=utf-8","Cache-Control":"public, max-age=300, s-maxage=300","Vary":"Origin"});if(origin&&origins.has(origin))h.set("Access-Control-Allow-Origin",origin);return new Response(JSON.stringify(body),{status,headers:h})}
Deno.serve(withSupabase({auth:"publishable"},async(req:Request,ctx)=>{
 const origin=req.headers.get("origin");
 if(req.method==="OPTIONS"){if(origin&&!origins.has(origin))return new Response(null,{status:403});const h=new Headers({"Access-Control-Allow-Methods":"GET, OPTIONS","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Vary":"Origin"});if(origin)h.set("Access-Control-Allow-Origin",origin);return new Response(null,{status:204,headers:h})}
 if(origin&&!origins.has(origin))return reply({error:"Origin not allowed"},403,origin);
 if(req.method!=="GET")return reply({error:"Method not allowed"},405,origin);
 const q=(new URL(req.url).searchParams.get("q")||"").trim().replace(/[%_]/g,"").slice(0,60);
 if(q.length<2)return reply({companies:[]},200,origin);
 const db=ctx.supabaseAdmin;
 const counts=await db.from("company_counts_min5").select("company_id,report_count").limit(5000);
 if(counts.error)return reply({error:"Company suggestions unavailable."},503,origin);
 const ids=(counts.data||[]).map((x:any)=>x.company_id);
 if(!ids.length)return reply({companies:[]},200,origin);
 const found=await db.from("companies").select("id,display_name").in("id",ids).ilike("display_name","%"+q+"%").order("display_name").limit(12);
 if(found.error)return reply({error:"Company suggestions unavailable."},503,origin);
 return reply({companies:(found.data||[]).map((x:any)=>({name:x.display_name})),minimum_reports:5},200,origin);
}));