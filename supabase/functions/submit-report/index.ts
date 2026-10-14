import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server@1";

const allowedOrigins = new Set([
  "https://behindthepaycheck.in", "https://www.behindthepaycheck.in",
  "http://localhost:5500", "http://127.0.0.1:5500",
]);
const ISSUE_IDS = new Set([
  "recruiter-ghosting","no-feedback","too-many-rounds","documents-early","budget-revealed-late",
  "offer-letter-delay","offer-revoked","offer-mismatch","counter-offer-pressure",
  "immediate-joining","notice-period-rejected","notice-buyout-refused","bgv-delay",
  "relieving-letter-withheld","final-settlement-delay","unpaid-salary","low-hike","unpaid-overtime",
  "work-pressure","moonlighting-action","work-location-change","promotion-denied",
  "layoff-no-notice","layoff-severance","forced-resignation-pip","layoff-access-cut",
]);
const GOOD_TAGS = new Set(["offer-on-time","notice-respected","fair-hike","supportive-layoff","transparent-process","quick-bgv"]);
const STAGES = new Set(["applying","interview","offer","notice-joining","working","layoff"]);
const REPORT_TYPES = new Set(["problem","good","roast"]);
const CITIES = new Set(["Bengaluru","Hyderabad","Pune","Chennai","Mumbai","Delhi NCR","Kolkata","Noida","Gurugram","Kochi","Ahmedabad","Other"]);
const TYPES = new Set(["service","product","gcc","startup"]);
const EXPERIENCE = new Set(["0-2","3-5","6-10","10+"]);
const ROLES = new Set(["engineering","devops-sre-platform","data-ai-ml","qa-testing","security","product-project","design","support-operations","management","other"]);
const HIRING = new Set(["direct","consultant","referral","portal"]);
const OUTCOMES = new Set(["resolved","lost-job","left-company","ongoing"]);
const ISSUE_BY_STAGE: Record<string, Set<string>> = {
  applying: new Set(["recruiter-ghosting","no-feedback","too-many-rounds","documents-early","budget-revealed-late"]),
  interview: new Set(["recruiter-ghosting","no-feedback","too-many-rounds","documents-early","budget-revealed-late"]),
  offer: new Set(["offer-letter-delay","offer-revoked","offer-mismatch","counter-offer-pressure"]),
  "notice-joining": new Set(["immediate-joining","notice-period-rejected","notice-buyout-refused","bgv-delay","relieving-letter-withheld","final-settlement-delay"]),
  working: new Set(["unpaid-salary","low-hike","unpaid-overtime","work-pressure","moonlighting-action","work-location-change","promotion-denied"]),
  layoff: new Set(["layoff-no-notice","layoff-severance","forced-resignation-pip","layoff-access-cut"]),
};
function json(body: unknown, status = 200, origin: string | null = null) {
  const headers = new Headers({"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","Vary":"Origin"});
  if (origin && allowedOrigins.has(origin)) headers.set("Access-Control-Allow-Origin", origin);
  return new Response(JSON.stringify(body), {status, headers});
}
function hash(value: string) { return crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)).then(b => [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("")); }
function cleanText(v: unknown, max: number) { return typeof v === "string" ? v.trim().slice(0,max) : ""; }
function validMonth(v: unknown) {
  if (typeof v !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) return false;
  return v >= "2000-01" && v <= new Date().toISOString().slice(0,7);
}
function screen(text: string) {
  const reasons: string[] = [];
  let value = text;
  const blockers: [RegExp,string][] = [
    [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,"email"],
    [/(?:https?:\/\/|www\.)\S+/i,"url"],
    [/(?:\+?91[\s.-]?)?[6-9]\d{9}\b/,"phone number"],
    [/\b\d{12}\b/,"possible government ID number"],
    [/\b[A-Z]{5}\d{4}[A-Z]\b/i,"possible PAN number"],
    [/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/,"possible Aadhaar number"],
  ];
  for (const [re, label] of blockers) if (re.test(value)) return {result:"rejected", text:"", reasons:[`Contains a ${label}. Remove personal/contact/ID information and try again.`]};
  const severe = /\b(kill yourself|i will kill|i'll kill|go die|rape them|bomb threat|terrorist attack)\b/i;
  if (severe.test(value)) return {result:"rejected", text:"", reasons:["Contains a threat or violent language. Please rewrite without threats."]};
  const hate = /\b(kill all|wipe out all|subhuman|racially inferior)\b/i;
  if (hate.test(value)) return {result:"rejected", text:"", reasons:["Contains hateful or dehumanizing language. Please rewrite it."]};
  const profanity = /\b(fuck(?:ing|ed|er)?|motherfucker|cunt|bitch|asshole)\b/i;
  if (profanity.test(value)) return {result:"edit_required", text:"", reasons:["Please remove heavy profanity and submit a workplace-focused version."]};
  // Mask obvious person-identifying constructions; this heuristic is intentionally conservative.
  const namePattern = /\b(?:HR|manager|recruiter|team lead|team leader|director)\s+(?:Mr\.?\s+|Ms\.?\s+|Mrs\.?\s+)?[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})?\b/g;
  if (namePattern.test(value)) {
    value = value.replace(namePattern, "$&".replace(/.*/, "[individual name removed]"));
    reasons.push("Possible individual name was masked. Check the text before publishing.");
  }
  // Reject if remaining text looks like an edit request rather than safe enough to publish.
  if (reasons.length) return {result:"masked", text:value, reasons};
  return {result:"clean", text:value, reasons:[]};
}
async function verifyTurnstile(token: string, remoteIp: string | null) {
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (!secret) return {ok:false, reason:"CAPTCHA verification is not configured on the server."};
  if (!token) return {ok:false, reason:"Complete the CAPTCHA check and try again."};
  const body = new URLSearchParams({secret, response:token});
  if (remoteIp) body.set("remoteip", remoteIp);
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body});
    const data = await res.json();
    return {ok:res.ok && data.success === true, reason:"CAPTCHA verification failed. Please try again."};
  } catch { return {ok:false, reason:"CAPTCHA verification is temporarily unavailable."}; }
}
Deno.serve(withSupabase({auth:"publishable"}, async (req: Request, ctx) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    if (origin && !allowedOrigins.has(origin)) return new Response(null,{status:403});
    const h = new Headers({"Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Vary":"Origin"});
    if (origin) h.set("Access-Control-Allow-Origin",origin);
    return new Response(null,{status:204,headers:h});
  }
  if (origin && !allowedOrigins.has(origin)) return json({error:"Origin not allowed"},403,origin);
  if (req.method !== "POST") return json({error:"Method not allowed"},405,origin);
  const length = Number(req.headers.get("content-length") || "0");
  if (length > 16000) return json({error:"Request too large"},413,origin);
  let b: any;
  try { b = await req.json(); } catch { return json({error:"Invalid JSON"},400,origin); }
  if (!b || typeof b !== "object" || Array.isArray(b)) return json({error:"Invalid request body"},400,origin);

  const reportType = b.report_type;
  if (!REPORT_TYPES.has(reportType)) return json({error:"Choose a problem, good experience or one-line roast."},400,origin);
  if (typeof b.client_token !== "string" || !/^[0-9a-f-]{36}$/i.test(b.client_token)) return json({error:"Submission token missing. Refresh and try again."},400,origin);
  const captcha = await verifyTurnstile(cleanText(b.turnstile_token,4096), req.headers.get("cf-connecting-ip"));
  if (!captcha.ok) return json({error:captcha.reason},403,origin);

  const roast = reportType === "roast";
  if (b.story_text != null && typeof b.story_text !== "string") return json({error:"Story must be text."},400,origin);
  if (typeof b.story_text === "string" && b.story_text.trim() && (b.story_text.trim().length < 20 || b.story_text.trim().length > 600)) return json({error:"If provided, the story must be 20–600 characters."},400,origin);
  if (roast && (typeof b.roast_text !== "string" || b.roast_text.trim().length < 1 || b.roast_text.trim().length > 120)) return json({error:"A one-line roast must be 1–120 characters."},400,origin);
  if (!roast && (typeof b.company_name !== "string" || b.company_name.trim().length < 1 || b.company_name.trim().length > 100)) return json({error:"Company name must be 1–100 characters."},400,origin);
  const stage = b.stage;
  const companyName = cleanText(b.company_name,100).replace(/\s+/g," ");
  const story = typeof b.story_text === "string" ? b.story_text.trim() : "";
  const roastText = typeof b.roast_text === "string" ? b.roast_text.trim() : "";
  const issueIds = Array.isArray(b.issue_ids) ? b.issue_ids : [];
  const primaryIssue = cleanText(b.primary_issue_id,100);
  const secondary = Array.isArray(b.secondary_issue_ids) ? b.secondary_issue_ids : [];
  const positiveTags = Array.isArray(b.positive_tags) ? b.positive_tags : [];
  const eventMonth = b.event_month;

  if (roast) {
    if (companyName) return json({error:"One-line roasts are company-neutral; remove the company name."},400,origin);
    if (!roastText || roastText.length > 120) return json({error:"A roast must be 1–120 characters."},400,origin);
    const checked = screen(roastText);
    if (checked.result === "rejected" || checked.result === "edit_required") return json({error:checked.reasons[0],screening:checked.result},422,origin);
  } else {
    if (!companyName) return json({error:"Company name is required."},400,origin);
    if (!STAGES.has(stage)) return json({error:"Choose a valid stage."},400,origin);
    if (!validMonth(eventMonth)) return json({error:"Choose a valid month and year, not a future month."},400,origin);
    if (reportType === "problem") {
      if (!primaryIssue || !ISSUE_BY_STAGE[stage]?.has(primaryIssue)) return json({error:"Choose one primary issue for this stage."},400,origin);
      if (secondary.length > 2 || secondary.some((x:unknown)=>typeof x!=="string" || !ISSUE_BY_STAGE[stage].has(x)) || new Set(secondary).size!==secondary.length || secondary.includes(primaryIssue)) return json({error:"Choose up to two different secondary issues for this stage."},400,origin);
      if (issueIds.length && (issueIds.length !== secondary.length + 1 || !issueIds.includes(primaryIssue) || secondary.some((x:string)=>!issueIds.includes(x)))) return json({error:"Issue selection does not match primary and secondary issues."},400,origin);
      if (positiveTags.length) return json({error:"Problem reports cannot use positive-experience tags."},400,origin);
    } else {
      if (!Array.isArray(positiveTags) || positiveTags.length < 1 || positiveTags.length > 6 || positiveTags.some((x:unknown)=>typeof x!=="string" || !GOOD_TAGS.has(x)) || new Set(positiveTags).size!==positiveTags.length) return json({error:"Choose at least one valid positive-experience tag."},400,origin);
      if (primaryIssue || secondary.length || issueIds.length) return json({error:"Good experiences use positive tags instead of problem issues."},400,origin);
    }
    if (story && (story.length < 20 || story.length > 600)) return json({error:"If provided, the story must be 20–600 characters."},400,origin);
  }
  if (!roast && b.company_type != null && !TYPES.has(b.company_type)) return json({error:"Invalid company type."},400,origin);
  if (!roast && b.experience_band != null && !EXPERIENCE.has(b.experience_band)) return json({error:"Invalid experience band."},400,origin);
  if (!roast && b.city != null && !CITIES.has(b.city)) return json({error:"Invalid city."},400,origin);
  if (!roast && b.role_family != null && !ROLES.has(b.role_family)) return json({error:"Invalid role family."},400,origin);
  if (!roast && b.hiring_source != null && !HIRING.has(b.hiring_source)) return json({error:"Invalid hiring source."},400,origin);
  if (!roast && b.outcome != null && !OUTCOMES.has(b.outcome)) return json({error:"Invalid outcome."},400,origin);

  const intField = (key:string,min:number,max:number) => b[key] == null || (Number.isInteger(b[key]) && b[key]>=min && b[key]<=max);
  const boolField = (key:string) => b[key] == null || typeof b[key] === "boolean";
  const numberField = (key:string,min:number,max:number) => b[key] == null || (typeof b[key]==="number" && Number.isFinite(b[key]) && b[key]>=min && b[key]<=max);
  const enums: Record<string,string[]> = {
    notice_period_band:["0-15","30","60","90","other"],
    joining_demand_band:["immediate","up-to-15","up-to-30","other"],
    offer_wait_band:["0-7","8-15","16-30","31-60","61-90","91+"],
    hike_band:["0","1-5","6-10","11-15","16+"],
    performance_rating:["exceeded","met","below"],
    bgv_check_type:["education","employment","address","other"],
    moonlighting_outcome:["warning","bgv-flag","termination","no-action"],
  };
  if (!roast) {
    for (const [key,allowed] of Object.entries(enums)) if (b[key] != null && !allowed.includes(b[key])) return json({error:`Invalid ${key.replaceAll("_"," ")} selection.`},400,origin);
    for (const [key,min,max] of [["notice_period_days",0,365],["joining_time_days",0,365],["offer_days_waited",0,730],["bgv_days_pending",0,730],["layoff_notice_days",0,365]] as [string,number,number][]) if (!intField(key,min,max)) return json({error:`Invalid ${key.replaceAll("_"," ")} value.`},400,origin);
    for (const [key,min,max] of [["hike_percent",-100,500],["layoff_severance_weeks",0,104]] as [string,number,number][]) if (!numberField(key,min,max)) return json({error:`Invalid ${key.replaceAll("_"," ")} value.`},400,origin);
    for (const key of ["notice_rejected","company_enforces_long_notice","resigned_before_offer","offer_revoked_after_resignation","bgv_blocked_joining","layoff_advance_notice","layoff_access_cut_same_day","layoff_called_resignation","hr_escalated","has_evidence"]) if (!boolField(key)) return json({error:`Invalid yes/no answer for ${key.replaceAll("_"," ")}.`},400,origin);
    if (stage !== "notice-joining" && (b.notice_period_band!=null || b.joining_demand_band!=null || b.notice_period_days!=null || b.joining_time_days!=null || b.notice_rejected!=null || b.company_enforces_long_notice!=null)) return json({error:"Notice-period facts are only accepted for Notice/Joining reports."},400,origin);
    if (stage !== "offer" && (b.offer_days_waited!=null || b.resigned_before_offer!=null || b.offer_revoked_after_resignation!=null)) return json({error:"Offer facts are only accepted for Offer reports."},400,origin);
    if (stage !== "working" && (b.hike_band!=null || b.hike_percent!=null || b.performance_rating!=null || b.moonlighting_outcome!=null)) return json({error:"Hike and moonlighting facts are only accepted for Working reports."},400,origin);
    if (stage !== "notice-joining" && (b.bgv_days_pending!=null || b.bgv_blocked_joining!=null || b.bgv_check_type!=null)) return json({error:"BGV facts are only accepted for Notice/Joining reports."},400,origin);
    if (stage !== "layoff" && (b.layoff_notice_days!=null || b.layoff_advance_notice!=null || b.layoff_severance_weeks!=null || b.layoff_access_cut_same_day!=null || b.layoff_called_resignation!=null)) return json({error:"Layoff facts are only accepted for Layoff reports."},400,origin);
  }

  const contentToScreen = roast ? roastText : story;
  let screeningResult = "clean", publicText = "", screeningReasons: string[] = [];
  if (contentToScreen) {
    const checked = screen(contentToScreen);
    if (checked.result === "rejected" || checked.result === "edit_required") return json({error:checked.reasons[0],screening:checked.result},422,origin);
    screeningResult = checked.result;
    publicText = checked.text;
    screeningReasons = checked.reasons;
  } else {
    screeningResult = "clean";
  }

  const db = ctx.supabaseAdmin;
  const normalizedCompany = companyName.toLowerCase().replace(/\s+/g," ");
  // Keep posts attached to a single company. Company-neutral roasts cannot name a company.
  const knownCompanies = await db.from("companies").select("display_name").limit(5000);
  if (knownCompanies.error) return json({error:"Automatic screening is temporarily unavailable."},503,origin);
  const mentionText = (roast ? roastText : story).toLowerCase();
  const mentionedCompany = (knownCompanies.data || []).find((row:any) => {
    const name=String(row.display_name||"").trim().toLowerCase();
    if(name.length<4 || !mentionText.includes(name)) return false;
    return roast || name !== normalizedCompany;
  });
  if (mentionedCompany) return json({error:roast?"One-line roasts must be company-neutral. Remove the company name and try again.":"Keep the story focused on the selected company. Remove other company names and try again.",screening:"edit_required"},422,origin);
  const tokenHash = await hash(b.client_token + "|" + (roast ? "company-neutral-roast" : normalizedCompany));
  const cutoff = new Date(Date.now()-7*86400000).toISOString();
  const purge = await db.from("submission_guard").delete().lt("created_at",cutoff);
  if (purge.error) return json({error:"Submission protection unavailable."},503,origin);
  const old = await db.from("submission_guard").select("created_at").eq("client_token_hash",tokenHash).eq("report_group","it").maybeSingle();
  if (old.error) return json({error:"Submission protection unavailable."},503,origin);
  if (old.data && Date.now()-new Date(old.data.created_at).getTime()<7*86400000) return json({error:"This browser has already submitted for this company in the last 7 days."},429,origin);
  const reserve = await db.from("submission_guard").insert({client_token_hash:tokenHash,report_group:"it"}).select("client_token_hash").single();
  if (reserve.error) return json({error:reserve.error.code==="23505"?"This browser has already submitted recently.":"Submission protection unavailable."},reserve.error.code==="23505"?429:503,origin);
  const fail = async (message:string,status=503) => { await db.from("submission_guard").delete().eq("client_token_hash",tokenHash).eq("report_group","it"); return json({error:message},status,origin); };

  let companyId: string | null = null;
  if (!roast) {
    const found = await db.from("companies").select("id,display_name").eq("normalized_name",normalizedCompany).maybeSingle();
    if (found.error) return await fail("Unable to look up company.");
    if (found.data) companyId = found.data.id;
    else {
      const created = await db.from("companies").insert({display_name:companyName}).select("id").single();
      if (created.error || !created.data) {
        // Another concurrent submission may have created the normalized name.
        const retry = await db.from("companies").select("id").eq("normalized_name",normalizedCompany).maybeSingle();
        if (retry.error || !retry.data) return await fail("Unable to save company.");
        companyId = retry.data.id;
      } else companyId = created.data.id;
    }
  }

  if (!roast && reportType === "problem") {
    const ids = [primaryIssue,...secondary];
    const mapped = await db.from("stage_issue_map").select("issue_id").eq("stage",stage).eq("report_type","problem").in("issue_id",ids);
    if (mapped.error || !mapped.data || mapped.data.length !== ids.length) return await fail("Issue selection does not match the selected stage.",400);
  }
  if (!roast && reportType === "good") {
    const mapped = await db.from("stage_issue_map").select("issue_id").eq("stage",stage).eq("report_type","good").in("issue_id",positiveTags);
    if (mapped.error || !mapped.data || mapped.data.length !== positiveTags.length) return await fail("Positive tags could not be validated.",400);
  }

  const withdrawalCode = crypto.randomUUID() + "-" + crypto.randomUUID().slice(0,8);
  const withdrawalHash = await hash(withdrawalCode);
  const reportPayload: Record<string,unknown> = {
    report_group:"it", company_id:companyId, story_text:story || null,
    report_type:reportType, positive_tags:reportType==="good"?positiveTags:[],
    stage:roast?null:stage, event_month:roast?null:eventMonth+"-01",
    company_type:roast?null:(b.company_type??null), experience_band:roast?null:(b.experience_band??null),
    city:roast?null:(b.city??null), role_family:roast?null:(b.role_family??null),
    hiring_source:roast?null:(b.hiring_source??null), outcome:roast?null:(b.outcome??null),
    primary_issue_id:reportType==="problem"?primaryIssue:null,
    secondary_issue_ids:reportType==="problem"?secondary:[],
    primary_issue_label_snapshot:reportType==="problem"?primaryIssue:null,
    notice_period_days:b.notice_period_days??null, joining_time_days:b.joining_time_days??null,
    notice_period_band:b.notice_period_band??null, joining_demand_band:b.joining_demand_band??null,
    notice_rejected:b.notice_rejected??null, company_enforces_long_notice:b.company_enforces_long_notice??null,
    offer_days_waited:b.offer_days_waited??null, offer_wait_band:b.offer_wait_band??null,
    resigned_before_offer:b.resigned_before_offer??null, offer_revoked_after_resignation:b.offer_revoked_after_resignation??null,
    hike_band:b.hike_band??null, hike_percent:b.hike_percent??null, performance_rating:b.performance_rating??null,
    bgv_days_pending:b.bgv_days_pending??null, bgv_blocked_joining:b.bgv_blocked_joining??null, bgv_check_type:b.bgv_check_type??null,
    moonlighting_outcome:b.moonlighting_outcome??null, layoff_notice_days:b.layoff_notice_days??null,
    layoff_advance_notice:b.layoff_advance_notice??null, layoff_severance_weeks:b.layoff_severance_weeks??null,
    layoff_access_cut_same_day:b.layoff_access_cut_same_day??null, layoff_called_resignation:b.layoff_called_resignation??null,
    hr_escalated:b.hr_escalated??null, has_evidence:b.has_evidence??null,
    roast_text:roast?roastText:null, withdrawal_hash:withdrawalHash,
    screening_result:screeningResult, screening_reasons:screeningReasons,
    public_text:publicText || null, screened_at:new Date().toISOString(),
    public_status:"published", published_at:new Date().toISOString(), flag_count:0,
    status:"approved", moderated_at:new Date().toISOString(),
  };
  const inserted = await db.from("reports").insert(reportPayload).select("id").single();
  if (inserted.error || !inserted.data) {
    console.error("Report insert failed:",inserted.error?.message);
    return await fail("Unable to publish this report. Please try again.");
  }
  if (reportType==="problem") {
    const ids = [primaryIssue,...secondary];
    const links = await db.from("report_issues").insert(ids.map((issue_id:string)=>({report_id:inserted.data.id,issue_id})));
    if (links.error) {
      await db.from("reports").delete().eq("id",inserted.data.id);
      return await fail("Unable to save issue categories.");
    }
  }
  return json({
    success:true, status:"published", report_id:inserted.data.id,
    screening:screeningResult, screening_notes:screeningReasons,
    withdrawal_code:withdrawalCode,
    message:"Published as an anonymous, user-submitted, unverified post. Save your one-time withdrawal code; it cannot be recovered."
  },201,origin);
}));
