import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server@1";
const allowedOrigins=new Set(["https://behindthepaycheck.in","https://www.behindthepaycheck.in","http://localhost:5500","http://127.0.0.1:5500"]);
function json(body:unknown,status=200,origin:string|null=null){const h=new Headers({"Content-Type":"application/json; charset=utf-8","Cache-Control":"public, max-age=300, s-maxage=300","Vary":"Origin"});if(origin&&allowedOrigins.has(origin))h.set("Access-Control-Allow-Origin",origin);return new Response(JSON.stringify(body),{status,headers:h})}
const median=(values:number[])=>{const a=values.filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return null;const m=Math.floor(a.length/2);return a.length%2?a[m]:Math.round((a[m-1]+a[m])/2*100)/100};
const MIN=5;
const labels:Record<string,string>={applying:"Applying",interview:"Interview",offer:"Offer","notice-joining":"Notice / Joining",working:"Working",layoff:"Layoff",service:"Service",product:"Product",gcc:"GCC",startup:"Startup",resolved:"Resolved","lost-job":"Lost the job","left-company":"Left company",ongoing:"Ongoing"};
const issueWeights:Record<string,number>={"unpaid-salary":3,"layoff-no-notice":3,"layoff-severance":3,"forced-resignation-pip":3,"layoff-access-cut":2.5,"notice-period-rejected":2.5,"notice-buyout-refused":2.5,"immediate-joining":2,"offer-revoked":2.5,"offer-letter-delay":1.5,"offer-mismatch":2,"low-hike":1.5,"unpaid-overtime":1.5,"work-pressure":1.5,"moonlighting-action":2,"recruiter-ghosting":0.5,"no-feedback":0.5,"too-many-rounds":0.5};
Deno.serve(withSupabase({auth:"publishable"},async(req:Request,ctx)=>{
 const origin=req.headers.get("origin");
 if(req.method==="OPTIONS"){if(origin&&!allowedOrigins.has(origin))return new Response(null,{status:403});const h=new Headers({"Access-Control-Allow-Methods":"GET, OPTIONS","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Vary":"Origin"});if(origin)h.set("Access-Control-Allow-Origin",origin);return new Response(null,{status:204,headers:h})}
 if(origin&&!allowedOrigins.has(origin))return json({error:"Origin not allowed"},403,origin);
 if(req.method!=="GET")return json({error:"Method not allowed"},405,origin);
 const db=ctx.supabaseAdmin;
 const [eligible,issuesQ,companiesQ,legacyQ,pollQ,companyCountsQ,positiveCountsQ,companyIssueCountsQ,issueCountsQ,stageIssueCountsQ,allCompanyCountsQ]=await Promise.all([
  db.from("trend_eligible_reports").select("*").limit(20000),
  db.from("issues").select("id,label"),
  db.from("companies").select("id,display_name"),
  db.from("legacy_issue_map").select("legacy_issue_id,canonical_issue_id"),
  db.from("government_poll").select("option_slug").limit(50000),
  db.from("company_counts_min5").select("company_id,report_count"),
  db.from("company_positive_counts_min5").select("company_id,report_count"),
  db.from("company_issue_counts_min5").select("company_id,issue_id,report_count"),
  db.from("issue_counts_min5").select("issue_id,report_count"),
  db.from("stage_issue_counts_min5").select("stage,issue_id,report_count"),
  db.from("company_all_counts_min5").select("company_id,report_count"),
 ]);
 if(eligible.error||issuesQ.error||companiesQ.error||legacyQ.error||pollQ.error||companyCountsQ.error||positiveCountsQ.error||companyIssueCountsQ.error||issueCountsQ.error||stageIssueCountsQ.error||allCompanyCountsQ.error){console.error("Public trend read failed",eligible.error?.message,issuesQ.error?.message,companiesQ.error?.message,legacyQ.error?.message,pollQ.error?.message,companyCountsQ.error?.message,positiveCountsQ.error?.message,companyIssueCountsQ.error?.message,issueCountsQ.error?.message,stageIssueCountsQ.error?.message,allCompanyCountsQ.error?.message);return json({error:"Trends unavailable"},503,origin)}
 const rows=eligible.data||[], labelMap=new Map((issuesQ.data||[]).map((x:any)=>[x.id,x.label])),companyMap=new Map((companiesQ.data||[]).map((x:any)=>[x.id,x.display_name])),legacyMap=new Map((legacyQ.data||[]).map((x:any)=>[x.legacy_issue_id,x.canonical_issue_id]));
 const dbCompanyIds=new Set((companyCountsQ.data||[]).map((x:any)=>x.company_id)),dbPositiveCompanyIds=new Set((positiveCountsQ.data||[]).map((x:any)=>x.company_id)),dbAllCompanyIds=new Set((allCompanyCountsQ.data||[]).map((x:any)=>x.company_id));
 const dbIssueCounts=new Map((issueCountsQ.data||[]).map((x:any)=>[x.issue_id,Number(x.report_count)]));
 const dbCompanyIssueCounts=new Map((companyIssueCountsQ.data||[]).map((x:any)=>[x.company_id+"|"+x.issue_id,Number(x.report_count)]));
 const dbStageIssueCounts=new Map((stageIssueCountsQ.data||[]).map((x:any)=>[x.stage+"|"+x.issue_id,Number(x.report_count)]));
 const ids=rows.map((r:any)=>r.id);
 let legacyLinks:any[]=[];
 if(ids.length){const q=await db.from("report_issues").select("report_id,issue_id").in("report_id",ids);if(q.error)return json({error:"Trends unavailable"},503,origin);legacyLinks=q.data||[]}
 const rowMap=new Map(rows.map((r:any)=>[r.id,r]));
 const issueReportIds=new Map<string,Set<string>>();
 const companyIssueReports=new Map<string,Map<string,Set<string>>>();
 const stageIssueReports=new Map<string,Map<string,Set<string>>>();
 const monthlyIssueReports=new Map<string,Map<string,Set<string>>>();
 const add=(map:Map<string,Set<string>>,key:string,id:string)=>{const set=map.get(key)||new Set<string>();set.add(id);map.set(key,set)};
 const addIssue=(r:any,issue:string)=>{
  if(!issue)return;
  const canonical=legacyMap.get(issue)||issue;
  add(issueReportIds,canonical,r.id);
  if(r.company_id){const cm=companyIssueReports.get(r.company_id)||new Map<string,Set<string>>();add(cm,canonical,r.id);companyIssueReports.set(r.company_id,cm)}
  if(r.stage){const sm=stageIssueReports.get(r.stage)||new Map<string,Set<string>>();add(sm,canonical,r.id);stageIssueReports.set(r.stage,sm)}
  const month=String(r.event_month||"").slice(0,7);if(month){const mm=monthlyIssueReports.get(month)||new Map<string,Set<string>>();add(mm,canonical,r.id);monthlyIssueReports.set(month,mm)}
 };
 for(const r of rows){if(r.report_type==="problem"){if(r.primary_issue_id)addIssue(r,r.primary_issue_id);for(const issue of r.secondary_issue_ids||[])addIssue(r,issue)}}
 for(const link of legacyLinks){const r=rowMap.get(link.report_id);if(r&&r.report_type==="problem"&&!r.primary_issue_id)addIssue(r,link.issue_id)}
 const problemRows=rows.filter((r:any)=>r.report_type==="problem"),goodRows=rows.filter((r:any)=>r.report_type==="good"),roastRows=rows.filter((r:any)=>r.report_type==="roast");
 const companyRows=new Map<string,{name:string;problem:Set<string>;good:Set<string>;all:Set<string>;score:number}>();
 for(const r of rows){if(!r.company_id)continue;const name=companyMap.get(r.company_id);if(!name)continue;const v=companyRows.get(r.company_id)||{name,problem:new Set<string>(),good:new Set<string>(),all:new Set<string>(),score:0};v.all.add(r.id);if(r.report_type==="problem")v.problem.add(r.id);if(r.report_type==="good")v.good.add(r.id);companyRows.set(r.company_id,v)}
 for(const [companyId,v] of companyRows){const byIssue=companyIssueReports.get(companyId)||new Map();let score=0;for(const [issue,set] of byIssue)score+=set.size*(issueWeights[issue]??1);v.score=Math.round(score*100)/100}
 const companyProfiles=[...companyRows.entries()].filter(([id,v])=>v.problem.size>=MIN&&dbCompanyIds.has(id)).sort((a,b)=>b[1].problem.size-a[1].problem.size).slice(0,30).map(([id,v])=>({company:v.name,report_count:v.problem.size,issues:[...(companyIssueReports.get(id)||new Map()).entries()].filter(([issue,set])=>set.size>=MIN&&dbCompanyIssueCounts.has(id+"|"+issue)).map(([issue,set])=>({id:issue,label:labelMap.get(issue)||issue,count:dbCompanyIssueCounts.get(id+"|"+issue)||set.size})).sort((a,b)=>b.count-a.count).slice(0,8)}));
 const redFlag=[...companyRows.entries()].filter(([id,v])=>v.problem.size>=MIN&&dbCompanyIds.has(id)).map(([,v])=>v).sort((a,b)=>b.score-a.score).slice(0,5).map(v=>({company:v.name,report_count:v.problem.size,severity_weighted_score:v.score}));
 const greenFlag=[...companyRows.entries()].filter(([id,v])=>v.good.size>=MIN&&dbPositiveCompanyIds.has(id)).map(([,v])=>v).sort((a,b)=>b.good.size-a.good.size).slice(0,5).map(v=>({company:v.name,good_report_count:v.good.size}));
 const countRows=(field:string,kind?:string)=>{const m=new Map<string,Set<string>>();for(const r of rows){if(kind&&r.report_type!==kind)continue;const v=r[field];if(v===null||v===undefined||v==="")continue;add(m,String(v),r.id)}return [...m.entries()].filter(([,set])=>set.size>=MIN).map(([id,set])=>({id,label:labels[id]||id,count:set.size})).sort((a,b)=>b.count-a.count)};
 const issueCounts=[...dbIssueCounts.entries()].map(([id,count])=>({id,label:labelMap.get(id)||id,count})).sort((a,b)=>b.count-a.count);
 const stage_trends=countRows("stage","problem");
 const stage_issue_trends=[...stageIssueReports.entries()].map(([stage,m])=>({stage,label:labels[stage]||stage,issues:[...m.entries()].filter(([id,set])=>set.size>=MIN&&dbStageIssueCounts.has(stage+"|"+id)).map(([id,set])=>({id,label:labelMap.get(id)||id,count:dbStageIssueCounts.get(stage+"|"+id)||set.size})).sort((a,b)=>b.count-a.count)})).filter(x=>x.issues.length);
 const company_type_trends=countRows("company_type","problem"),city_trends=countRows("city","problem"),outcome_trends=countRows("outcome","problem");
 const monthlyMap=new Map<string,Set<string>>();for(const r of problemRows){const m=String(r.event_month||"").slice(0,7);if(m)add(monthlyMap,m,r.id)}
 const monthly_trends=[...monthlyMap.entries()].filter(([,set])=>set.size>=MIN).sort(([a],[b])=>a.localeCompare(b)).slice(-18).map(([month,set])=>({month,count:set.size,issues:[...(monthlyIssueReports.get(month)||new Map()).entries()].filter(([,ids])=>ids.size>=MIN).map(([id,ids])=>({id,label:labelMap.get(id)||id,count:ids.size})).sort((a,b)=>b.count-a.count).slice(0,8)}));
 const noticeRows=problemRows.filter((r:any)=>Number.isFinite(r.notice_period_days)&&Number.isFinite(r.joining_time_days));
 const noticeGap=noticeRows.length>=MIN?{report_count:noticeRows.length,median_notice_period_days:median(noticeRows.map((r:any)=>r.notice_period_days)),median_joining_time_days:median(noticeRows.map((r:any)=>r.joining_time_days)),median_gap_days:median(noticeRows.map((r:any)=>r.notice_period_days-r.joining_time_days))}:null;
 const hypocrisyRows=problemRows.filter((r:any)=>typeof r.company_enforces_long_notice==="boolean");
 const hypocrisy=hypocrisyRows.length>=MIN?{report_count:hypocrisyRows.length,yes:hypocrisyRows.filter((r:any)=>r.company_enforces_long_notice).length,no:hypocrisyRows.filter((r:any)=>r.company_enforces_long_notice===false).length,unknown_excluded:true,yes_percent:Math.round(hypocrisyRows.filter((r:any)=>r.company_enforces_long_notice).length/hypocrisyRows.length*100)}:null;
 const hikeRows=problemRows.filter((r:any)=>Number.isFinite(r.hike_percent)||r.hike_band);
 const hikeDistribution=[...new Set(hikeRows.map((r:any)=>r.hike_band).filter(Boolean))].map((band:string)=>({band,count:hikeRows.filter((r:any)=>r.hike_band===band).length})).filter(x=>x.count>=MIN);
 const exactHikeRows=hikeRows.filter((r:any)=>Number.isFinite(r.hike_percent));
 const hikeMeter=hikeRows.length>=MIN?{report_count:hikeRows.length,exact_value_report_count:exactHikeRows.length,median_hike_percent:exactHikeRows.length>=MIN?median(exactHikeRows.map((r:any)=>r.hike_percent)):null,distribution:hikeDistribution}:null;
 const offerRows=problemRows.filter((r:any)=>Number.isFinite(r.offer_days_waited)||Number.isFinite(r.offer_delay_days));
 const offerDelay=offerRows.length>=MIN?{report_count:offerRows.length,median_delay_days:median(offerRows.map((r:any)=>Number.isFinite(r.offer_days_waited)?r.offer_days_waited:r.offer_delay_days).filter(Number.isFinite)),days_waited_distribution:[...new Set(offerRows.map((r:any)=>r.offer_wait_band).filter(Boolean))].map((band:string)=>({band,count:offerRows.filter((r:any)=>r.offer_wait_band===band).length})).filter(x=>x.count>=MIN)}:null;
 const bgvRows=problemRows.filter((r:any)=>Number.isFinite(r.bgv_days_pending));
 const bgvAnswered=bgvRows.filter((r:any)=>typeof r.bgv_blocked_joining==="boolean");
 const bgvDelay=bgvRows.length>=MIN?{report_count:bgvRows.length,median_days_pending:median(bgvRows.map((r:any)=>r.bgv_days_pending)),blocked_joining_count:bgvAnswered.length>=MIN?bgvAnswered.filter((r:any)=>r.bgv_blocked_joining===true).length:null,blocked_joining_denominator:bgvAnswered.length>=MIN?bgvAnswered.length:null}:null;
 const moon=problemRows.filter((r:any)=>r.moonlighting_outcome).reduce((m:Map<string,Set<string>>,r:any)=>{add(m,r.moonlighting_outcome,r.id);return m},new Map());
 const moonlighting_outcomes=[...moon.entries()].filter(([,set])=>set.size>=MIN).map(([outcome,set])=>({outcome,label:labels[outcome]||outcome,count:set.size}));
 const layoffs=problemRows.filter((r:any)=>r.stage==="layoff");
 const layoffMonthly=new Map<string,Set<string>>();for(const r of layoffs){const m=String(r.event_month||"").slice(0,7);if(m)add(layoffMonthly,m,r.id)}
 const layoffMonthlyData=[...layoffMonthly.entries()].sort(([a],[b])=>a.localeCompare(b)).slice(-6).map(([month,set])=>({month,count:set.size})).filter(x=>x.count>=MIN);
 const layoffNotice=layoffs.filter((r:any)=>typeof r.layoff_advance_notice==="boolean"),layoffAccess=layoffs.filter((r:any)=>typeof r.layoff_access_cut_same_day==="boolean"),layoffSev=layoffs.filter((r:any)=>Number.isFinite(r.layoff_severance_weeks));
 const layoff_pulse={report_count:layoffs.length>=MIN?layoffs.length:null,monthly:layoffMonthlyData,no_advance_notice:layoffNotice.length>=MIN?{count:layoffNotice.filter((r:any)=>r.layoff_advance_notice===false).length,denominator:layoffNotice.length,percent:Math.round(layoffNotice.filter((r:any)=>r.layoff_advance_notice===false).length/layoffNotice.length*100)}:null,access_cut_same_day:layoffAccess.length>=MIN?{count:layoffAccess.filter((r:any)=>r.layoff_access_cut_same_day===true).length,denominator:layoffAccess.length,percent:Math.round(layoffAccess.filter((r:any)=>r.layoff_access_cut_same_day===true).length/layoffAccess.length*100)}:null,median_severance_weeks:layoffSev.length>=MIN?{value:median(layoffSev.map((r:any)=>Number(r.layoff_severance_weeks))),report_count:layoffSev.length}:null};
 const resolved=problemRows.filter((r:any)=>r.outcome==="resolved").length,nonResolved=problemRows.filter((r:any)=>r.outcome&&r.outcome!=="resolved").length;
 const resolution_rate=resolved>=MIN&&nonResolved>=MIN?{report_count:resolved+nonResolved,resolved_count:resolved,rate_percent:Math.round(resolved/(resolved+nonResolved)*100)}:null;
 const pollCounts=new Map<string,number>();for(const p of pollQ.data||[])pollCounts.set(p.option_slug,(pollCounts.get(p.option_slug)||0)+1);
 const pollOptions=["layoff-insurance","notice-regulation","severance-tax-relief","faster-grievance-portal","other"];
 const government_poll={total:(pollQ.data||[]).length>=MIN?(pollQ.data||[]).length:null,results:pollOptions.map(option=>({option,label:({ "layoff-insurance":"Layoff insurance","notice-regulation":"Notice-period regulation","severance-tax-relief":"Tax relief on severance","faster-grievance-portal":"Faster grievance portal","other":"Other"} as Record<string,string>)[option],count:(pollCounts.get(option)||0)>=MIN?pollCounts.get(option):null})),company_independent:true};
 const publicQ=await db.from("reports").select("id,report_type,company_id,public_text,roast_text,published_at,public_status,screening_result,flag_count").eq("report_group","it").eq("public_status","published").in("screening_result",["clean","masked"]).lt("flag_count",3).order("published_at",{ascending:false}).limit(40);
 if(publicQ.error){console.error("Public story query failed",publicQ.error.message);return json({error:"Trends unavailable"},503,origin)}
 const publicStories=(publicQ.data||[]).filter((r:any)=>r.public_text||r.roast_text).map((r:any)=>{const c=companyRows.get(r.company_id);return {id:r.id,report_type:r.report_type,text:r.public_text||r.roast_text,company:c&&dbAllCompanyIds.has(r.company_id)?c.name:null,published_at:r.published_at,label:"Anonymous, user-submitted, not verified"}}).filter((r:any)=>r.report_type==="roast"||r.company!==null).slice(0,24);
 const policyQ=await db.from("policy_changes").select("id,title,description,evidence_url,effective_date,company_id").eq("status","approved").not("evidence_url","is",null).order("effective_date",{ascending:false,nullsFirst:false}).limit(30);
 let policy_changes:any[]=[];if(!policyQ.error&&(policyQ.data||[]).length){policy_changes=(policyQ.data||[]).map((p:any)=>({id:p.id,title:p.title,description:p.description,evidence_url:p.evidence_url,effective_date:p.effective_date,company:companyMap.get(p.company_id)||null})).filter((p:any)=>p.company&&companyProfiles.some(c=>c.company===p.company))}
 const companyQ=await db.from("company_responses").select("id,company_id,response_text,submitted_at").eq("status","approved").order("submitted_at",{ascending:false}).limit(30);
 let company_responses:any[]=[];if(!companyQ.error){company_responses=(companyQ.data||[]).map((x:any)=>({company:companyMap.get(x.company_id)||null,response_text:x.response_text,submitted_at:x.submitted_at})).filter((x:any)=>x.company&&companyProfiles.some(c=>c.company===x.company))}
 const currentMonth=new Date().toISOString().slice(0,7),currentMonthRows=problemRows.filter((r:any)=>String(r.event_month||"").slice(0,7)===currentMonth);
 const approvedCount=rows.length;
 const tier=approvedCount>=200?200:approvedCount>=25?25:approvedCount>=15?15:approvedCount>=5?5:0;
 const weekAgo=Date.now()-7*24*60*60*1000;
 const reports_this_week=rows.filter((r:any)=>{const t=Date.parse(String(r.created_at||""));return Number.isFinite(t)&&t>=weekAgo}).length;
 const chartEligible=(count:number)=>Number.isFinite(count)&&count>=MIN;
 const safeIssues=tier>=5?issueCounts.filter((x:any)=>chartEligible(Number(x.count))):[];
 const safeStageIssues=tier>=15?stage_issue_trends.filter((x:any)=>x.issues.some((it:any)=>chartEligible(Number(it.count)))):[];
 const safeMonthly=tier>=15?monthly_trends.filter((x:any)=>chartEligible(Number(x.count))):[];
 const safeNotice=tier>=25&&noticeRows.length>=MIN?noticeGap:null;
 const safeHypocrisy=tier>=25&&hypocrisyRows.length>=MIN?hypocrisy:null;
 const safeHike=tier>=25&&hikeRows.length>=MIN?{...hikeMeter,distribution:hikeDistribution.filter((x:any)=>chartEligible(Number(x.count)))}:null;
 const safeOffer=tier>=25&&offerRows.length>=MIN?offerDelay:null;
 const safeBgv=tier>=25&&bgvRows.length>=MIN?bgvDelay:null;
 const safeLayoff=tier>=200?layoff_pulse:{report_count:null,monthly:[],no_advance_notice:null,access_cut_same_day:null,median_severance_weeks:null};
 const safeCity=tier>=200?city_trends:[];
 const safeCompanyType=tier>=200?company_type_trends:[];
 const safeCompanyProfiles=tier>=200?companyProfiles:[];
 const safeRedFlag=tier>=200?redFlag:[];
 const safeGreenFlag=tier>=200?greenFlag:[];

 const currentMonthIssueMap=new Map<string,Set<string>>();for(const r of currentMonthRows){for(const issue of [r.primary_issue_id,...(r.secondary_issue_ids||[])].filter(Boolean))add(currentMonthIssueMap,String(issue),r.id)}
 const topIssuesThisMonth=[...currentMonthIssueMap.entries()].filter(([,set])=>set.size>=MIN).map(([id,set])=>({id,label:labelMap.get(id)||id,count:set.size})).sort((a,b)=>b.count-a.count).slice(0,5);
 const lastQuarterStart=new Date();lastQuarterStart.setMonth(lastQuarterStart.getMonth()-2);const quarterKey=lastQuarterStart.toISOString().slice(0,7);
 const quarterRows=problemRows.filter((r:any)=>String(r.event_month||"").slice(0,7)>=quarterKey);
 const quarterIssueMap=new Map<string,Set<string>>();for(const r of quarterRows){for(const issue of [r.primary_issue_id,...(r.secondary_issue_ids||[])].filter(Boolean))add(quarterIssueMap,String(issue),r.id)}
 const topIssuesQuarter=[...quarterIssueMap.entries()].filter(([,set])=>set.size>=MIN).map(([id,set])=>({id,label:labelMap.get(id)||id,count:set.size})).sort((a,b)=>b.count-a.count).slice(0,5);
 return json({
  total_reports:approvedCount,problem_reports:problemRows.length,good_reports:goodRows.length,roast_reports:roastRows.length,
  companies_reported:[...companyRows.values()].filter(v=>v.all.size>=1).length,
  layoff_reports_90_days:layoffs.filter((r:any)=>String(r.event_month||"")>=new Date(Date.now()-90*86400000).toISOString().slice(0,7)).length,
  personal_reports:0,it_reports:rows.length,total_issue_selections:safeIssues.reduce((n:any,x:any)=>n+x.count,0),
  tier, reports_this_week, updated_at:new Date().toISOString(),
  issues:safeIssues,companies:tier>=200?safeCompanyProfiles.slice(0,5).map(c=>({company:c.company,count:c.report_count})):[],
  company_profiles:safeCompanyProfiles,red_flag_watchlist:safeRedFlag,green_flag_companies:safeGreenFlag,company_responses:tier>=200?company_responses:[],
  experience_trends:tier>=200?countRows("experience_band","problem"):[],stage_trends:tier>=15?stage_trends:[],stage_issue_trends:safeStageIssues,company_type_trends:safeCompanyType,city_trends:safeCity,outcome_trends:tier>=15?outcome_trends:[],monthly_trends:safeMonthly,
  top_issues_this_month:topIssuesThisMonth,top_issues_latest_quarter:topIssuesQuarter,
  notice_gap:safeNotice,notice_hypocrisy_meter:safeHypocrisy,hike_meter:safeHike,offer_delay:safeOffer,bgv_delay:safeBgv,
  moonlighting_outcomes:tier>=25?moonlighting_outcomes:[],layoff_pulse:safeLayoff,resolution_rate:tier>=25?resolution_rate:null,government_poll,public_stories:tier>=200?publicStories:[],
  policy_changes,scoring_rules:{red_flag:"Sum of issue report counts multiplied by the published issue severity weights; not an employer verdict.",green_flag:"Count of approved positive-experience reports; absence of complaints is not a positive rating.",minimum_reports:MIN,tier_thresholds:{issues:5,stage_and_monthly:15,structured_metrics:25,company_and_layoff_comparisons:200},trend_eligibility:"Screened and published, unflagged for at least 24 hours."},
  methodology:"Counts use screened, published, unflagged reports at least 24 hours old. Each chart and named company bucket requires at least five eligible reports. Stories are user-submitted and not verified; no raw submission text is returned."
 },200,origin);
}));
