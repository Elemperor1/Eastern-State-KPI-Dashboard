"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { Alert, Avatar, Button, Card, FormField, Input } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Login failed.");
        setLoading(false);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      console.error(err);
      setError("Unexpected error. Try again.");
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-12 bg-ink-50">
      <div className="w-full max-w-[420px]">
        <Card variant="elevated" className="p-8 md:p-10">
          <div className="text-center mb-8">
            <Avatar initials="ES" size="lg" variant="brand" className="mb-5 mx-auto" />
            <h1 className="text-2xl font-semibold text-ink-900 text-balance">
              Eastern State KPI Intelligence
            </h1>
            <p className="text-sm text-ink-500 mt-2 text-pretty">
              Sign in with your Eastern State account to continue.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <FormField htmlFor="email" label="Email">
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@easternstate.org"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
                onChange={(e) => setPassword(e.target.value)}
              />
            </FormField>

            {error ? (
              <Alert variant="error">{error}</Alert>
            ) : null}

            <Button type="submit" variant="primary" fullWidth isLoading={loading} icon={LockKeyhole}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </Card>

        <p className="mt-6 text-center text-xs text-ink-500 leading-relaxed text-pretty">
          Authorized personnel only. Activity is logged for audit purposes. Need access? Contact Kerry Sautner or Zach Palmer.
        </p>
      </div>
    </main>
  );
}
