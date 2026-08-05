import { Link, useNavigate } from "@tanstack/react-router";
import { FileCode2, LogOut, Plus, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/useRole";

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
          <Button asChild variant="ghost" size="sm">
            <Link to="/runs">My Runs</Link>
          </Button>
          {isAdmin ? (
            <Button asChild variant="ghost" size="sm">
              <Link to="/datasets">Data sets</Link>
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
