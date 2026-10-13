import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server@1";
const allowedOrigins=new Set(["https://behindthepaycheck.in","https://www.behindthepaycheck.in","http://localhost:5500","http://127.0.0.1:5500"]);
function json(body:unknown,status=200,origin:string|null=null){const h=new Headers({"Content-Type":"application/json; charset=utf-8","Vary":"Origin"});if(origin&&allowedOrigins.has(origin))h.set("Access-Control-Allow-Origin",origin);return new Response(JSON.stringify(body),{status,headers:h})}
function enumValue(v:unknown,a:string[]){return v===undefined||v===null||(typeof v==="string"&&a.includes(v))}
async function hashToken(t:string){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(t));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("")}
Deno.serve(withSupabase({auth:"publishable"},async(req:Request,ctx)=>{
 const origin=req.headers.get("origin");
 if(req.method==="OPTIONS"){if(origin&&!allowedOrigins.has(origin))return new Response(null,{status:403});const h=new Headers({"Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Vary":"Origin"});if(origin)h.set("Access-Control-Allow-Origin",origin);return new Response(null,{status:204,headers:h})}
 if(origin&&!allowedOrigins.has(origin))return json({error:"Origin not allowed"},403,origin);if(req.method!=="POST")return json({error:"Method not allowed"},405,origin);
 if(Number(req.headers.get("content-length")||"0")>12000)return json({error:"Request too large"},413,origin);
 let b:any;try{b=await req.json()}catch{return json({error:"Invalid JSON"},400,origin)}if(!b||typeof b!=="object"||Array.isArray(b))return json({error:"Invalid request body"},400,origin);
 const {report_group,story_text,issue_ids,gender,experience_range,company_name,client_token}=b;
 if(!["personal","it"].includes(report_group))return json({error:"Invalid report type"},400,origin);
 if(typeof story_text!=="string"||story_text.trim().length<20||story_text.trim().length>600)return json({error:"Report text must be between 20 and 600 characters"},400,origin);
 if(!Array.isArray(issue_ids)||issue_ids.length<1||issue_ids.length>3||issue_ids.some((x:any)=>typeof x!=="string"||x.length>100)||new Set(issue_ids).size!==issue_ids.length)return json({error:"Choose between one and three distinct issue categories"},400,origin);
 if(!enumValue(gender,["woman","man","non-binary","prefer-not-to-say"]))return json({error:"Invalid gender selection"},400,origin);
 if(!enumValue(experience_range,["0-1","1-3","3-5","5-8","8+","prefer-not-to-say"]))return json({error:"Invalid experience selection"},400,origin);
 if(typeof client_token!=="string"||!/^[0-9a-f-]{36}$/i.test(client_token))return json({error:"Submission token missing. Refresh and try again."},400,origin);
 let company:string|null=null;if(company_name!==undefined&&company_name!==null){if(typeof company_name!=="string"||company_name.trim().length>100)return json({error:"Invalid company name"},400,origin);company=company_name.trim().replace(/\s+/g," ")||null}
 if(report_group==="it"&&!company)return json({error:"Company name is required for IT workplace reports"},400,origin);
 const db=ctx.supabaseAdmin,tokenHash=await hashToken(client_token);
 const old=await db.from("submission_guard").select("created_at").eq("client_token_hash",tokenHash).eq("report_group",report_group).maybeSingle();
 if(old.error){console.error("Submission guard lookup failed:",old.error.message);return json({error:"Submission protection unavailable"},503,origin)}
 if(old.data&&Date.now()-new Date(old.data.created_at).getTime()<30*86400000)return json({error:"This browser has already submitted this report type recently. Please wait 30 days before submitting it again."},429,origin);
 if(old.data){const rm=await db.from("submission_guard").delete().eq("client_token_hash",tokenHash).eq("report_group",report_group);if(rm.error)return json({error:"Submission protection unavailable"},503,origin)}
 const reserve=await db.from("submission_guard").insert({client_token_hash:tokenHash,report_group}).select("client_token_hash").single();
 if(reserve.error){if(reserve.error.code==="23505")return json({error:"This browser has already submitted this report type recently."},429,origin);console.error("Submission guard insert failed:",reserve.error.message);return json({error:"Submission protection unavailable"},503,origin)}
 const fail=async(message:string,status=503)=>{await db.from("submission_guard").delete().eq("client_token_hash",tokenHash).eq("report_group",report_group);return json({error:message},status,origin)};
 const valid=await db.from("issues").select("id").eq("report_group",report_group).eq("active",true).in("id",issue_ids);if(valid.error){console.error("Issue validation failed:",valid.error.message);return await fail("Unable to validate categories")}if(!valid.data||valid.data.length!==issue_ids.length)return await fail("One or more categories are invalid",400);
 let companyId:string|null=null;if(company){const normalized=company.toLowerCase(),q=await db.from("companies").select("id").eq("normalized_name",normalized).maybeSingle();if(q.error)return await fail("Unable to process company");if(q.data)companyId=q.data.id;else{const c=await db.from("companies").insert({display_name:company}).select("id").single();if(c.error||!c.data){console.error("Company creation failed:",c.error?.message);return await fail("Unable to process company")}companyId=c.data.id}}
 const report=await db.from("reports").insert({report_group,company_id:companyId,story_text:story_text.trim(),gender:gender??null,experience_range:experience_range??null,status:"pending"}).select("id").single();if(report.error||!report.data){console.error("Report creation failed:",report.error?.message);return await fail("Unable to save report")}
 const links=await db.from("report_issues").insert(issue_ids.map((issue_id:string)=>({report_id:report.data.id,issue_id})));if(links.error){await db.from("reports").delete().eq("id",report.data.id);console.error("Issue link failed:",links.error.message);return await fail("Unable to save report categories")}
 return json({success:true,status:"pending",message:"Thank you. Your report has been submitted for review."},201,origin);
}));
