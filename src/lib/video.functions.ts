import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const VideoInput = z.object({ url: z.string().min(4) });

export const resolveVideoSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => VideoInput.parse(input))
  .handler(async ({ data }) => {
    const { fetchYouTubeVideoSource } = await import("./source-metadata.server");
    const video = await fetchYouTubeVideoSource(data.url);
    if (!video) throw new Error("That doesn't look like a YouTube video link.");
    return {
      canonicalUrl: video.canonicalUrl,
      title: video.title ?? "",
      author: video.author ?? "",
      thumbnail: video.thumbnail ?? "",
      durationSeconds: video.durationSeconds ?? 0,
      description: video.description ?? "",
      transcript: video.transcript ?? "",
      transcriptLanguage: video.transcriptLanguage ?? "",
    };
  });
