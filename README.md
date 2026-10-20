# trends

[한국어](README.ko.md)

Daily snapshots of Hacker News, GitHub Trending and arXiv, with a dashboard that shows **how they change over time**.
It reuses the source modules from [trendmcp](https://github.com/jihoo12/trendmcp): trendmcp tells you what's trending *right now*; this tells you what changed since yesterday.

**Dashboard:** https://jihoo12.github.io/trends/

## Dashboard

- **Top 10 rising repos**: stars gained over the last 7 days, as observed in our own snapshots. Repos without enough history fall back to GitHub's weekly number
- **Star history**: small multiples for the top 5 rising repos, each on its own scale
- **Keyword trends**: word frequency in HN titles, GitHub descriptions and arXiv titles, compared with the 7-day average
- **New / dropped repos**: compared with the previous snapshot
- **Today's top HN stories**

Anything trend-related needs at least two days of snapshots.

## How it works

`.github/workflows/collect.yml` runs every day at 09:00 KST (00:00 UTC):

1. `npm run collect` saves a snapshot to `data/YYYY-MM-DD.json` (dates are in KST; re-running on the same day overwrites that day's file)
2. The new snapshot is committed to `main`
3. `npm run build` bundles the last 90 days into `web/history.js`, and `web/` is deployed to GitHub Pages

You can also trigger it manually with **Run workflow** in the Actions tab. Pushing changes under `web/` or `src/` redeploys the page without taking a new snapshot.
GitHub's scheduled runs can start a few minutes to tens of minutes late.

## Running locally

Requires Node.js 23.6+ (runs `.ts` files directly, no build step).

```bash
npm install
npm run build        # data/ -> web/history.js
npm run collect      # optional: take a snapshot now
xdg-open web/index.html
```

`web/history.js` is not committed, so run `npm run build` again after `git pull`.
