import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { FileCode2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset password — Trading Strategy Specification Engine" },
      {
        name: "description",
        content: "Choose a new password for your TSSE account and get back to your strategy specifications.",
      },
      { property: "og:title", content: "Reset password — Trading Strategy Specification Engine" },
      {
        property: "og:description",
        content: "Set a new password for your TSSE account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password updated. You're signed in.");
      navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update password");
    } finally {
      setBusy(false);
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
          <h1 className="text-lg font-semibold">Set a new password</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {ready
              ? "Enter a new password for your account."
              : "Open this page from the reset link in your email."}
          </p>

          <form onSubmit={submit} className="mt-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-password" className="text-xs">
                New password
              </Label>
              <Input
                id="new-password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password" className="text-xs">
                Confirm password
              </Label>
              <Input
                id="confirm-password"
                type="password"
                required
                minLength={6}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy || !ready}>
              {busy ? "Updating…" : "Update password"}
            </Button>
          </form>

          <button
            type="button"
            className="mt-4 w-full text-xs text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => navigate({ to: "/auth" })}
          >
            Back to sign in
          </button>
        </div>
      </div>
    </div>
  );
}
