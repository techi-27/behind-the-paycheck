import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server@1";

const allowedOrigins = new Set([
  "https://behindthepaycheck.in",
  "https://www.behindthepaycheck.in",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
]);

function json(body: unknown, status = 200, origin: string | null = null) {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  });
  if (origin && allowedOrigins.has(origin)) headers.set("Access-Control-Allow-Origin", origin);
  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(withSupabase({ auth: "publishable" }, async (req: Request, ctx) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    if (origin && !allowedOrigins.has(origin)) return new Response(null, { status: 403 });
    const headers = new Headers({
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Vary": "Origin",
    });
    if (origin) headers.set("Access-Control-Allow-Origin", origin);
    return new Response(null, { status: 204, headers });
  }
  if (origin && !allowedOrigins.has(origin)) return json({ error: "Origin not allowed" }, 403, origin);
  if (req.method !== "GET" && req.method !== "POST") return json({ error: "Method not allowed" }, 405, origin);

  const authorization = req.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const apiKey = req.headers.get("apikey") || "";
  if (!token || !apiKey) return json({ error: "Please sign in with an authorized moderator account." }, 401, origin);

  // Validate the access token against Supabase Auth; never trust a browser-supplied email.
  const projectUrl = Deno.env.get("SUPABASE_URL");
  if (!projectUrl) return json({ error: "Moderator authentication is not configured." }, 503, origin);
  const authResponse = await fetch(projectUrl + "/auth/v1/user", {
    headers: { apikey: apiKey, Authorization: "Bearer " + token },
  });
  if (!authResponse.ok) return json({ error: "Your session is invalid or expired. Please sign in again." }, 401, origin);
  const user = await authResponse.json();
  if (!user?.id || !user?.email) return json({ error: "Unable to verify moderator account." }, 401, origin);

  const allowlist = (Deno.env.get("BTP_MODERATOR_EMAILS") || "")
    .split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
  if (!allowlist.length) return json({ error: "Moderator access is not configured. Set BTP_MODERATOR_EMAILS in Edge Function secrets." }, 503, origin);
  if (!allowlist.includes(String(user.email).toLowerCase())) return json({ error: "This account is not authorized to moderate reports." }, 403, origin);

  const db = ctx.supabaseAdmin;
  if (req.method === "GET") {
    const { data, error } = await db
      .from("reports")
      .select("id, report_group, company_id, story_text, gender, experience_range, status, created_at, companies(display_name), report_issues(issue_id, issues(label))")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(100);
    if (error) {
      console.error("Pending report fetch failed:", error.message);
      return json({ error: "Unable to load pending reports." }, 503, origin);
    }
    return json({ reports: data || [] }, 200, origin);
  }

  let payload: any;
  try { payload = await req.json(); } catch { return json({ error: "Invalid JSON body." }, 400, origin); }
  const reportId = payload?.report_id;
  const action = payload?.action;
  const reason = typeof payload?.reason === "string" ? payload.reason.trim() : "";
  if (typeof reportId !== "string" || !/^[0-9a-f-]{36}$/i.test(reportId)) return json({ error: "Invalid report ID." }, 400, origin);
  if (action !== "approved" && action !== "rejected") return json({ error: "Choose approve or reject." }, 400, origin);
  if (reason.length > 500) return json({ error: "Reason must be 500 characters or fewer." }, 400, origin);

  const { data: existing, error: lookupError } = await db.from("reports").select("id,status").eq("id", reportId).maybeSingle();
  if (lookupError) {
    console.error("Report lookup failed:", lookupError.message);
    return json({ error: "Unable to verify report." }, 503, origin);
  }
  if (!existing) return json({ error: "Report not found." }, 404, origin);
  if (existing.status !== "pending") return json({ error: "This report has already been reviewed. Refresh the queue." }, 409, origin);

  const { data: changed, error: updateError } = await db
    .from("reports")
    .update({ status: action, moderated_at: new Date().toISOString() })
    .eq("id", reportId).eq("status", "pending")
    .select("id").maybeSingle();
  if (updateError || !changed) {
    console.error("Report moderation update failed:", updateError?.message || "No row updated");
    return json({ error: "Unable to update report status. Refresh and try again." }, 503, origin);
  }

  const { error: auditError } = await db.from("moderation_events").insert({
    report_id: reportId,
    moderator_id: user.id,
    action,
    reason: reason || null,
  });
  if (auditError) {
    console.error("Moderation audit event failed:", auditError.message);
    // The status change is already committed; explain partial audit failure rather than pretending rollback.
    return json({ success: true, status: action, warning: "Status updated, but the audit event could not be saved. Check moderation_events." }, 200, origin);
  }
  return json({ success: true, status: action }, 200, origin);
}));
