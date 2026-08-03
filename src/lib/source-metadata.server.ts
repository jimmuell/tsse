export type SourceMetadata = {
  url: string;
  provider: string;
  title?: string | undefined;
  author?: string | undefined;
  canonicalUrl?: string | undefined;
  thumbnail?: string | undefined;
};


export function parseYouTubeId(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  const isYouTube =
    host === "youtube.com" ||
    host === "m.youtube.com" ||
    host === "music.youtube.com" ||
    host === "youtu.be";
  if (!isYouTube) return null;

  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    return id && /^[\w-]{6,}$/.test(id) ? id : null;
  }

  const v = url.searchParams.get("v");
  if (v && /^[\w-]{6,}$/.test(v)) return v;

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length >= 2 && ["shorts", "embed", "v", "live"].includes(parts[0]!)) {
    const id = parts[1]!;
    return /^[\w-]{6,}$/.test(id) ? id : null;
  }
  return null;
}

/** Resolve public metadata for a source URL. Never throws — returns null on failure. */
export async function resolveSourceMetadata(
  rawUrl: string | null | undefined,
): Promise<SourceMetadata | null> {
  const url = (rawUrl ?? "").trim();
  if (!url) return null;

  const videoId = parseYouTubeId(url);
  if (!videoId) {
    let host = "";
    try {
      host = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return null;
    }
    return { url, provider: host, canonicalUrl: url };
  }

  const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(canonicalUrl)}&format=json`,
      { headers: { accept: "application/json" } },
    );
    if (!res.ok) return { url, provider: "YouTube", canonicalUrl };
    const json = (await res.json()) as {
      title?: string;
      author_name?: string;
      thumbnail_url?: string;
    };
    return {
      url,
      provider: "YouTube",
      canonicalUrl,
      title: json.title,
      author: json.author_name,
      thumbnail: json.thumbnail_url,
    };
  } catch {
    return { url, provider: "YouTube", canonicalUrl };
  }
}

const YT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const YT_INNERTUBE_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";

export type VideoSource = {
  videoId: string;
  canonicalUrl: string;
  title?: string | undefined;
  author?: string | undefined;
  thumbnail?: string | undefined;
  durationSeconds?: number | undefined;
  description?: string | undefined;
  transcript?: string | undefined;
  transcriptLanguage?: string | undefined;
};

function decodeEntities(input: string): string {
  return input
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function parseTimedText(body: string): string {
  const lines: string[] = [];
  const regex = /<p\b[^>]*>([\s\S]*?)<\/p>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(body))) {
    const text = decodeEntities(
      (match[1] ?? "")
        .replace(/<s\b[^>]*>/g, "")
        .replace(/<\/s>/g, "")
        .replace(/<[^>]+>/g, " "),
    )
      .replace(/\s+/g, " ")
      .trim();
    if (text && text !== "[♪♪♪]") lines.push(text);
  }
  return lines.join(" ").replace(/\s+/g, " ").trim();
}

/** Fetch title, author and (when available) the caption transcript for a YouTube URL. */
export async function fetchYouTubeVideoSource(rawUrl: string): Promise<VideoSource | null> {
  const videoId = parseYouTubeId(rawUrl);
  if (!videoId) return null;
  const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;

  let details:
    | {
        title?: string;
        author?: string;
        lengthSeconds?: string;
        shortDescription?: string;
        thumbnail?: { thumbnails?: { url?: string }[] };
      }
    | undefined;
  let tracks: { baseUrl?: string; languageCode?: string; kind?: string }[] = [];

  try {
    const res = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${YT_INNERTUBE_KEY}`, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": YT_UA },
      body: JSON.stringify({
        videoId,
        context: { client: { clientName: "ANDROID", clientVersion: "20.10.38", hl: "en" } },
      }),
    });
    if (res.ok) {
      const json = (await res.json()) as {
        videoDetails?: typeof details;
        captions?: {
          playerCaptionsTracklistRenderer?: { captionTracks?: typeof tracks };
        };
      };
      details = json.videoDetails;
      tracks = json.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
    }
  } catch {
    // fall through to oEmbed
  }

  let transcript: string | undefined;
  let transcriptLanguage: string | undefined;
  const track =
    tracks.find((t) => t.languageCode?.startsWith("en") && t.kind !== "asr") ??
    tracks.find((t) => t.languageCode?.startsWith("en")) ??
    tracks[0];
  if (track?.baseUrl) {
    try {
      const res = await fetch(`${track.baseUrl}&fmt=srv3`, { headers: { "user-agent": YT_UA } });
      if (res.ok) {
        const parsed = parseTimedText(await res.text());
        if (parsed.length > 40) {
          transcript = parsed;
          transcriptLanguage = track.languageCode;
        }
      }
    } catch {
      // transcript stays undefined
    }
  }

  let title = details?.title;
  let author = details?.author;
  let thumbnail = details?.thumbnail?.thumbnails?.at(-1)?.url;
  if (!title || !author) {
    const meta = await resolveSourceMetadata(canonicalUrl);
    title = title || meta?.title;
    author = author || meta?.author;
    thumbnail = thumbnail || meta?.thumbnail;
  }

  const duration = Number(details?.lengthSeconds ?? "");

  return {
    videoId,
    canonicalUrl,
    title,
    author,
    thumbnail,
    durationSeconds: Number.isFinite(duration) && duration > 0 ? duration : undefined,
    description: details?.shortDescription,
    transcript,
    transcriptLanguage,
  };
}
