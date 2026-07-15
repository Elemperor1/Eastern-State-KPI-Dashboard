"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Alert, BrandMark, Button, FormField, Input } from "@/components/ui";
import { readJsonObject } from "@/lib/api-client";
import { runEventHandler } from "@/lib/async-event";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        const data = await readJsonObject(response);
        setError(typeof data.error === "string" ? data.error : "Login failed.");
        setLoading(false);
        return;
      }
      const data = await readJsonObject(response);
      // A bootstrap / admin-issued temp credential must be rotated
      // before the user reaches the dashboard. Route them to the
      // forced change-password page instead.
      if (data.mustChangePassword === true) {
        router.push("/setup-password");
      } else {
        router.push("/dashboard");
      }
      router.refresh();
    } catch (caught) {
      console.error(caught);
      setError("Connection failed. Please try again.");
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-[100dvh] bg-white lg:grid-cols-[minmax(0,1.08fr)_minmax(28rem,0.92fr)]">
      <section
        className="relative hidden overflow-hidden bg-ink-900 px-12 py-10 text-white lg:flex lg:flex-col lg:justify-between"
        style={{ backgroundImage: "url('/starfield.svg')", backgroundSize: "640px 640px" }}
      >
        <div className="relative z-10 flex items-center gap-3">
          <BrandMark size="md" />
          <div>
            <p className="text-sm font-semibold">Eastern State</p>
            <p className="text-[10px] uppercase tracking-[0.12em] text-white/55">Strategic Plan</p>
          </div>
        </div>

        <div className="relative z-10 max-w-2xl py-16">
          <p className="mb-5 text-sm font-medium uppercase tracking-[0.12em] text-white/60">
            Organizational performance
          </p>
          <h1 className="max-w-xl text-[clamp(3.25rem,5vw,5.5rem)] font-semibold leading-[0.98] tracking-[-0.045em]">
            See the work with more <span className="rounded bg-accent-300 px-2 text-ink-950">clarity.</span>
          </h1>
          <p className="mt-8 max-w-lg text-base leading-8 text-white/70 text-pretty">
            A focused view of the measures that help Eastern State’s leadership understand reach, stewardship, and impact.
          </p>
        </div>

        <p className="relative z-10 text-sm text-white/50">
          Internal reporting · Decision support · Board-ready context
        </p>
      </section>

      <section className="flex min-h-[100dvh] items-center justify-center px-6 py-12 sm:px-12">
        <div className="page-enter w-full max-w-md">
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <BrandMark size="md" />
            <div>
              <p className="text-sm font-semibold text-ink-900">Eastern State</p>
              <p className="text-[10px] uppercase tracking-[0.12em] text-ink-500">Strategic Plan</p>
            </div>
          </div>

          <div className="mb-8">
            <p className="section-eyebrow">Secure access</p>
            <h2 className="text-[30px] font-medium leading-[1.2] tracking-[-0.02em] text-ink-900">
              Welcome back
            </h2>
            <p className="mt-3 text-base leading-6 text-ink-600 text-pretty">
              Sign in with your Eastern State account to continue.
            </p>
          </div>

          <form
            onSubmit={(event) => runEventHandler(handleSubmit, event)}
            className="space-y-5"
          >
            <FormField htmlFor="email" label="Email">
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@easternstate.org"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </FormField>
            <FormField htmlFor="password" label="Password">
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="Enter your password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </FormField>

            {error ? <Alert variant="error">{error}</Alert> : null}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              isLoading={loading}
              icon={ArrowRight}
              iconPosition="right"
            >
              {loading ? "Signing in" : "Sign in"}
            </Button>
          </form>

          <p className="mt-8 max-w-sm text-sm leading-6 text-ink-500 text-pretty">
            Authorized personnel only. Activity is logged for audit purposes. Need access? Contact your administrator — credentials are issued out-of-band and never published.
          </p>
        </div>
      </section>
    </main>
  );
}
