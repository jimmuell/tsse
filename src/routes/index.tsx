import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileCode2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Trading Strategy Specification Engine" },
      {
        name: "description",
        content:
          "Turn trading ideas from videos, PDFs and code into deterministic, machine-readable strategy specifications across 17 standardized sections.",
      },
      { property: "og:title", content: "Trading Strategy Specification Engine" },
      {
        property: "og:description",
        content:
          "Convert subjective trading ideas into unambiguous specs any developer can implement without the original source.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  const { data: strategies, isLoading } = useQuery({
    queryKey: ["strategies", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("strategies")
        .select("id, name, source_type, status, scores, updated_at")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from("strategies").delete().eq("id", pendingDelete.id);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["strategies", user?.id] });
      toast.success("Specification deleted");
      setPendingDelete(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete strategy");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AppShell email={user?.email ?? null}>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Strategy specifications</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every spec is scored for completeness, determinism and ambiguity before it can be exported.
        </p>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-36 rounded-md" />
          ))}
        </div>
      ) : !strategies || strategies.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-card px-6 py-16 text-center">
          <FileCode2 className="mx-auto size-8 text-muted-foreground" />
          <h2 className="mt-4 text-sm font-semibold">No specifications yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
            Paste a transcript, article, or indicator code and the engine will draft a 17-section
            specification, then ask you about anything it could not determine.
          </p>
          <Button asChild className="mt-5 gap-1.5">
            <Link to="/strategies/new">
              <Plus className="size-4" />
              Create your first strategy
            </Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {strategies.map((s) => {
            const scores = (s.scores ?? {}) as Record<string, number>;
            return (
              <div key={s.id} className="relative">
                <Link
                  to="/strategies/$id"
                  params={{ id: s.id }}
                  className="group block rounded-md border border-border bg-card p-4 transition-colors hover:border-primary/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-sm font-semibold leading-snug group-hover:text-primary">
                      {s.name}
                    </h2>
                    <Badge
                      variant="outline"
                      className="mr-8 shrink-0 font-mono text-[10px] uppercase"
                    >
                      {s.status}
                    </Badge>
                  </div>
                  <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                    {s.source_type}
                  </p>
                  <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3">
                    {[
                      ["Complete", scores['completeness']],
                      ["Determin.", scores['determinism']],
                      ["Ambiguity", scores['ambiguity']],
                    ].map(([label, value]) => (
                      <div key={label as string}>
                        <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          {label}
                        </dt>
                        <dd className="font-mono text-sm font-semibold tabular-nums">
                          {typeof value === "number" ? `${Math.round(value)}%` : "—"}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${s.name}`}
                  className="absolute right-2 top-2 size-7 text-muted-foreground hover:text-destructive"
                  onClick={() => setPendingDelete({ id: s.id, name: s.name })}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this specification?</AlertDialogTitle>
            <AlertDialogDescription>
              “{pendingDelete?.name}” and its clarifying questions will be permanently removed. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );

}
