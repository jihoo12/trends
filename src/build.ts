// Bundle the most recent snapshots into web/history.js so web/index.html can be
// opened straight from disk (file://) without a server.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const DATA_DIR = new URL("../data/", import.meta.url);
const OUT = new URL("../web/history.js", import.meta.url);
const WINDOW_DAYS = 90;

export async function build(): Promise<void> {
  const files = (await readdir(DATA_DIR))
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort()
    .slice(-WINDOW_DAYS);
  const snapshots = await Promise.all(
    files.map(async (f) => JSON.parse(await readFile(new URL(f, DATA_DIR), "utf8"))),
  );
  await writeFile(OUT, `window.TREND_HISTORY = ${JSON.stringify({ builtAt: new Date().toISOString(), snapshots })};\n`);
  console.log(`Built web/history.js from ${snapshots.length} snapshot(s)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await build();
