import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server@1";
const origins=new Set(["https://behindthepaycheck.in","https://www.behindthepaycheck.in","http://localhost:5500","http://127.0.0.1:5500"]);
function json(body:unknown,status=200,origin:string|null=null){const h=new Headers({"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","Vary":"Origin"});if(origin&&origins.has(origin))h.set("Access-Control-Allow-Origin",origin);return new Response(JSON.stringify(body),{status,headers:h})}
Deno.serve(withSupabase({auth:"publishable"},async(req:Request,ctx)=>{
 const origin=req.headers.get("origin");
 if(req.method==="OPTIONS"){if(origin&&!origins.has(origin))return new Response(null,{status:403});const h=new Headers({"Access-Control-Allow-Methods":"GET, POST, OPTIONS","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Vary":"Origin"});if(origin)h.set("Access-Control-Allow-Origin",origin);return new Response(null,{status:204,headers:h})}
 if(origin&&!origins.has(origin))return json({error:"Origin not allowed"},403,origin);
 if(req.method!=="GET"&&req.method!=="POST")return json({error:"Method not allowed"},405,origin);
 const auth=req.headers.get("authorization")||"",token=auth.startsWith("Bearer ")?auth.slice(7):"",apiKey=req.headers.get("apikey")||"";
 if(!token||!apiKey)return json({error:"Sign in with an authorized moderator account."},401,origin);
 const projectUrl=Deno.env.get("SUPABASE_URL");
 if(!projectUrl)return json({error:"Moderator authentication is not configured."},503,origin);
 const verified=await fetch(projectUrl+"/auth/v1/user",{headers:{apikey:apiKey,Authorization:"Bearer "+token}});
 if(!verified.ok)return json({error:"Your session is invalid or expired."},401,origin);
 const user=await verified.json();
 if(!user?.id)return json({error:"Unable to verify account."},401,origin);
 const db=ctx.supabaseAdmin;
 const role=await db.from("moderator_roles").select("role").eq("user_id",user.id).maybeSingle();
 if(role.error)return json({error:"Moderator role lookup failed."},503,origin);
 if(!role.data||!["moderator","admin"].includes(role.data.role))return json({error:"This account does not have a moderator role."},403,origin);

 if(req.method==="GET"){
  const {data,error}=await db.from("reports")
   .select("id,report_type,stage,event_month,public_status,screening_result,screening_reasons,public_text,story_text,roast_text,flag_count,last_flagged_at,created_at,companies(display_name),report_issues(issue_id,issues(label))")
   .or("flag_count.gt.0,public_status.eq.hidden")
   .order("last_flagged_at",{ascending:false,nullsFirst:false}).limit(100);
  if(error){console.error("Flagged moderation queue failed:",error.message);return json({error:"Unable to load flagged posts."},503,origin)}
  return json({posts:data||[]},200,origin);
 }
 let b:any;try{b=await req.json()}catch{return json({error:"Invalid JSON."},400,origin)}
 const id=b?.report_id,action=b?.action,reason=typeof b?.reason==="string"?b.reason.trim():"";
 if(typeof id!=="string"||!/^[0-9a-f-]{36}$/i.test(id))return json({error:"Invalid post ID."},400,origin);
 if(!["hide","restore","withdraw","clear-flags"].includes(action))return json({error:"Choose a supported moderation action."},400,origin);
 if(reason.length>500)return json({error:"Reason must be 500 characters or fewer."},400,origin);
 const current=await db.from("reports").select("id,status,public_status,screening_result,flag_count").eq("id",id).maybeSingle();
 if(current.error)return json({error:"Unable to load post."},503,origin);
 if(!current.data)return json({error:"Post not found."},404,origin);
 if(!(current.data.flag_count>0||current.data.public_status==="hidden"))return json({error:"Only flagged or hidden posts can be moderated here."},409,origin);
 let update:any={};
 if(action==="hide")update={public_status:"hidden"};
 if(action==="restore"){
  if(!["clean","masked"].includes(current.data.screening_result))return json({error:"This post did not pass automatic screening and cannot be restored."},409,origin);
  update={public_status:"published",published_at:new Date().toISOString(),status:"approved",moderated_at:new Date().toISOString()};
 }
 if(action==="withdraw")update={public_status:"withdrawn",status:"removed",story_text:null,public_text:null,roast_text:null,withdrawal_hash:null,moderated_at:new Date().toISOString()};
 if(action==="clear-flags"){
  if(role.data.role!=="admin")return json({error:"Only an admin can clear abuse flags."},403,origin);
  const deleted=await db.from("post_flags").delete().eq("report_id",id);
  if(deleted.error)return json({error:"Unable to clear flags."},503,origin);
 }
 if(Object.keys(update).length){
  const changed=await db.from("reports").update(update).eq("id",id).select("id,public_status,flag_count").single();
  if(changed.error||!changed.data)return json({error:"Unable to update post."},503,origin);
 }
 const auditAction=action==="hide"?"hidden":action==="restore"?"restored":action==="withdraw"?"withdrawn":"returned-to-pending";
 const audit=await db.from("moderation_events").insert({report_id:id,moderator_id:user.id,action:auditAction,reason:reason||null});
 if(audit.error){console.error("Moderation audit insert failed:",audit.error.message);return json({success:true,warning:"Action completed, but audit logging failed. Investigate immediately."},200,origin)}
 return json({success:true,action},200,origin);
}));