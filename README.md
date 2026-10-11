# Snap-on Toolbox Tracker

Track the Snap-on tools in your box, what they're worth today, and what's next on your wishlist.

**Live site:** https://iesofad-hue.github.io/snapon-toolbox/

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
- a price more than 4x higher or lower than the last one is rejected with a "double-check it" message
- at most 60 updates per person per hour
- every update is logged in `price_reports` (who, what, when) in case something needs undoing

### Export

**Download CSV** saves a spreadsheet of the box and wishlist (opens in Excel, Google Sheets or Numbers). **Print / PDF** prints a clean tool list with totals, or saves it as a PDF from the print dialog. Handy to keep for insurance in case of theft or a shop fire.

### Store photos

Product photos load straight from Snap-on's public image server by part number. When a part number has no photo there, the card shows a placeholder, and people can always upload their own photo instead.

## The retired price checker

`checker/` and `.github/workflows/check-prices.yml` hold an automatic price checker that was tried first. Snap-on's store sends empty product data to automated browsers (from the cloud and from a home computer alike), and the checker was built not to get around that, so it's no longer used. The workflow only runs if started by hand. If you set it up on a Windows computer, double-click `checker\uninstall-windows.bat` to remove its scheduled tasks.

## Keeping it running

- Supabase pauses free projects after a week with no activity. Normal use of the site (anyone opening it) counts as activity. If it does get paused, restore it from the Supabase dashboard; nothing is lost.
