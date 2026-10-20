// Turn the raw snapshots in data/ into web/history.js: only what the dashboard
// draws (today's lists, a few star histories, keyword series), precomputed here
// so the page size stays roughly constant no matter how many days are kept.
// The page can be opened straight from disk (file://) without a server.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const DATA_DIR = new URL("../data/", import.meta.url);
const OUT = new URL("../web/history.js", import.meta.url);
const WINDOW_DAYS = 90;
const TOP_RISING = 10;
const STAR_HISTORY_REPOS = 5;
const LIST_LIMIT = 10;
const KEYWORDS_PER_SOURCE = 15;
const ARXIV_CATEGORY_CHIPS = 8;

type Repo = { name: string; url: string; description: string; language: string | null; stars: number; forks: number; starsInPeriod: number };
type Snapshot = {
  date: string;
  collectedAt: string;
  errors?: Record<string, string>;
  hn?: { id: number; title: string; url: string | null; hnUrl: string; points: number; comments: number }[];
  github?: { daily?: Repo[]; weekly?: Repo[] };
  arxivCategories?: string[];
  arxiv?: { id: string; title: string; primaryCategory: string; absUrl?: string }[];
};

const dayDiff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

/** Weekly and daily trending merged by name (daily wins for overlapping fields). */
function reposOf(s: Snapshot): Map<string, Repo> {
  const m = new Map<string, Repo>();
  for (const r of [...(s.github?.weekly ?? []), ...(s.github?.daily ?? [])]) m.set(r.name, { ...m.get(r.name), ...r });
  return m;
}

const slimRepo = ({ name, url, description, language, stars }: Repo) => ({ name, url, description, language, stars });

// ---------- keywords ----------
const STOP = new Set(`a an the and or but of to in on at by for with from into over under as is are was were be been being it its this that these those
i you he she we they me my our your their his her them us not no yes do does did done can could will would should may might must shall
how what why when where who which whom than then there here so if about after before up down out off just only also more most very new
via using use used based your via vs etc all any some one two three first can't don't it's i'm show hn ask tell launch yc
towards toward through without within across between beyond while large models model learning approach method methods
framework study analysis paper towards data system systems task tasks via improving efficient
open source free tool tools make build built made get got like way ways now day days year years time video pdf audio`.split(/\s+/));
const SHORT_OK = new Set(["ai", "ml", "os", "ui", "go", "c", "r", "3d", "ux", "vr", "ar"]);

function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9][a-z0-9+#.]*[a-z0-9+#]|[a-z0-9]/g) ?? [])
    .filter((w) => !STOP.has(w) && !/^[\d.]+$/.test(w) && (w.length > 2 || SHORT_OK.has(w)));
}

const TEXTS: Record<string, (s: Snapshot) => string[]> = {
  hn: (s) => (s.hn ?? []).map((h) => h.title),
  github: (s) => [...reposOf(s).values()].map((r) => `${r.name.split("/")[1].replace(/[-_]/g, " ")} ${r.description ?? ""}`),
  arxiv: (s) => (s.arxiv ?? []).map((p) => p.title),
};

/** Today's most frequent words (≥2 items) with their daily series and 7-day comparison. */
function keywordRows(snaps: Snapshot[], textsOf: (s: Snapshot) => string[]) {
  // a word counts once per item (story / repo / paper)
  const counts = snaps.map((s) => {
    const m = new Map<string, number>();
    for (const t of textsOf(s)) for (const w of new Set(tokens(t))) m.set(w, (m.get(w) ?? 0) + 1);
    return m;
  });
  const today = counts.at(-1)!;
  const past = counts.slice(-8, -1);
  return [...today.entries()]
    .filter(([, n]) => n >= 2)
    .map(([w, n]) => ({
      w,
      n,
      avg: past.length ? +(past.reduce((a, m) => a + (m.get(w) ?? 0), 0) / past.length).toFixed(2) : null,
      isNew: past.length > 0 && past.every((m) => !m.has(w)),
      series: counts.map((m) => m.get(w) ?? 0),
    }))
    .sort((a, b) => b.n - a.n || a.w.localeCompare(b.w))
    .slice(0, KEYWORDS_PER_SOURCE);
}

/**
 * The page lists 10 papers for "all" and for each category chip, so send only
 * those (in original order) plus the per-category counts, not every title.
 */
function arxivForPage(papers: NonNullable<Snapshot["arxiv"]>) {
  const counts = new Map<string, number>();
  for (const p of papers) counts.set(p.primaryCategory, (counts.get(p.primaryCategory) ?? 0) + 1);
  const arxivCounts = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const chips = new Set(arxivCounts.slice(0, ARXIV_CATEGORY_CHIPS).map(([c]) => c));
  const shown = new Map<string, number>();
  const arxiv = papers.filter((p, i) => {
    const n = shown.get(p.primaryCategory) ?? 0;
    shown.set(p.primaryCategory, n + 1);
    return i < LIST_LIMIT || (chips.has(p.primaryCategory) && n < LIST_LIMIT);
  });
  return {
    arxivTotal: papers.length,
    arxivCounts: arxivCounts.slice(0, ARXIV_CATEGORY_CHIPS),
    arxiv: arxiv.map(({ id, title, primaryCategory }) => ({ id, title, primaryCategory })),
  };
}

export function summarize(snaps: Snapshot[]) {
  if (!snaps.length) return { version: 2, builtAt: new Date().toISOString(), dates: [] };
  const latest = snaps.at(-1)!;
  const prev = snaps.length > 1 ? snaps.at(-2)! : null;
  const dates = snaps.map((s) => s.date);

  const starHistory = new Map<string, [string, number][]>();
  for (const s of snaps) for (const [name, r] of reposOf(s)) {
    if (!starHistory.has(name)) starHistory.set(name, []);
    starHistory.get(name)!.push([s.date, r.stars]);
  }

  // Observed growth over the last 7 days when we have ≥2 sightings of the repo;
  // otherwise fall back to GitHub's own "stars this week".
  const latestRepos = reposOf(latest);
  const rising = [...latestRepos.values()]
    .map((r) => {
      const pts = starHistory.get(r.name)!.filter(([d]) => dayDiff(d, latest.date) <= 7);
      const [firstDate, firstStars] = pts[0];
      if (pts.length >= 2 && firstDate !== latest.date) {
        return { ...slimRepo(r), growth: r.stars - firstStars, basis: { since: firstDate, days: dayDiff(firstDate, latest.date) } };
      }
      const weekly = latest.github?.weekly?.find((w) => w.name === r.name);
      if (weekly) return { ...slimRepo(r), growth: weekly.starsInPeriod, basis: null };
      return null; // only in today's daily list and never seen before: no honest weekly number
    })
    .filter((r) => r !== null)
    .sort((a, b) => b.growth - a.growth)
    .slice(0, TOP_RISING);

  const seenBefore = new Set(snaps.slice(0, -1).flatMap((s) => [...reposOf(s).keys()]));
  const newRepos = [...latestRepos.values()].filter((r) => !seenBefore.has(r.name)).sort((a, b) => b.starsInPeriod - a.starsInPeriod);
  const goneRepos = prev ? [...reposOf(prev).values()].filter((r) => !latestRepos.has(r.name)) : [];

  return {
    version: 2,
    builtAt: new Date().toISOString(),
    dates,
    latest: {
      date: latest.date,
      collectedAt: latest.collectedAt,
      errors: latest.errors ?? {},
      hn: latest.hn ?? [],
      arxivCategories: latest.arxivCategories ?? ["cs.AI", "cs.LG", "cs.CL"],
      ...arxivForPage(latest.arxiv ?? []),
    },
    prev: prev ? { date: prev.date, hnIds: (prev.hn ?? []).map((h) => h.id) } : null,
    reposTracked: starHistory.size,
    rising,
    starHistory: Object.fromEntries(rising.slice(0, STAR_HISTORY_REPOS).map((r) => [r.name, starHistory.get(r.name)])),
    newRepos: { count: newRepos.length, items: newRepos.slice(0, LIST_LIMIT).map(slimRepo) },
    goneRepos: { count: goneRepos.length, items: goneRepos.slice(0, LIST_LIMIT).map(slimRepo) },
    keywords: Object.fromEntries(Object.entries(TEXTS).map(([src, fn]) => [src, keywordRows(snaps, fn)])),
  };
}

export async function build(): Promise<void> {
  const files = (await readdir(DATA_DIR))
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort()
    .slice(-WINDOW_DAYS);
  const snapshots: Snapshot[] = await Promise.all(
    files.map(async (f) => JSON.parse(await readFile(new URL(f, DATA_DIR), "utf8"))),
  );
  const out = `window.TREND_HISTORY = ${JSON.stringify(summarize(snapshots))};\n`;
  await writeFile(OUT, out);
  console.log(`Built web/history.js from ${snapshots.length} snapshot(s), ${(out.length / 1024).toFixed(1)} KB`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await build();
