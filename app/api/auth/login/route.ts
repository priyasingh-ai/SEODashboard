import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Credential check.
 *
 * Exists so the credentials are not in the browser bundle. They were compiled
 * into `hooks/use-auth.tsx` and shipped to every visitor — readable in devtools
 * and committed to the repository. Reading them from `process.env` in a client
 * component would not have fixed that: Next only exposes `NEXT_PUBLIC_*` to the
 * browser, and anything it does expose is inlined into the bundle, which is the
 * same leak by a different route. The comparison has to happen somewhere the
 * browser cannot see, which means here.
 *
 * ## What this still does not do
 *
 * It hides the credentials. It does not protect the data. The session it grants
 * is a flag in the browser's own storage, so it can be set by hand, and the
 * `/api` data routes remain unauthenticated and answer regardless. Closing that
 * needs an httpOnly session cookie set here and read in `withApi`, which
 * documents itself as the single choke point every data request passes through.
 *
 * There is also no rate limit. One shared password behind a public endpoint is
 * guessable given enough attempts; a counter keyed by IP belongs here before
 * this is exposed to anything but a known audience.
 */

/** Never prerendered — it reads a request body and the environment. */
export const dynamic = "force-dynamic";

/** One message for every failure, so nothing reveals which half was wrong. */
const INVALID = "Invalid email or password.";

export async function POST(request: NextRequest) {
  const expectedEmail = process.env.AUTH_EMAIL?.trim().toLowerCase();
  const expectedPassword = process.env.AUTH_PASSWORD;

  // Refuse rather than fall back. A default credential compiled in as a
  // "convenience" is the one that survives to production unnoticed.
  if (!expectedEmail || !expectedPassword) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "Sign-in is not configured. Set AUTH_EMAIL and AUTH_PASSWORD in the environment.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  let email = "";
  let password = "";
  try {
    const body = (await request.json()) as { email?: unknown; password?: unknown };
    email = typeof body.email === "string" ? body.email : "";
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    // Malformed body is a failed attempt, not a different kind of error.
  }

  // Addresses are case-insensitive in practice, so matching one on case would
  // reject a correct sign-in for no reason. The password is compared exactly.
  const matches = email.trim().toLowerCase() === expectedEmail && password === expectedPassword;

  if (!matches) {
    return NextResponse.json(
      { ok: false, message: INVALID },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  // The canonical address, so the account menu shows what was configured rather
  // than whatever casing was typed.
  return NextResponse.json(
    { ok: true, email: expectedEmail },
    { headers: { "Cache-Control": "no-store" } },
  );
}
