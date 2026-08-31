import { NextRequest, NextResponse } from "next/server";
import { activeProvider, emailEnabled, parseFrom, sendReminder } from "@/lib/email";

/**
 * Send exactly one reminder to one address, to prove the mail path works
 * end to end without waiting for a week to come due.
 *
 * Admin-guarded and single-recipient on purpose: this exists so delivery can
 * be checked against your OWN inbox, not as a way to mail the pool. It
 * deliberately does not touch the email_sends ledger -- a test is not a
 * reminder, and recording it would suppress the real one for that week.
 *
 *   curl -X POST -H "x-admin-secret: ..." \
 *     "https://<app>/api/admin/test-email?to=you@example.com"
 */
export async function POST(request: NextRequest) {
  if (
    process.env.ADMIN_SECRET &&
    request.headers.get("x-admin-secret") !== process.env.ADMIN_SECRET
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const to = request.nextUrl.searchParams.get("to");
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    return NextResponse.json(
      { error: "Pass ?to= a single valid email address" },
      { status: 400 },
    );
  }

  const from = parseFrom(process.env.EMAIL_FROM ?? "(unset)");
  const now = new Date();

  // A stand-in week so the real template renders with realistic numbers.
  const outcome = await sendReminder(
    {
      userId: 0,
      email: to,
      name: "there",
      week: 1,
      kind: "nudge",
      locksAt: new Date(now.getTime() + 48 * 3600 * 1000),
      picksMade: 0,
      totalGames: 91,
      missing: 91,
      unsubscribeToken: "test-token-not-a-real-account",
    },
    now,
  );

  return NextResponse.json({
    provider: activeProvider(),
    sendingEnabled: emailEnabled(),
    from,
    to,
    outcome,
  });
}
