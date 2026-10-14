import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server@1";

const allowedOrigins = new Set([
  "https://behindthepaycheck.in",
  "https://www.behindthepaycheck.in",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
]);
const MIN_VOTES = 5;
function response(body: unknown, status = 200, origin: string | null = null) {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  });
  if (origin && allowedOrigins.has(origin)) headers.set("Access-Control-Allow-Origin", origin);
  return new Response(JSON.stringify(body), { status, headers });
}
async function hashToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
function validToken(value: unknown): value is string {
  return typeof value === "string" && value.length >= 16 && value.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(value);
}
Deno.serve(withSupabase({ auth: "publishable" }, async (req: Request, ctx) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    if (origin && !allowedOrigins.has(origin)) return response({ error: "Origin not allowed" }, 403, origin);
    const headers = new Headers({
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-device-token",
      "Vary": "Origin",
    });
    if (origin) headers.set("Access-Control-Allow-Origin", origin);
    return new Response(null, { status: 204, headers });
  }
  if (origin && !allowedOrigins.has(origin)) return response({ error: "Origin not allowed" }, 403, origin);
  if (!["GET", "POST"].includes(req.method)) return response({ error: "Method not allowed" }, 405, origin);

  const db = ctx.supabaseAdmin;
  let body: Record<string, unknown> = {};
  if (req.method === "POST") {
    try { body = await req.json(); } catch { return response({ error: "Invalid JSON body" }, 400, origin); }
    if (!validToken(body.device_token)) return response({ error: "A valid device token is required" }, 400, origin);
    if (typeof body.poll_id !== "string" || body.poll_id.length > 80 || typeof body.option_id !== "string" || body.option_id.length > 80) {
      return response({ error: "Poll and option are required" }, 400, origin);
    }
  }
  const url = new URL(req.url);
  const requestedPoll = req.method === "POST" ? String(body.poll_id) : url.searchParams.get("poll_id");
  const deviceHash = validToken(req.method === "POST" ? body.device_token : req.headers.get("x-device-token"))
    ? await hashToken(String(req.method === "POST" ? body.device_token : req.headers.get("x-device-token")))
    : null;

  if (req.method === "POST") {
    const pollResult = await db.from("polls").select("id,question,options").eq("id", requestedPoll).eq("active", true).maybeSingle();
    if (pollResult.error) return response({ error: "Polls temporarily unavailable" }, 503, origin);
    if (!pollResult.data) return response({ error: "Poll not found" }, 404, origin);
    const options = Array.isArray(pollResult.data.options) ? pollResult.data.options : [];
    if (!options.some((x: any) => x && x.id === body.option_id)) return response({ error: "Invalid poll option" }, 400, origin);
    const insert = await db.from("poll_votes").insert({
      poll_id: requestedPoll,
      option_id: body.option_id,
      device_token_hash: deviceHash,
    });
    if (insert.error) {
      if (insert.error.code === "23505") return response({ error: "You have already voted in this poll on this device", already_voted: true }, 409, origin);
      console.error("Poll vote insert failed", insert.error.message);
      return response({ error: "Vote could not be saved. Please try again later." }, 503, origin);
    }
  }

  const pollsQuery = db.from("polls").select("id,question,options,sort_order").eq("active", true).order("sort_order", { ascending: true });
  if (requestedPoll) pollsQuery.eq("id", requestedPoll);
  const polls = await pollsQuery;
  if (polls.error) return response({ error: "Polls temporarily unavailable" }, 503, origin);
  const pollIds = (polls.data || []).map((p: any) => p.id);
  if (!pollIds.length) return response({ polls: [], minimum_votes: MIN_VOTES }, 200, origin);
  const votes = await db.from("poll_votes").select("poll_id,option_id,device_token_hash").in("poll_id", pollIds).limit(50000);
  if (votes.error) return response({ error: "Poll results temporarily unavailable" }, 503, origin);
  const output = (polls.data || []).map((p: any) => {
    const pollVotes = (votes.data || []).filter((v: any) => v.poll_id === p.id);
    const canShow = pollVotes.length >= MIN_VOTES;
    const counts = new Map<string, number>();
    for (const v of pollVotes) counts.set(v.option_id, (counts.get(v.option_id) || 0) + 1);
    const options = (Array.isArray(p.options) ? p.options : []).map((o: any) => ({
      id: o.id,
      label: o.label,
      count: canShow ? (counts.get(o.id) || 0) : null,
      percent: canShow ? Math.round((counts.get(o.id) || 0) / pollVotes.length * 100) : null,
    }));
    return {
      id: p.id,
      question: p.question,
      options,
      vote_count: canShow ? pollVotes.length : null,
      minimum_votes: MIN_VOTES,
      results_available: canShow,
      voted: deviceHash ? pollVotes.some((v: any) => v.device_token_hash === deviceHash) : false,
    };
  });
  return response({ polls: output, minimum_votes: MIN_VOTES, updated_at: new Date().toISOString() }, 200, origin);
}));
