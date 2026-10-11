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
| Price checker | `checker/check.mjs`, run on a home Windows computer by two scheduled tasks | Every 30 minutes it checks new or refresh-requested part numbers; once a day it re-checks every tracked part number. |

Each part number is checked once no matter how many people track it.

## Setting up the price checker on a Windows computer

Snap-on's store doesn't show product details to cloud servers, so the checker runs from a home computer.

1. Install Node.js (LTS) from https://nodejs.org and restart.
2. Download this repository (Code > Download ZIP) and unzip it somewhere permanent, like Documents.
3. Double-click `checker\setup-windows.bat`. It installs the checker, asks for the Supabase **secret** key (saved only in `checker\.env` on that computer), tests the connection, and adds two scheduled tasks:
   - **Snap-on Toolbox - new part numbers**: every 30 minutes, only does work when something is waiting.
   - **Snap-on Toolbox - daily prices**: once a day, re-checks every part number.
4. History is written to `checker\checker.log`. To stop it, double-click `checker\uninstall-windows.bat`.

Prices only update while that computer is on; they catch up when it's back.

The checker loads product pages like a normal visitor, a few seconds apart. If Snap-on's site blocks it, the run stops with a message saying so; it does not try to get around the block.

## Running it by hand

From the `checker` folder: `node check.mjs --mode=all` (everything) or `node check.mjs --mode=due` (only new and requested part numbers).

## Keeping it running

- Supabase pauses free projects after a week with no activity. The price checker's daily run keeps it awake, as long as the checker's computer is on at least once a week.
