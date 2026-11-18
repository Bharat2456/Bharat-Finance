// Minimal RSS/Atom item reader that works in browsers and Node (no DOM needed).
const unxml = (s) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');
const tag = (b, t) => { const m = b.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)); return m ? unxml(m[1]).trim() : ''; };
export function parseFeed(xml) {
  const items = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>|<entry\b[^>]*>([\s\S]*?)<\/entry>/g)].map((m) => m[1] || m[2]);
  return items.map((b) => { const link = tag(b, 'link') || (b.match(/<link[^>]*href="([^"]+)"/) || [])[1] || ''; const d = tag(b, 'pubDate') || tag(b, 'updated') || tag(b, 'published'); return { title: tag(b, 'title'), link, description: tag(b, 'description').replace(/<[^>]+>/g, '').slice(0, 300), time: d ? Date.parse(d) : null }; })
    .filter((i) => i.title).sort((a, b) => (b.time || 0) - (a.time || 0));
}
const TAGS = { earnings: /earnings|results|revenue|guidance|eps|quarter/i, deal: /merger|acqui|deal|buyout|takeover/i, analyst: /upgrade|downgrade|price target|analyst/i, legal: /lawsuit|sec |probe|investigation|fine|recall/i };
export const tagItem = (i) => Object.entries(TAGS).filter(([, r]) => r.test(i.title + ' ' + i.description)).map(([k]) => k);
