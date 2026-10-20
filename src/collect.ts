// Take one snapshot of HN / GitHub Trending / arXiv using trendmcp's source
// modules, save it as data/YYYY-MM-DD.json, then rebuild the dashboard data.
// Run once a day (cron / systemd timer). Re-running on the same day overwrites.
import { mkdir, writeFile } from "node:fs/promises";
import { getStories } from "trendmcp/dist/sources/hackernews.js";
import { getTrending } from "trendmcp/dist/sources/github.js";
import { searchPapers } from "trendmcp/dist/sources/arxiv.js";
import { build } from "./build.ts";

const DATA_DIR = new URL("../data/", import.meta.url);
const ARXIV_CATEGORIES = ["cs.AI", "cs.LG", "cs.CL"];

const errors: Record<string, string> = {};

/** Run one source; on failure record the error and keep going with an empty result. */
async function attempt<T>(name: string, fn: () => Promise<T[]>): Promise<T[]> {
  try {
    return await fn();
  } catch (err) {
    errors[name] = err instanceof Error ? err.message : String(err);
    console.error(`[${name}] ${errors[name]}`);
    return [];
  }
}

const now = new Date();
// Local calendar date, so a snapshot taken at 08:00 KST is filed under that day.
const date = now.toLocaleDateString("sv-SE");

const [hn, ghDaily, ghWeekly, arxiv] = await Promise.all([
  attempt("hackernews", () => getStories("top", 30)),
  attempt("github-daily", () => getTrending({ since: "daily", limit: 25 })),
  attempt("github-weekly", () => getTrending({ since: "weekly", limit: 25 })),
  attempt("arxiv", () => searchPapers({ categories: ARXIV_CATEGORIES, sort: "submitted", limit: 40 })),
]);

const snapshot = {
  date,
  collectedAt: now.toISOString(),
  errors,
  hn: hn.map(({ id, title, url, hnUrl, points, comments }: any) => ({ id, title, url, hnUrl, points, comments })),
  github: { daily: ghDaily, weekly: ghWeekly },
  arxiv: arxiv.map(({ id, title, absUrl, primaryCategory }: any) => ({ id, title, absUrl, primaryCategory })),
};

await mkdir(DATA_DIR, { recursive: true });
await writeFile(new URL(`${date}.json`, DATA_DIR), JSON.stringify(snapshot, null, 2) + "\n");
console.log(
  `Saved data/${date}.json — HN ${hn.length}, GitHub ${ghDaily.length}+${ghWeekly.length}, arXiv ${arxiv.length}` +
    (Object.keys(errors).length ? ` (errors: ${Object.keys(errors).join(", ")})` : ""),
);

await build();
