# Snap-on Toolbox Tracker

Track the Snap-on tools in your box, what they're worth today, and what's next on your wishlist.
Prices and product photos update on their own from Snap-on's public online store.

**Live site:** https://iesofad-hue.github.io/snapon-toolbox/

Not affiliated with Snap-on.

## How it works

| Part | Where it lives | What it does |
| --- | --- | --- |
| Website | `index.html`, hosted free on GitHub Pages | The tracker people use. Sign in with Google to sync, or use it without an account (saved in that browser). |
| Database and photos | Supabase (free plan) | Everyone's toolboxes, one shared price list per part number, price history, and photos. Setup is in `supabase/schema.sql`. |
| Price checker | `checker/check.mjs`, run by GitHub Actions (`.github/workflows/check-prices.yml`) | Every 15 minutes it checks new or refresh-requested part numbers; once a day it re-checks every tracked part number. |

Each part number is checked once no matter how many people track it.

## Running the price checker by hand

GitHub → **Actions** → **Check Snap-on prices** → **Run workflow**. Pick `all` to re-check everything or `due` for only new and requested part numbers.

## Settings the checker needs

- Repository secret `SUPABASE_SECRET_KEY`: the Supabase project's **secret** key (`sb_secret_...`). Never put it in the code.

## If Snap-on blocks the checker

The checker loads product pages like a normal visitor, a few seconds apart. If Snap-on's bot protection blocks GitHub's servers, the run fails with a message saying so; it does not try to get around the block. The same script can run from your own computer instead:

```
cd checker
npm install
npx playwright install chromium
SUPABASE_URL=https://ctteljhhjsfvyyiwzxiy.supabase.co SUPABASE_SECRET_KEY=sb_secret_... MODE=all node check.mjs
```

## Keeping it running

- GitHub turns off scheduled workflows in a repository with no activity for 60 days. If that happens, GitHub emails you; re-enable it from the Actions tab.
- Supabase pauses free projects after a week with no activity. The price checker's daily run keeps it awake.
