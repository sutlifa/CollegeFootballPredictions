import Link from "next/link";
import { auth } from "@/auth";
import { ReportForm } from "./ReportForm";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Report a problem",
  description: "Tell the person who runs the app what went wrong.",
};

export default async function ReportPage() {
  const session = await auth();
  const who = session?.user?.name ?? session?.user?.email ?? "you";

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-ink">Report a problem</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          This goes straight to whoever runs the app, sent as{" "}
          <span className="font-semibold text-ink">{who}</span> so there is
          nothing to fill in that we already know. Replies come back to your
          email address.
        </p>
      </div>

      <ReportForm />

      <p className="text-xs leading-relaxed text-ink-muted">
        Useful things to mention: which week, which game, whether you were on a
        phone or a computer, and what you expected to happen instead. For how
        your information is handled, see the{" "}
        <Link href="/privacy" className="text-accent-strong hover:underline">
          privacy policy
        </Link>
        .
      </p>
    </div>
  );
}
