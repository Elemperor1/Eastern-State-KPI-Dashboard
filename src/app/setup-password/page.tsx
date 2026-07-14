"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Alert, BrandMark, Button, FormField, Input } from "@/components/ui";
import { apiFetch } from "@/lib/api-client";

/**
 * Forced password-rotation page.
 *
 * Reached when a user authenticates with a temporary credential
 * (bootstrap account or an admin-issued reset). The account is locked
 * out of the dashboard (server components redirect here; data APIs
 * return 403) until the user sets a permanent password of their own
 * choosing via /api/auth/change-password.
 */
export default function SetupPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data: { user: { must_change_password: boolean } | null }) => {
        if (cancelled) return;
        if (!data.user) {
          router.replace("/login");
          return;
        }
        // An account that does not owe a rotation has nothing to do here.
        if (!data.user.must_change_password) {
          router.replace("/dashboard");
          return;
        }
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) router.replace("/login");
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError("The new password and confirmation do not match.");
      return;
    }
    setLoading(true);
    try {
      const response = await apiFetch("/api/auth/change-password", {
        method: "POST",
        body: { currentPassword, newPassword },
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "Could not update your password.");
        setLoading(false);
        return;
      }
      // The change-password endpoint destroyed this session (req 6:
      // every session issued before/during the replacement is
      // invalidated, including this one). Re-authenticate with the
      // new password to reach the dashboard.
      router.push("/login");
      router.refresh();
    } catch {
      setError("Connection failed. Please try again.");
      setLoading(false);
    }
  }

  if (!ready) return null;

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
            Account security
          </p>
          <h1 className="max-w-xl text-[clamp(2.75rem,4.5vw,4.5rem)] font-semibold leading-[1] tracking-[-0.04em]">
            Replace your temporary password.
          </h1>
          <p className="mt-8 max-w-lg text-base leading-8 text-white/70 text-pretty">
            You signed in with a temporary credential. Choose a new password to finish securing your account before continuing to the dashboard.
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
            <p className="section-eyebrow">Required before continuing</p>
            <h2 className="text-[30px] font-medium leading-[1.2] tracking-[-0.02em] text-ink-900">
              Set a new password
            </h2>
            <p className="mt-3 text-base leading-6 text-ink-600 text-pretty">
              Your current password is temporary. Replace it with one only you know to unlock the dashboard.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <FormField htmlFor="currentPassword" label="Current temporary password">
              <Input
                id="currentPassword"
                type="password"
                autoComplete="current-password"
                required
                placeholder="Enter your temporary password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </FormField>
            <FormField htmlFor="newPassword" label="New password" hint="Minimum 8 characters">
              <Input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                placeholder="8+ characters"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </FormField>
            <FormField htmlFor="confirmPassword" label="Confirm new password">
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                placeholder="Re-enter your new password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
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
              {loading ? "Updating password" : "Update password & continue"}
            </Button>
          </form>
        </div>
      </section>
    </main>
  );
}
