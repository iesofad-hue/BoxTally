// BoxTally share-link previews (a Cloudflare Worker).
// GitHub Pages sends the same page for every address, so a pasted share link (boxtally.app/?box=...) used to
// preview as plain "BoxTally". When a link-preview bot (Facebook, iMessage, Discord, Reddit, Slack...) asks for a
// share link, this fills in that box's title and tool count instead. Everyone else gets the page untouched.
// It only reads what the share link already shows (shared_box): the title the owner typed and how many tools.
// Never names, emails, photos, notes or prices.
// Setup steps are in README.md under "Share-link previews".
const SB_URL = "https://ctteljhhjsfvyyiwzxiy.supabase.co";
const SB_KEY = "sb_publishable_y4-sxz8INJZu3fU6xIwWLw_9krKIQJb"; // the public key the site itself uses
const BOTS = /facebookexternalhit|facebot|twitterbot|slackbot|discordbot|whatsapp|telegrambot|linkedinbot|redditbot|applebot|skypeuripreview|pinterest|embedly|iframely|vkshare|googlebot|bingbot|snapchat|bot\b/i;

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const token = url.searchParams.get("box") || "";
    const page = await fetch(request);
    if (request.method !== "GET" || url.pathname !== "/" || !/^[A-Za-z0-9_-]{20}$/.test(token) || !BOTS.test(request.headers.get("user-agent") || "")) return page;
    if (!(page.headers.get("content-type") || "").includes("text/html")) return page;
    let box = null;
    try {
      const r = await fetch(`${SB_URL}/rest/v1/rpc/shared_box`, {
        method: "POST",
        headers: { apikey: SB_KEY, "content-type": "application/json" },
        body: JSON.stringify({ t: token }),
        cf: { cacheTtl: 300 },
      });
      if (r.ok) box = await r.json();
    } catch {}
    if (!box) return page;
    const items = box.items || [];
    const count = (list) => items.filter((i) => i.list === list).reduce((n, i) => n + (Number(i.qty) || 1), 0);
    const owned = count("owned"), wish = count("wishlist");
    const name = String(box.title || "").trim().slice(0, 60) || "A shared toolbox";
    const title = `${name} · ${owned} tool${owned === 1 ? "" : "s"} · BoxTally`;
    const desc = `${owned} Snap-on tool${owned === 1 ? "" : "s"} in the box${wish ? `, ${wish} on the wishlist` : ""}. Tap to look inside, then track your own box free.`;
    const set = (v) => ({ element(el) { el.setAttribute("content", v); } });
    return new HTMLRewriter()
      .on("title", { element(el) { el.setInnerContent(title); } })
      .on('meta[property="og:title"]', set(title))
      .on('meta[property="og:description"]', set(desc))
      .on('meta[name="description"]', set(desc))
      .on('meta[property="og:url"]', set(`https://boxtally.app/?box=${token}`))
      .transform(page);
  },
};
