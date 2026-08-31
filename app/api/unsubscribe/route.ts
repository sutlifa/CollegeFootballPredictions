import { NextRequest, NextResponse } from "next/server";
import { unsubscribeByToken } from "@/lib/queries";

/**
 * The link at the bottom of every reminder. Deliberately a plain GET with a
 * token in the URL and no sign-in: someone who wants to stop being emailed
 * should not have to log in to say so, and the token identifies them.
 *
 * It only ever turns reminders OFF -- there is nothing here that a leaked or
 * guessed token could use to read or change anything else.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const page = (title: string, body: string) =>
    new NextResponse(
      `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
        `<title>${title}</title>` +
        `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;line-height:1.5">` +
        `<h1 style="font-size:1.25rem">${title}</h1><p>${body}</p></div>`,
      { headers: { "content-type": "text/html; charset=utf-8" } },
    );

  if (!token) {
    return page("Something's missing", "That link didn't include an unsubscribe token.");
  }
  const ok = await unsubscribeByToken(token);
  return ok
    ? page(
        "Reminders turned off",
        "You won't get any more weekly pick reminders. Your picks and account are untouched. There's no self-serve way back on yet — ask whoever runs the pool if you change your mind.",
      )
    : page(
        "Link not recognised",
        "That unsubscribe link didn't match an account. It may already have been used.",
      );
}
