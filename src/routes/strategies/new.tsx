import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { resolveVideoSource } from "@/lib/video.functions";
import { suggestStrategyName } from "@/lib/naming.functions";
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
import { YOUTUBE_URL } from "@/lib/youtube-url";

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

type VideoInfo = {
  canonicalUrl: string;
  title: string;
  author: string;
  thumbnail: string;
  durationSeconds: number;
  transcript: string;
  transcriptLanguage: string;
};

function NewStrategy() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const fetchVideo = useServerFn(resolveVideoSource);
  const getSuggestedName = useServerFn(suggestStrategyName);
  const [name, setName] = useState("");
  const [sourceType, setSourceType] = useState<string>("video");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceContent, setSourceContent] = useState("");
  const [video, setVideo] = useState<VideoInfo | null>(null);
  const [fetching, setFetching] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  const manual = sourceType === "manual";
  const isVideo = sourceType === "video";

  const urlValid = YOUTUBE_URL.test(sourceUrl.trim());

  async function loadVideo() {
    const url = sourceUrl.trim();
    if (!url) {
      toast.error("Paste a YouTube link first.");
      return;
    }
    if (!YOUTUBE_URL.test(url)) {
      toast.error("That doesn't look like a valid YouTube link.");
      return;
    }
    setFetching(true);
    try {
      const info = (await fetchVideo({ data: { url } })) as VideoInfo;
      setVideo(info);
      setSourceUrl(info.canonicalUrl);
      if (info.title) setName((prev) => prev.trim() || info.title);
      if (info.transcript) {
        setSourceContent(info.transcript);
        toast.success("Video details and transcript pulled in.");
      } else {
        toast.warning(
          "Got the video details, but this video has no public captions — paste the transcript below.",
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not read that video link");
    } finally {
      setFetching(false);
    }
  }




  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!manual && sourceContent.trim().length < 40) {
      toast.error(
        isVideo
          ? "No transcript yet — fetch the video or paste its transcript."
          : "Paste at least a few sentences of source material.",
      );
      return;
    }
    const url = sourceUrl.trim();
    if (url && !/^https?:\/\/\S+\.\S+/i.test(url)) {
      toast.error("Source URL must start with http:// or https://");
      return;
    }
    setBusy(true);
    try {
      let finalName = name.trim();
      if (!finalName) {
        try {
          const suggested = (await getSuggestedName({
            data: { sourceUrl: url, sourceContent },
          })) as { name: string };
          finalName = suggested?.name?.trim() ?? "";
        } catch {
          finalName = "";
        }
      }

      const { data, error } = await supabase
        .from("strategies")
        .insert({
          user_id: user.id,
          name: finalName || "Untitled strategy",
          source_type: sourceType,
          source_url: url || null,
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
            <Label htmlFor="source-url" className="text-xs">
              {isVideo ? "Video link" : "Source URL (optional)"}
            </Label>
            <div className="flex gap-2">
              <Input
                id="source-url"
                type="url"
                value={sourceUrl}
                placeholder="https://www.youtube.com/watch?v=…"
                onChange={(e) => setSourceUrl(e.target.value)}
              />
              {isVideo && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void loadVideo()}
                  disabled={fetching || !urlValid}
                >
                  {fetching ? "Fetching transcript…" : "Fetch transcript"}
                </Button>
              )}
            </div>
            {isVideo && sourceUrl.trim() && !urlValid && (
              <p className="text-[11px] text-destructive">
                Enter a valid YouTube link (youtube.com/watch, /shorts, /live or youtu.be).
              </p>
            )}
            <p className="text-[11px] text-muted-foreground">
              {isVideo
                ? "We pull the title, channel and captions straight from the video."
                : "Paste the source link and we'll pull the real title and author into Metadata instead of guessing."}
            </p>
          </div>

          {isVideo && video && (
            <div className="flex gap-3 rounded-md border bg-muted/30 p-3">
              {video.thumbnail && (
                <img
                  src={video.thumbnail}
                  alt={`Thumbnail for ${video.title || "the source video"}`}
                  loading="lazy"
                  className="h-16 w-28 shrink-0 rounded object-cover"
                />
              )}
              <div className="min-w-0 text-xs">
                <p className="truncate font-medium">{video.title || "Untitled video"}</p>
                <p className="text-muted-foreground">{video.author || "Unknown channel"}</p>
                <p className="mt-1 text-muted-foreground">
                  {video.durationSeconds
                    ? `${Math.round(video.durationSeconds / 60)} min · `
                    : ""}
                  {video.transcript
                    ? `${video.transcript.length.toLocaleString()} characters of captions${
                        video.transcriptLanguage ? ` (${video.transcriptLanguage})` : ""
                      }`
                    : "No captions available"}
                </p>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="name" className="text-xs">
              Strategy name
            </Label>
            <Input
              id="name"
              value={name}
              placeholder="Leave blank to name it from the video or transcript"
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="source" className="text-xs">
              {manual ? "Notes (optional)" : isVideo ? "Transcript" : "Source material"}
            </Label>
            <Textarea
              id="source"
              rows={14}
              className="font-mono text-xs"
              value={sourceContent}
              placeholder={
                manual
                  ? "Optional notes. You'll fill the 17 sections yourself."
                  : isVideo
                    ? "Fetch the video above, or paste its transcript here…"
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
