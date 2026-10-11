# BoxTally

A Snap-on tool tracker at [boxtally.app](https://boxtally.app). Not affiliated with Snap-on.

Track the Snap-on tools in your box, what they're worth today, and what's next on your wishlist.

**Live site:** https://boxtally.app/

Not affiliated with Snap-on.

## How it works

| Part | Where it lives | What it does |
| --- | --- | --- |
| Website | `index.html`, hosted free on GitHub Pages | The tracker people use. Sign in with Google to sync, or use it without an account (saved in that browser). |
| Database and photos | Supabase (free plan) | Everyone's toolboxes, one shared price list per part number, price history, and people's own tool photos. Setup is in `supabase/schema.sql` plus the community-price function described below. |

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

### Store photos

Product photos load straight from Snap-on's public image server by part number. When a part number has no photo there, the card shows a placeholder, and people can always upload their own photo instead.

## The retired price checker

`checker/` and `.github/workflows/check-prices.yml` hold an automatic price checker that was tried first. Snap-on's store sends empty product data to automated browsers (from the cloud and from a home computer alike), and the checker was built not to get around that, so it's no longer used. The workflow only runs if started by hand. If you set it up on a Windows computer, double-click `checker\uninstall-windows.bat` to remove its scheduled tasks.

## Keeping it running

- Supabase pauses free projects after a week with no activity. `.github/workflows/keep-supabase-awake.yml` reads one row twice a week so that never happens, even when nobody opens the site. If it does get paused anyway, restore it from the Supabase dashboard; nothing is lost.
- GitHub turns off scheduled workflows in a repo that has had no commits for 60 days. If that happens, open the Actions tab, pick **Keep Supabase awake** and click **Enable workflow**.
- `robots.txt` and `sitemap.xml` help search engines find the site. When the site moves to its own domain, change the addresses in both files (and `og:url` / `og:image` in `index.html`).
