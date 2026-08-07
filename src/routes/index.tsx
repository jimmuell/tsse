import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileCode2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { SPEC_SECTIONS } from "@/lib/strategy-schema";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Trading Strategy Specification Engine" },
      {
        name: "description",
        content: `Turn trading ideas from videos, PDFs and code into deterministic, machine-readable strategy specifications across ${SPEC_SECTIONS.length} standardized sections.`,
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
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
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

  const ids = useMemo(() => (strategies ?? []).map((s) => s.id), [strategies]);
  const allSelected = ids.length > 0 && selected.length === ids.length;

  // Drop selections for rows that no longer exist.
  useEffect(() => {
    setSelected((prev) => prev.filter((id) => ids.includes(id)));
  }, [ids]);

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function confirmDelete() {
    if (selected.length === 0) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from("strategies").delete().in("id", selected);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["strategies", user?.id] });
      toast.success(
        selected.length === 1
          ? "Specification deleted"
          : `${selected.length} specifications deleted`,
      );
      setSelected([]);
      setConfirmOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete strategies");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AppShell email={user?.email ?? null}>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Strategy specifications</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every spec is scored for completeness, determinism and ambiguity before it can be
            exported.
          </p>
        </div>
        {ids.length > 0 && (
          <div className="flex items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <Checkbox
                checked={allSelected}
                onCheckedChange={(v) => setSelected(v === true ? ids : [])}
                aria-label="Select all specifications"
              />
              Select all
            </label>
            <Button
              variant="destructive"
              size="sm"
              className="gap-1.5"
              disabled={selected.length === 0}
              onClick={() => setConfirmOpen(true)}
            >
              <Trash2 className="size-3.5" />
              Delete{selected.length > 0 ? ` (${selected.length})` : ""}
            </Button>
          </div>
        )}
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
            Paste a transcript, article, or indicator code and the engine will draft a {SPEC_SECTIONS.length}-section
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
            const isSelected = selected.includes(s.id);
            return (
              <div key={s.id} className="relative">
                <Link
                  to="/strategies/$id"
                  params={{ id: s.id }}
                  className={`group block rounded-md border bg-card p-4 transition-colors hover:border-primary/40 ${
                    isSelected ? "border-primary ring-1 ring-primary/30" : "border-border"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="ml-7 text-sm font-semibold leading-snug group-hover:text-primary">
                      {s.name}
                    </h2>
                    <Badge
                      variant="outline"
                      className="mr-8 shrink-0 font-mono text-[10px] uppercase"
                    >
                      {s.status}
                    </Badge>
                  </div>
                  <p className="ml-7 mt-1 font-mono text-[11px] text-muted-foreground">
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
                <div className="absolute left-4 top-4">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggle(s.id)}
                    aria-label={`Select ${s.name}`}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${s.name}`}
                  className="absolute right-2 top-2 size-7 text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    setSelected([s.id]);
                    setConfirmOpen(true);
                  }}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!open) setConfirmOpen(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {selected.length > 1
                ? `Delete ${selected.length} specifications?`
                : "Delete this specification?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              The selected specification{selected.length > 1 ? "s" : ""} and their clarifying
              questions will be permanently removed. This cannot be undone.
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

