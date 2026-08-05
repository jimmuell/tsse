import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { FileCode2, KeyRound, LogOut, Plus, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/useRole";

/**
 * Rotates the signed-in user's own password via supabase.auth.updateUser — acts on
 * the caller's session only, needs no admin powers and no service-role key, and
 * cannot touch any other account. This is how the test password gets rotated now
 * that the direct setPasswordDirect back door is gone — /reset-password only
 * accepts a genuine email recovery-link session, not a plain signed-in visit.
 */
function ChangePasswordDialog() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password updated.");
      setOpen(false);
      setPassword("");
      setConfirm("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setPassword("");
          setConfirm("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Change password">
          <KeyRound className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription>Sets a new password for your signed-in account.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
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
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy ? "Updating…" : "Update password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AppShell({ children, email }: { children: ReactNode; email?: string | null }) {
  const navigate = useNavigate();
  const { isAdmin } = useRole();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-6">
          <Link to="/" className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded bg-primary text-primary-foreground">
              <FileCode2 className="size-4" />
            </span>
            <span className="font-mono text-sm font-semibold tracking-tight">TSSE</span>
            <span className="hidden text-xs text-muted-foreground sm:inline">
              Strategy Specification Engine
            </span>
          </Link>
          <div className="flex-1" />
          {!isAdmin ? (
            <Button asChild variant="ghost" size="sm">
              <Link to="/runs">My Runs</Link>
            </Button>
          ) : null}
          {isAdmin ? (
            <Button asChild variant="ghost" size="sm" className="gap-1.5">
              <Link to="/admin">
                <ShieldCheck className="size-4" />
                Admin
              </Link>
            </Button>
          ) : null}

          <Button asChild size="sm" className="gap-1.5">
            <Link to="/strategies/new">
              <Plus className="size-4" />
              New strategy
            </Link>
          </Button>
          {email ? (
            <div className="flex items-center gap-2">
              <span className="hidden font-mono text-xs text-muted-foreground md:inline">
                {email}
              </span>
              <ChangePasswordDialog />
              <Button
                variant="ghost"
                size="icon"
                aria-label="Sign out"
                onClick={async () => {
                  await supabase.auth.signOut();
                  navigate({ to: "/auth" });
                }}
              >
                <LogOut className="size-4" />
              </Button>
            </div>
          ) : null}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
