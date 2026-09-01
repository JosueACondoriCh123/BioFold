import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const defaultOrigins = ["http://127.0.0.1:4173", "http://localhost:4173"];

function allowedOrigins() {
  const configured = Deno.env.get("BIOFOLD_ALLOWED_ORIGINS")
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return new Set(configured?.length ? configured : defaultOrigins);
}

function corsHeaders(origin: string | null) {
  const allowed = origin && allowedOrigins().has(origin) ? origin : defaultOrigins[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function json(status: number, origin: string | null, code: string, message: string, retryable: boolean) {
  return Response.json({ error: { code, message, retryable } }, {
    status,
    headers: corsHeaders(origin),
  });
}

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin");
  if (origin && !allowedOrigins().has(origin)) {
    return json(403, null, "ORIGIN_NOT_ALLOWED", "This origin is not allowed to call BioFold Assistant.", false);
  }
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (request.method !== "POST") return json(405, origin, "METHOD_NOT_ALLOWED", "Use POST for assistant requests.", false);

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return json(401, origin, "AUTH_REQUIRED", "Sign in before using BioFold Assistant.", false);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json(400, origin, "INVALID_INPUT", "The request body must be valid JSON.", false);
  }
  if (typeof body.requestId !== "string" || !body.requestId ||
      typeof body.projectId !== "string" || !body.projectId ||
      typeof body.message !== "string" || !body.message.trim() || body.message.length > 4_000) {
    return json(400, origin, "INVALID_INPUT", "requestId, projectId and a message of at most 4,000 characters are required.", false);
  }

  // Fail closed until the authenticated persistence and OpenRouter adapters are
  // integrated. No development mock or provider secret is reachable here.
  return json(
    503,
    origin,
    "MODEL_UNAVAILABLE",
    "BioFold Assistant backend integration is not available in this build.",
    true,
  );
});
