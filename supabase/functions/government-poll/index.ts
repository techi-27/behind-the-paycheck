import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server@1";
const origins=new Set(["https://behindthepaycheck.in","https://www.behindthepaycheck.in","http://localhost:5500","http://127.0.0.1:5500"]);
const options=new Set(["layoff-insurance","notice-regulation","severance-tax-relief","faster-grievance-portal","other"]);
function reply(body:unknown,status=200,origin:string|null=null){const h=new Headers({"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","Vary":"Origin"});if(origin&&origins.has(origin))h.set("Access-Control-Allow-Origin",origin);return new Response(JSON.stringify(body),{status,headers:h})}
async function sha(s:string){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).map(x=>x).join("")}
Deno.serve(withSupabase({auth:"publishable"},async(req,ctx)=>{
 const origin=req.headers.get("origin");
 if(req.method==="OPTIONS"){if(origin&&!origins.has(origin))return new Response(null,{status:403});const h=new Headers({"Access-Control-Allow-Methods":"GET, POST, OPTIONS","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Vary":"Origin"});if(origin)h.set("Access-Control-Allow-Origin",origin);return new Response(null,{status:204,headers:h})}
 if(origin&&!origins.has(origin))return reply({error:"Origin not allowed"},403,origin);
 const db=ctx.supabaseAdmin;
 if(req.method==="GET"){
  const q=await db.from("government_poll").select("option_slug").order("created_at",{ascending:false}).limit(50000);
  if(q.error)return reply({error:"Poll results unavailable."},503,origin);
  const counts:Record<string,number>={};for(const row of q.data||[])counts[row.option_slug]=(counts[row.option_slug]||0)+1;
  return reply({results:[...options].map(option=>({option,count:counts[option]||0})),total:(q.data||[]).length,anonymous:true},200,origin);
 }
 if(req.method!=="POST")return reply({error:"Method not allowed"},405,origin);
 let b:any;try{b=await req.json()}catch{return reply({error:"Invalid JSON"},400,origin)}
 if(!options.has(b?.option_slug))return reply({error:"Choose one of the available options."},400,origin);
 if(typeof b?.client_token!=="string"||!/^[0-9a-f-]{36}$/i.test(b.client_token))return reply({error:"Poll token missing. Refresh and try again."},400,origin);
 const other=typeof b.other_text==="string"?b.other_text.trim():"";
 if(b.option_slug==="other"&&(!other||other.length>120))return reply({error:"For Other, add a short answer of up to 120 characters."},400,origin);
 const voterHash=await sha("government-poll|"+b.client_token);
 const saved=await db.from("government_poll").insert({option_slug:b.option_slug,other_text:b.option_slug==="other"?other:null,voter_hash:voterHash});
 if(saved.error){if(saved.error.code==="23505")return reply({error:"This browser has already voted."},429,origin);return reply({error:"Unable to save vote."},503,origin)}
 return reply({success:true,message:"Your anonymous vote has been recorded."},201,origin);
}));