export const prerender = false;

type D1Database = { prepare: (sql: string) => D1PreparedStatement };
type D1PreparedStatement = {
  bind: (...args: unknown[]) => D1PreparedStatement;
  run: () => Promise<unknown>;
  all: () => Promise<{ results: unknown[] }>;
  first: (col?: string) => Promise<{ last_submit_at?: string } | null>;
};

const roundCoord = (n: number) => Math.round(n * 100) / 100;

async function hashSubmitterId(ip: string): Promise<string> {
  const buf = new TextEncoder().encode(ip);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function GET({ locals }: { locals: App.Locals }) {
  const env = locals.runtime?.env as { DB?: D1Database } | undefined;
  const DB = env?.DB;
  if (!DB) {
    return new Response(JSON.stringify({ pins: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  try {
    const { results } = await DB.prepare("SELECT id, lat, lng, created_at FROM pins ORDER BY created_at DESC").all();
    return new Response(JSON.stringify({ pins: results ?? [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ pins: [], error: "Failed to load pins" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function POST({ request, locals }: { request: Request; locals: App.Locals }) {
  const env = locals.runtime?.env as { DB?: D1Database } | undefined;
  const DB = env?.DB;
  if (!DB) {
    return new Response(JSON.stringify({ ok: false, error: "Database not configured" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
  let body: { lat?: number; lng?: number };
  try {
    body = (await request.json()) as { lat?: number; lng?: number };
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const lat = typeof body.lat === "number" ? roundCoord(body.lat) : undefined;
  const lng = typeof body.lng === "number" ? roundCoord(body.lng) : undefined;
  if (lat == null || lng == null || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return new Response(JSON.stringify({ ok: false, error: "Valid lat and lng required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const ip =
    request.headers.get("CF-Connecting-IP") ??
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ??
    "";
  let submitterId: string | null = ip ? await hashSubmitterId(ip) : null;
  if (submitterId) {
    try {
      const row = await DB.prepare(
        "SELECT last_submit_at FROM pin_rate_limit WHERE submitter_id = ?"
      )
        .bind(submitterId)
        .first();
      const lastAt = row?.last_submit_at;
      if (lastAt) {
        const last = new Date(lastAt).getTime();
        const windowMs = 24 * 60 * 60 * 1000;
        if (Date.now() - last < windowMs) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: "You can only add one pin per 24 hours. Try again later.",
            }),
            { status: 429, headers: { "Content-Type": "application/json" } }
          );
        }
      }
    } catch {
      // rate_limit table might not exist yet; allow and let insert fail or succeed
    }
  }

  try {
    await DB.prepare("INSERT INTO pins (lat, lng) VALUES (?, ?)").bind(lat, lng).run();
    if (submitterId) {
      await DB.prepare(
        "INSERT OR REPLACE INTO pin_rate_limit (submitter_id, last_submit_at) VALUES (?, datetime('now'))"
      )
        .bind(submitterId)
        .run();
    }
    return new Response(JSON.stringify({ ok: true, lat, lng }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save pin";
    console.error(e);
    const hint = message.includes("no such table") || message.includes("pins")
      ? " Run: npx wrangler d1 execute visitor-pins --local --file=./migrations/0000_create_pins.sql"
      : "";
    return new Response(
      JSON.stringify({ ok: false, error: "Failed to save pin", details: message + hint }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
