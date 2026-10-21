/** Links in chat messages: YouTube (and Shorts), TikTok and Instagram Reels play right in the chat. */

export type LinkInfo =
  | { kind: "youtube"; url: string; id: string; vertical: boolean }
  | { kind: "tiktok"; url: string; id: string }
  | { kind: "instagram"; url: string; id: string }
  | { kind: "web"; url: string; host: string };

const URL_RE = /https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/gi;

/** Every link in a text, in order. */
export function findLinks(text: string | null | undefined): string[] {
  return text ? [...text.matchAll(URL_RE)].map((match) => match[0]) : [];
}

export function linkInfo(url: string): LinkInfo {
  const youtube = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/i.exec(url);
  if (youtube) return { kind: "youtube", url, id: youtube[1]!, vertical: /\/shorts\//i.test(url) };
  const tiktok = /tiktok\.com\/@[\w.-]+\/video\/(\d+)/i.exec(url);
  if (tiktok) return { kind: "tiktok", url, id: tiktok[1]! };
  const instagram = /instagram\.com\/(?:reel|reels|p)\/([\w-]+)/i.exec(url);
  if (instagram) return { kind: "instagram", url, id: instagram[1]! };
  let host = url;
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    /* keep the raw link */
  }
  return { kind: "web", url, host };
}

/** The first link that can be shown as a video card, or any first link. */
export function mainLink(text: string | null | undefined): LinkInfo | null {
  const links = findLinks(text).map(linkInfo);
  return links.find((link) => link.kind !== "web") ?? links[0] ?? null;
}

export function embedUrl(link: LinkInfo): string | null {
  if (link.kind === "youtube") return `https://www.youtube.com/embed/${link.id}?autoplay=1&playsinline=1&rel=0`;
  if (link.kind === "tiktok") return `https://www.tiktok.com/embed/v2/${link.id}`;
  if (link.kind === "instagram") return `https://www.instagram.com/reel/${link.id}/embed`;
  return null;
}
