import { signIn } from "@/auth";

export default async function SignInPage({
  searchParams,
}: PageProps<"/signin">) {
  const { callbackUrl } = await searchParams;
  const redirectTo =
    typeof callbackUrl === "string" && callbackUrl.startsWith("/")
      ? callbackUrl
      : "/";

  return (
    <div className="mx-auto mt-16 max-w-sm space-y-6 text-center">
      <div>
        <div className="text-4xl">🏈</div>
        <h1 className="mt-2 text-2xl font-bold text-ink">CFB Predictions</h1>
        <p className="mt-1 text-ink-muted">
          Sign in to make and keep your own predictions for the season.
        </p>
      </div>
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo });
        }}
      >
        <button
          type="submit"
          className="w-full rounded bg-accent px-4 py-2.5 font-semibold text-accent-ink hover:bg-accent-strong"
        >
          Sign in with Google
        </button>
      </form>
    </div>
  );
}
