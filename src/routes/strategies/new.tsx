import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { SOURCE_TYPES, emptyDefinition } from "@/lib/strategy-schema";

export const Route = createFileRoute("/strategies/new")({
  head: () => ({
    meta: [
      { title: "New strategy specification — TSSE" },
      {
        name: "description",
        content:
          "Paste a transcript, article or indicator code and generate a deterministic 17-section trading strategy specification.",
      },
      { property: "og:title", content: "New strategy specification — TSSE" },
      {
        property: "og:description",
        content: "Start a new deterministic trading strategy specification from raw source material.",
      },
    ],
  }),
  component: NewStrategy,
});

function NewStrategy() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [sourceType, setSourceType] = useState<string>("manual");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceContent, setSourceContent] = useState("");
  const [busy, setBusy] = useState(false);


  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  const manual = sourceType === "manual";

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!manual && sourceContent.trim().length < 40) {
      toast.error("Paste at least a few sentences of source material.");
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase
        .from("strategies")
        .insert({
          user_id: user.id,
          name: name.trim() || "Untitled strategy",
          source_type: sourceType,
          source_content: sourceContent,
          definition: emptyDefinition() as never,
          status: manual ? "draft" : "extracting",
        })
        .select("id")
        .single();
      if (error) throw error;
      navigate({
        to: "/strategies/$id",
        params: { id: data.id },
        search: manual ? {} : { extract: true },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create strategy");
      setBusy(false);
    }
  }

  return (
    <AppShell email={user?.email ?? null}>
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight">New strategy</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Give the engine everything you have. Anything missing becomes a clarifying question rather
          than a silent assumption.
        </p>

        <form onSubmit={create} className="mt-8 space-y-6">
          <div className="space-y-1.5">
            <Label htmlFor="name" className="text-xs">
              Strategy name
            </Label>
            <Input
              id="name"
              value={name}
              placeholder="e.g. London ORB continuation"
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Source type</Label>
            <Select value={sourceType} onValueChange={setSourceType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="source" className="text-xs">
              {manual ? "Notes (optional)" : "Source material"}
            </Label>
            <Textarea
              id="source"
              rows={14}
              className="font-mono text-xs"
              value={sourceContent}
              placeholder={
                manual
                  ? "Optional notes. You'll fill the 17 sections yourself."
                  : "Paste the transcript, article, forum post or indicator code here…"
              }
              onChange={(e) => setSourceContent(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              {sourceContent.trim().length.toLocaleString()} characters
            </p>
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? "Creating…" : manual ? "Create draft" : "Create and extract"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => navigate({ to: "/" })}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
