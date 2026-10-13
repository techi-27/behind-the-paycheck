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
 const {report_group,story_text,issue_ids,company_name,client_token,stage,event_month,company_type,experience_band,city,notice_period_days,joining_time_days,hike_percent,offer_delay_days,outcome}=b;
 if(report_group!=="it")return json({error:"Only IT employee experiences are accepted"},400,origin);
 if(typeof story_text!=="string"||story_text.trim().length<20||story_text.trim().length>600)return json({error:"Report text must be between 20 and 600 characters"},400,origin);
 if(!Array.isArray(issue_ids)||issue_ids.length<1||issue_ids.length>3||issue_ids.some((x:any)=>typeof x!=="string"||x.length>100)||new Set(issue_ids).size!==issue_ids.length)return json({error:"Choose between one and three distinct issue categories"},400,origin);
  if(typeof client_token!=="string"||!/^[0-9a-f-]{36}$/i.test(client_token))return json({error:"Submission token missing. Refresh and try again."},400,origin);
 let company:string|null=null;if(company_name!==undefined&&company_name!==null){if(typeof company_name!=="string"||company_name.trim().length>100)return json({error:"Invalid company name"},400,origin);company=company_name.trim().replace(/\s+/g," ")||null}
 if(!company)return json({error:"Company name is required for IT employee reports"},400,origin);
 const stages=["applying","interview","offer","notice-period","joining","working","layoff"],types=["service","product","gcc","startup"],bands=["0-2","3-5","6-10","10+"],cities=["Bengaluru","Hyderabad","Pune","Chennai","Mumbai","Delhi NCR","Kolkata","Noida","Gurugram","Kochi","Ahmedabad","Other"],outcomes=["resolved","lost-job","left-company","ongoing"];
 if(typeof stage!=="string"||!stages.includes(stage))return json({error:"Choose the stage where this happened."},400,origin);
 if(typeof event_month!=="string"||!/^(\d{4})-(0[1-9]|1[0-2])$/.test(event_month)||event_month<"2000-01"||event_month>new Date().toISOString().slice(0,7))return json({error:"Choose a valid event month and year, not a future month."},400,origin);
 if(company_type!=null&&!types.includes(company_type))return json({error:"Invalid company type."},400,origin);
 if(experience_band!=null&&!bands.includes(experience_band))return json({error:"Invalid experience band."},400,origin);
 if(city!=null&&!cities.includes(city))return json({error:"Invalid city selection."},400,origin);
 if(outcome!=null&&!outcomes.includes(outcome))return json({error:"Invalid outcome selection."},400,origin);
 const isInt=(v:any,min:number,max:number)=>v===null||v===undefined||(Number.isInteger(v)&&v>=min&&v<=max);
 const isNum=(v:any,min:number,max:number)=>v===null||v===undefined||(typeof v==="number"&&Number.isFinite(v)&&v>=min&&v<=max);
 const needsNotice=issue_ids.some((x:string)=>["notice-joining","notice-period","immediate-joining"].includes(x));
 const needsHike=issue_ids.some((x:string)=>["low-hike","salary-growth","salary-negotiation","offer-mismatch","unpaid-salary"].includes(x));
 const needsOfferDelay=issue_ids.some((x:string)=>["offer-letter","offer-release-delay"].includes(x));
 if(needsNotice&&(!isInt(notice_period_days,0,365)||notice_period_days==null||!isInt(joining_time_days,0,365)||joining_time_days==null))return json({error:"For notice or joining issues, enter both notice-period days and joining time demanded."},400,origin);
 if(!needsNotice&&(notice_period_days!=null||joining_time_days!=null))return json({error:"Notice/joining numbers are only accepted for related issue categories."},400,origin);
 if(needsHike&&(!isNum(hike_percent,-100,500)||hike_percent==null))return json({error:"Enter the hike percentage for the selected salary issue."},400,origin);
 if(!needsHike&&hike_percent!=null)return json({error:"Hike percentage is only accepted for salary-related issues."},400,origin);
 if(needsOfferDelay&&(!isInt(offer_delay_days,0,730)||offer_delay_days==null))return json({error:"Enter the offer-letter delay in days."},400,origin);
 if(!needsOfferDelay&&offer_delay_days!=null)return json({error:"Offer delay is only accepted for offer-letter issues."},400,origin);
 const db=ctx.supabaseAdmin,tokenHash=await hashToken(client_token);
 // Opportunistically purge expired anti-abuse hashes on each submission.
 const purge=await db.from("submission_guard").delete().lt("created_at",new Date(Date.now()-30*86400000).toISOString());
 if(purge.error){console.error("Expired submission guard cleanup failed:",purge.error.message);return json({error:"Submission protection unavailable"},503,origin)}
 const old=await db.from("submission_guard").select("created_at").eq("client_token_hash",tokenHash).eq("report_group",report_group).maybeSingle();
 if(old.error){console.error("Submission guard lookup failed:",old.error.message);return json({error:"Submission protection unavailable"},503,origin)}
 if(old.data&&Date.now()-new Date(old.data.created_at).getTime()<30*86400000)return json({error:"This browser has already submitted this report type recently. Please wait 30 days before submitting it again."},429,origin);
 if(old.data){const rm=await db.from("submission_guard").delete().eq("client_token_hash",tokenHash).eq("report_group",report_group);if(rm.error)return json({error:"Submission protection unavailable"},503,origin)}
 const reserve=await db.from("submission_guard").insert({client_token_hash:tokenHash,report_group}).select("client_token_hash").single();
 if(reserve.error){if(reserve.error.code==="23505")return json({error:"This browser has already submitted this report type recently."},429,origin);console.error("Submission guard insert failed:",reserve.error.message);return json({error:"Submission protection unavailable"},503,origin)}
 const fail=async(message:string,status=503)=>{await db.from("submission_guard").delete().eq("client_token_hash",tokenHash).eq("report_group",report_group);return json({error:message},status,origin)};
 const valid=await db.from("issues").select("id").eq("report_group",report_group).eq("active",true).in("id",issue_ids);if(valid.error){console.error("Issue validation failed:",valid.error.message);return await fail("Unable to validate categories")}if(!valid.data||valid.data.length!==issue_ids.length)return await fail("One or more categories are invalid",400);
 let companyId:string|null=null;if(company){const normalized=company.toLowerCase(),q=await db.from("companies").select("id").eq("normalized_name",normalized).maybeSingle();if(q.error)return await fail("Unable to process company");if(q.data)companyId=q.data.id;else{const c=await db.from("companies").insert({display_name:company}).select("id").single();if(c.error||!c.data){console.error("Company creation failed:",c.error?.message);return await fail("Unable to process company")}companyId=c.data.id}}
 const report=await db.from("reports").insert({report_group,company_id:companyId,story_text:story_text.trim(),stage,event_month:event_month+"-01",company_type:company_type??null,experience_band:experience_band??null,city:city??null,notice_period_days:needsNotice?notice_period_days:null,joining_time_days:needsNotice?joining_time_days:null,hike_percent:needsHike?hike_percent:null,offer_delay_days:needsOfferDelay?offer_delay_days:null,outcome:outcome??null,status:"pending"}).select("id").single();if(report.error||!report.data){console.error("Report creation failed:",report.error?.message);return await fail("Unable to save report")}
 const links=await db.from("report_issues").insert(issue_ids.map((issue_id:string)=>({report_id:report.data.id,issue_id})));if(links.error){await db.from("reports").delete().eq("id",report.data.id);console.error("Issue link failed:",links.error.message);return await fail("Unable to save report categories")}
 return json({success:true,status:"pending",message:"Thank you. Your report has been submitted for review."},201,origin);
}));
