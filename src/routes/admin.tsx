import { useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, AlertTriangle, Database, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { getAdminOverview, setUserRole } from "@/lib/admin.functions";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin dashboard — TSSE" },
      {
        name: "description",
        content:
          "Operational overview of accounts, strategy specifications, market data sets and backtest jobs across the Trading Strategy Specification Engine.",
      },
      { property: "og:title", content: "Admin dashboard — TSSE" },
      {
        property: "og:description",
        content: "Monitor accounts, specs, data sets and backtest job health in one place.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

function Stat({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: typeof Users;
}) {
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </div>
      <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function StatusRow({ counts }: { counts: Record<string, number> }) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    return <p className="text-xs text-muted-foreground">Nothing recorded yet.</p>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {entries.map(([status, n]) => (
        <Badge key={status} variant="secondary" className="font-mono text-xs">
          {status}: {n}
        </Badge>
      ))}
    </div>
  );
}

function AdminPage() {
  const { user, loading } = useAuth();
  const { isAdmin, loading: roleLoading } = useRole();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchOverview = useServerFn(getAdminOverview);
  const changeRole = useServerFn(setUserRole);

  useEffect(() => {
    if (loading || roleLoading) return;
    if (!user) navigate({ to: "/auth", search: { redirect: "/admin" } });
    else if (!isAdmin) navigate({ to: "/" });
  }, [loading, roleLoading, user, isAdmin, navigate]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-overview"],
    enabled: !!user && isAdmin,
    queryFn: () => fetchOverview(),
    refetchInterval: 30_000,
  });

  const roleMutation = useMutation({
    mutationFn: (vars: { userId: string; role: "user" | "admin" }) => changeRole({ data: vars }),
    onSuccess: () => {
      toast.success("Role updated");
      queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not update role"),
  });

  return (
    <AppShell email={user?.email}>
      <div className="mb-6 flex items-center gap-3">
        <ShieldCheck className="size-5 text-primary" />
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Admin dashboard</h1>
          <p className="text-xs text-muted-foreground">
            Platform-wide view of accounts, specifications and backtest health. Refreshes every 30s.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
          {error instanceof Error ? error.message : "Could not load the dashboard."}
        </div>
      ) : data ? (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Accounts"
              value={data.totals.users}
              hint={`${data.totals.admins} admin${data.totals.admins === 1 ? "" : "s"}`}
              icon={Users}
            />
            <Stat
              label="Strategy specs"
              value={data.totals.strategies}
              hint={`${data.totals.openQuestions} open clarifying questions`}
              icon={ShieldCheck}
            />
            <Stat
              label="Data sets"
              value={data.totals.datasets}
              hint={`${data.totals.bars.toLocaleString()} bars stored`}
              icon={Database}
            />
            <Stat
              label="Backtest runs"
              value={data.totals.runs}
              hint={`${data.totals.runsLast24h} in the last 24h`}
              icon={Activity}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-md border border-border bg-card p-4">
              <h2 className="mb-3 text-sm font-semibold">Specifications by stage</h2>
              <StatusRow counts={data.strategyStatus} />
            </section>
            <section className="rounded-md border border-border bg-card p-4">
              <h2 className="mb-3 text-sm font-semibold">
                Engine jobs by status ({data.totals.jobs})
              </h2>
              <StatusRow counts={data.jobStatus} />
            </section>
          </div>

          <section className="rounded-md border border-border bg-card p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <AlertTriangle className="size-4 text-destructive" />
              Recent job failures
            </h2>
            {data.failedJobs.length === 0 ? (
              <p className="text-xs text-muted-foreground">No failed jobs. </p>
            ) : (
              <ul className="space-y-2">
                {data.failedJobs.map((j) => (
                  <li key={j.id} className="rounded border border-border/60 p-2 text-xs">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono">
                        {j.symbol || "—"} {j.timeframe}
                      </span>
                      <span className="text-muted-foreground">
                        {new Date(j.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="mt-1 break-words text-muted-foreground">
                      {j.error ?? "No error message recorded."}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-md border border-border bg-card">
            <h2 className="border-b border-border p-4 text-sm font-semibold">Accounts</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="p-3 font-medium">User</th>
                    <th className="p-3 font-medium">Role</th>
                    <th className="p-3 font-medium text-right">Specs</th>
                    <th className="p-3 font-medium text-right">Data sets</th>
                    <th className="p-3 font-medium text-right">Runs</th>
                    <th className="p-3 font-medium">Joined</th>
                    <th className="p-3" />
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((u) => (
                    <tr key={u.id} className="border-b border-border/60 last:border-0">
                      <td className="p-3">
                        <span className="font-medium">{u.displayName ?? "—"}</span>
                        <span className="ml-2 font-mono text-[11px] text-muted-foreground">
                          {u.id.slice(0, 8)}
                        </span>
                      </td>
                      <td className="p-3">
                        <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                          {u.role}
                        </Badge>
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums">{u.strategies}</td>
                      <td className="p-3 text-right font-mono tabular-nums">{u.datasets}</td>
                      <td className="p-3 text-right font-mono tabular-nums">{u.runs}</td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {new Date(u.createdAt).toLocaleDateString()}
                      </td>
                      <td className="p-3 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={roleMutation.isPending || u.id === user?.id}
                          onClick={() =>
                            roleMutation.mutate({
                              userId: u.id,
                              role: u.role === "admin" ? "user" : "admin",
                            })
                          }
                        >
                          {u.role === "admin" ? "Revoke admin" : "Make admin"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="flex gap-3">
            <Button asChild variant="outline" size="sm">
              <Link to="/runs">Run history</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/datasets">Data sets</Link>
            </Button>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
