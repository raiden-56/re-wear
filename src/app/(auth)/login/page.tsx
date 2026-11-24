import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { getCurrentUser } from "@/server/auth/session";
import { ROLE_HOME } from "@/server/auth/permissions";
import { env, demoOtpEnabled } from "@/server/env";

export const metadata = { title: "Sign in" };

const DEMO = [
  ["Customer", "9000000001"],
  ["Collector", "9000000003"],
  ["Warehouse", "9000000004"],
  ["Admin", "9000000005"],
  ["Super admin", "9000000006"],
  ["B2B buyer", "9000000007"],
  ["Recycler", "9000000008"],
  ["NGO partner", "9000000009"],
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const user = await getCurrentUser();
  if (user) redirect(ROLE_HOME[user.role]);
  const e = env();
  return (
    <>
      {error && <p className="mb-4 rounded-xl bg-danger-50 px-3 py-2 text-sm text-danger">{error}</p>}
      <LoginForm next={next} googleEnabled={!!e.GOOGLE_CLIENT_ID && !!e.GOOGLE_CLIENT_SECRET} />
      {demoOtpEnabled() && (
        <details className="mt-8 rounded-2xl border border-dashed border-line p-4 text-sm">
          <summary className="cursor-pointer font-medium">Demo accounts (development)</summary>
          <p className="mt-2 text-xs text-muted">Every demo number signs in with OTP 123456.</p>
          <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            {DEMO.map(([r, p]) => <li key={p} className="flex justify-between gap-2"><span className="text-muted">{r}</span><span className="num font-medium">{p}</span></li>)}
          </ul>
        </details>
      )}
    </>
  );
}
