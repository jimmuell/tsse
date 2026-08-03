export type SourceMetadata = {
  url: string;
  provider: string;
  title?: string;
  author?: string;
  canonicalUrl?: string;
  thumbnail?: string;
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
