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
 if(typeof b?.withdrawal_code!=="string"||b.withdrawal_code.length<20||b.withdrawal_code.length>100)return reply({error:"Enter the withdrawal code saved after submission."},400,origin);
 const digest=await sha(b.withdrawal_code),db=ctx.supabaseAdmin;
 const found=await db.from("reports").select("id").eq("withdrawal_hash",digest).maybeSingle();
 if(found.error)return reply({error:"Unable to verify withdrawal code."},503,origin);
 if(!found.data)return reply({error:"The code is invalid or the post has already been withdrawn."},404,origin);
 const removed=await db.from("reports").delete().eq("id",found.data.id).eq("withdrawal_hash",digest).select("id").maybeSingle();
 if(removed.error||!removed.data)return reply({error:"Unable to withdraw the post. Please try again."},503,origin);
 return reply({success:true,message:"The post and its linked issue records have been deleted."},200,origin);
}));