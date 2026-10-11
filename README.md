# BoxTally

A tracker for Snap-on® tools at [boxtally.app](https://boxtally.app). Not affiliated with Snap-on.

Track the Snap-on tools in your box, what they're worth today, and what's next on your wishlist.

**Live site:** https://boxtally.app/

Not affiliated with Snap-on.

## How it works

| Part | Where it lives | What it does |
| --- | --- | --- |
| Website | `index.html`, hosted free on GitHub Pages | The tracker people use. Sign in with Google to sync, or use it without an account (saved in that browser). |
| Database and photos | Supabase (free plan) | Everyone's toolboxes, one shared price list per part number, price history, people's own tool photos, share links and email settings. Setup is in `supabase/schema.sql`. |

### Store prices come from the community

Snap-on's online store withholds product details from automated tools, so the site doesn't fetch prices on its own. Instead, anyone signed in who tracks a part number can check the price on Snap-on's store and tap **Add store price** / **Update price** on the card. The price is saved once per part number, so everyone tracking that tool gets it, and it builds the price history and the price-drop alerts.

Safeguards in the `submit_price` database function:
- only signed-in people, and only for part numbers in their own box or wishlist
- one update per person per part number per day; a typo can be fixed within 10 minutes
- a new price has to be within 4x of the current price. So one person can't walk a price up or down in steps, and a typo fix is judged against the price from before their own update. Anyone can undo a bad update: a price within 4x of the one before it is always accepted
- at most 60 updates per person per hour
- every update is logged in `price_reports` (who, what, when, and the price before it) in case something needs undoing

### Limits per account

Each account can hold up to 2,000 tools (box and wishlist together) and 300 uploaded photos of up to 3 MB each. The site shrinks photos well under that before uploading. The limits keep one account from filling the free Supabase plan.

### Export

**Download CSV** saves a spreadsheet of the box and wishlist (opens in Excel, Google Sheets or Numbers). **Print / PDF** prints a clean tool list with totals, or saves it as a PDF from the print dialog. Handy to keep for insurance in case of theft or a shop fire.

### Photos

The site never loads, copies or hotlinks Snap-on's product photos (Snap-on limits its images to press use).

- **Drawings for everyone.** Every tool shows one of BoxTally's own drawings (ratchet, socket, wrench, torque wrench, screwdriver, pliers, tool chest and so on). The drawing is picked from the tool's name first, then its category, then its part number (for example `F80` → 3/8" ratchet, `OEXM710B` → wrench, `TECH3FR250` → torque wrench). Within a kind of tool the drawing shows which one it is: standard, long, stubby or flex-head ratchets; 6-point, 12-point, deep, impact, swivel or bit sockets; combination, ratcheting, flare-nut, box-end, open-end or adjustable wrenches; slip-joint, needle-nose, diagonal, locking, water-pump or snap-ring pliers; hook, straight, 45° or complex picks; flat, Phillips, Torx, stubby or ratcheting screwdrivers. Power tools are split into cordless impacts (3/8", stubby, 1/2" high-torque), impact drivers, drill/drivers, cordless and air ratchets, air impacts, air hammers, die and angle grinders, batteries and chargers. Ratchets also come in hard-handle, round-head, thumbwheel and long flex-head; and there are drawings for extensions, breaker bars, U-joints, adapters, speed handles, hex keys, nut drivers, crowfoot wrenches, test lights, multimeters, pickup tools, service carts and top chests. Each card's label names the kind. The drawings live in `ART` in `index.html`; the matching rules are `ART_WORDS`, `ART_PN`, `VARIANT_WORDS` and `VARIANT_PN`.
- **Your photos are yours only.** A photo you upload replaces the drawing on your own cards. Nobody else sees it.
- The older shared-photo pieces in `supabase/schema.sql` (`photo_shared`, `shared_photos`, `report_photo`) are no longer used by the site.

### Everyday features

- **Sample box.** A first-time visitor with an empty box can tap **See a sample box** to look around a pretend toolbox (with a truck account and lent-out tools). It lives in memory only and is never saved; **Start my own box** clears it.
- **Undo.** Deleting a tool is instant, with an **Undo** button for a few seconds. A deleted tool's photo file is only removed once the Undo has passed.
- **Add several at once.** Paste a list of part numbers (one per line, or separated by spaces or commas) into the add box. Up to 200 at a time; ones already on the list are skipped.
- **Drawers view.** Groups your tools by "Where it's kept", with the count and worth of each drawer. The location field suggests drawer names you've already used.
- **Lent out.** **Lend** on a tool records who has it and since when; **Got it back** clears it. A "Who has my stuff" panel lists everything that's out, and you can sort by "Lent out first".
- **Truck account.** Balance owed, weekly payment and payoff date in the header. **Made a payment** logs one week's payment (with Undo), and **Bought it** on a wishlist tool can add it to the balance. Saved with your sign-in (in Supabase Auth's user data), or in the browser when you're not signed in.
- **Share my box.** Signed-in people can make a read-only link (`boxtally.app/?box=…`) with an optional title, and choose whether it shows prices paid and the wishlist. It never shows photos, notes, locations, who has a tool, or the owner's name or email. Turning the link off kills it; turning it back on makes a new one. Stored in `box_shares`, read through the `shared_box` function.
- **Install as an app.** `manifest.webmanifest`, `icons/` and `sw.js` let phones and computers install BoxTally. The page, fonts and icons work offline, and a signed-in box is kept in the browser so it still shows (read-only) with no connection. When you change `index.html` in a way an old copy shouldn't survive, bump `VERSION` in `sw.js`.

### Price-drop emails

`checker/alerts.mjs` runs once a day from `.github/workflows/price-alerts.yml`. For everyone who ticked **Email me when something on my wishlist drops** (stored in `alert_prefs`; the address always comes from the person's own Google sign-in), it emails any store-price drops on their wishlist since the last email.

To switch it on:
1. Make an app password for the Gmail account that will send the emails (Google Account → Security → 2-Step Verification → App passwords).
2. In the GitHub repo, go to **Settings → Secrets and variables → Actions** and add: `SMTP_HOST` = `smtp.gmail.com`, `SMTP_PORT` = `465`, `SMTP_USER` = that Gmail address, `SMTP_PASS` = the app password. Optional: `ALERT_FROM`, e.g. `BoxTally <yourname@gmail.com>`. The workflow also needs `SUPABASE_SECRET_KEY` (the same secret the price checker uses).
3. Run **Price-drop emails** from the Actions tab with "Only print what would be sent" ticked to check it.
4. Set `EMAIL_ALERTS_READY = true` in `index.html` so the checkbox appears under Price watch.

### Trademarks

BoxTally names Snap-on only to say which tools it tracks. It doesn't use Snap-on's logo, wordmark or fonts, and the tool drawings are BoxTally's own. The footer and privacy page say it's independent, with the Snap-on® trademark notice.

## The retired price checker

`checker/` and `.github/workflows/check-prices.yml` hold an automatic price checker that was tried first. Snap-on's store sends empty product data to automated browsers (from the cloud and from a home computer alike), and the checker was built not to get around that, so it's no longer used. The workflow only runs if started by hand. If you set it up on a Windows computer, double-click `checker\uninstall-windows.bat` to remove its scheduled tasks.

## Keeping it running

- Supabase pauses free projects after a week with no activity. `.github/workflows/keep-supabase-awake.yml` reads one row twice a week so that never happens, even when nobody opens the site. If it does get paused anyway, restore it from the Supabase dashboard; nothing is lost.
- GitHub turns off scheduled workflows in a repo that has had no commits for 60 days. If that happens, open the Actions tab, pick **Keep Supabase awake** and click **Enable workflow**.
- `robots.txt` and `sitemap.xml` help search engines find the site. When the site moves to its own domain, change the addresses in both files (and `og:url` / `og:image` in `index.html`).
