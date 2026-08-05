import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { FileCode2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } =>
    typeof search['redirect'] === "string" ? { redirect: search['redirect'] } : {},
  head: () => ({
    meta: [
      { title: "Sign in — Trading Strategy Specification Engine" },
      {
        name: "description",
        content:
          "Sign in to convert trading strategy descriptions into deterministic, machine-readable strategy specifications.",
      },
      { property: "og:title", content: "Sign in — Trading Strategy Specification Engine" },
      {
        property: "og:description",
        content: "Access your saved strategy specifications and validation reports.",
      },
    ],
  }),
  component: AuthPage,
});

const RESEND_COOLDOWN_SECONDS = 60;

function AuthPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { isAdmin, loading: roleLoading } = useRole();
  const search = useSearch({ from: "/auth" });
  const [mode, setMode] = useState<"signin" | "signup" | "reset">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (loading || roleLoading || !user) return;
    const target = search.redirect;
    if (target && target.startsWith("/")) navigate({ to: target });
    else navigate({ to: isAdmin ? "/admin" : "/" });
  }, [loading, roleLoading, user, isAdmin, navigate, search.redirect]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setInterval(() => {
      setCooldown((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [cooldown]);

  async function sendResetEmail() {
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      // Rate limiting is enforced by the auth service; surface that distinctly.
      const rateLimited =
        error != null &&
        (error.status === 429 ||
          /rate limit|too many/i.test(error.message ?? ""));
      if (rateLimited) {
        toast.error("Too many reset attempts. Please try again in a few minutes.");
        setCooldown(RESEND_COOLDOWN_SECONDS);
        return;
      }
      // Any other outcome returns the same neutral message so the form cannot
      // be used to discover which email addresses have accounts.
      toast.success("If an account exists for that email, a reset link is on the way.");
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "reset") {
      if (cooldown > 0) return;
      await sendResetEmail();
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) {
          toast.success("Account created. Check your email to confirm, then sign in.");
          setMode("signin");
        } else {
          toast.success("Account created. You're signed in.");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    const { lovable } = await import("@/integrations/lovable/index");
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("Google sign-in failed");
      return;
    }
  }


  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary/40 px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded bg-primary text-primary-foreground">
            <FileCode2 className="size-4" />
          </span>
          <div>
            <p className="font-mono text-sm font-semibold">TSSE</p>
            <p className="text-xs text-muted-foreground">Strategy Specification Engine</p>
          </div>
        </div>

        <div className="rounded-md border border-border bg-card p-6">
          <h1 className="text-lg font-semibold">
            {mode === "signin"
              ? "Sign in"
              : mode === "signup"
                ? "Create an account"
                : "Reset your password"}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {mode === "reset"
              ? "We'll email you a link to choose a new password."
              : "Your strategy specifications are private to your account."}
          </p>

          <form onSubmit={submit} className="mt-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {mode === "reset" ? null : (
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs">
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            )}
            <Button
              type="submit"
              className="w-full"
              disabled={busy || (mode === "reset" && cooldown > 0)}
            >
              {busy
                ? "Working…"
                : mode === "signin"
                  ? "Sign in"
                  : mode === "signup"
                    ? "Create account"
                    : cooldown > 0
                      ? `Resend in ${cooldown}s`
                      : "Send reset link"}
            </Button>
          </form>

          {mode === "signin" ? (
            <button
              type="button"
              className="mt-3 w-full text-xs text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => setMode("reset")}
            >
              Forgot password?
            </button>
          ) : null}

          {mode === "reset" ? (
            <button
              type="button"
              className="mt-4 w-full text-xs text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => setMode("signin")}
            >
              Back to sign in
            </button>
          ) : (
            <>
              <div className="my-4 flex items-center gap-3">
                <span className="h-px flex-1 bg-border" />
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  or
                </span>
                <span className="h-px flex-1 bg-border" />
              </div>

              <Button variant="outline" className="w-full" onClick={google}>
                Continue with Google
              </Button>

              <button
                type="button"
                className="mt-4 w-full text-xs text-muted-foreground underline-offset-2 hover:underline"
                onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              >
                {mode === "signin"
                  ? "No account yet? Create one"
                  : "Already have an account? Sign in"}
              </button>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
