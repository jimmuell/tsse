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
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search['redirect'] === "string" ? (search['redirect'] as string) : undefined,
  }),
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

function AuthPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const search = useSearch({ from: "/auth" });
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      const target = search.redirect;
      navigate({ to: target && target.startsWith("/") ? target : "/" });
    }
  }, [loading, user, navigate, search.redirect]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast.success("Password reset link sent. Check your email.");
        setMode("signin");
      } else if (mode === "signup") {
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
            {mode === "forgot"
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
            {mode !== "forgot" ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-xs">
                    Password
                  </Label>
                  {mode === "signin" ? (
                    <button
                      type="button"
                      className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                      onClick={() => setMode("forgot")}
                    >
                      Forgot password?
                    </button>
                  ) : null}
                </div>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            ) : null}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy
                ? "Working…"
                : mode === "signin"
                  ? "Sign in"
                  : mode === "signup"
                    ? "Create account"
                    : "Send reset link"}
            </Button>
          </form>
          {mode === "forgot" ? (
            <button
              type="button"
              className="mt-3 w-full text-xs text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => setMode("signin")}
            >
              Back to sign in
            </button>
          ) : null}

          <div className="my-4 flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">or</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <Button variant="outline" className="w-full" onClick={google}>
            Continue with Google
          </Button>

          {import.meta.env.DEV ? (
            <Button
              type="button"
              variant="secondary"
              className="mt-2 w-full"
              disabled={busy}
              onClick={async () => {
                // Dev/preview only (see the import.meta.env.DEV guard above) — never bundled
                // into a production build, so no test credential ships in the public app.
                // Override with VITE_TEST_EMAIL / VITE_TEST_PASSWORD if needed.
                const testEmail = import.meta.env["VITE_TEST_EMAIL"] ?? "test@tsse.com";
                const testPassword = import.meta.env["VITE_TEST_PASSWORD"] ?? "87654321";
                setBusy(true);
                try {
                  const creds = { email: testEmail, password: testPassword };
                  let { error } = await supabase.auth.signInWithPassword(creds);
                  if (error) {
                    const signUp = await supabase.auth.signUp({
                      ...creds,
                      options: { emailRedirectTo: window.location.origin },
                    });
                    if (signUp.error) throw signUp.error;
                    if (!signUp.data.session) {
                      const retry = await supabase.auth.signInWithPassword(creds);
                      if (retry.error) throw retry.error;
                    }
                  }
                  toast.success("Signed in as test user");
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Auto sign-in failed");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Auto sign in (test user)
            </Button>
          ) : null}

          {mode !== "forgot" ? (
            <button
              type="button"
              className="mt-4 w-full text-xs text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            >
              {mode === "signin"
                ? "No account yet? Create one"
                : "Already have an account? Sign in"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
