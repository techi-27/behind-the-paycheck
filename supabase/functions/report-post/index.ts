import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server@1";
const origins=new Set(["https://behindthepaycheck.in","https://www.behindthepaycheck.in","http://localhost:5500","http://127.0.0.1:5500"]);
function reply(body:unknown,status=200,origin:string|null=null){const h=new Headers({"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","Vary":"Origin"});if(origin&&origins.has(origin))h.set("Access-Control-Allow-Origin",origin);return new Response(JSON.stringify(body),{status,headers:h})}
async function sha(s:string){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("")}
Deno.serve(withSupabase({auth:"publishable"},async(req,ctx)=>{
 const origin=req.headers.get("origin");
 if(req.method==="OPTIONS"){if(origin&&!origins.has(origin))return new Response(null,{status:403});const h=new Headers({"Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Vary":"Origin"});if(origin)h.set("Access-Control-Allow-Origin",origin);return new Response(null,{status:204,headers:h})}
 if(origin&&!origins.has(origin))return reply({error:"Origin not allowed"},403,origin);
 if(req.method!=="POST")return reply({error:"Method not allowed"},405,origin);
 let b:any;try{b=await req.json()}catch{return reply({error:"Invalid JSON"},400,origin)}
 if(typeof b?.report_id!=="string"||!/^[0-9a-f-]{36}$/i.test(b.report_id))return reply({error:"Invalid post."},400,origin);
 if(typeof b?.device_token!=="string"||!/^[0-9a-f-]{36}$/i.test(b.device_token))return reply({error:"Report token missing."},400,origin);
 const reasons=new Set(["personal-info","harassment","false-information","spam","other"]);
 if(!reasons.has(b.reason_code))return reply({error:"Choose a report reason."},400,origin);
 const db=ctx.supabaseAdmin, deviceHash=await sha(b.report_id+"|"+b.device_token);
 const target=await db.from("reports").select("id,public_status,public_text,roast_text").eq("id",b.report_id).maybeSingle();
 if(target.error)return reply({error:"Unable to load post."},503,origin);
 if(!target.data||target.data.public_status!=="published"||!(target.data.public_text||target.data.roast_text))return reply({error:"This post is not available to report."},404,origin);
 const result=await db.from("post_flags").insert({report_id:b.report_id,device_hash,reason_code:b.reason_code});
 if(result.error){if(result.error.code==="23505")return reply({success:true,message:"This device has already reported this post."},200,origin);return reply({error:"Unable to submit report."},503,origin)}
 const count=await db.from("post_flags").select("device_hash",{count:"exact",head:true}).eq("report_id",b.report_id);
 if(count.error)return reply({error:"Report received, but the post status could not be confirmed."},200,origin);
 const total=count.count||0;
 return reply({success:true,hidden:total>=3,message:total>=3?"The post has been hidden for review.":"Thank you. Reports are reviewed automatically; three distinct device tokens hide a post."},201,origin);
}));