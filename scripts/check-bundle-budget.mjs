// Deterministic per-route "First Load JS" budget gate for CI.
//
// Reads Next's app-build-manifest, sums the GZIPPED size of each route's client
// chunks — which matches `next build`'s reported First Load JS (Next 15 reports
// gzip sizes) — and exits non-zero if any route exceeds its budget in
// bundle-budget.json. This is the deterministic hard gate; render-time metrics
// (Lighthouse) and real-user data (Vercel Speed Insights) live outside CI.
//
// Rationale + full decision record: software-craft vault handoff
// wiki/handoffs/coding-handoffs/2026-07-15-sihha-perf-gate-and-test-audit.md
import { gzipSync } from 'zlib';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const NEXT_DIR = '.next';
const MANIFEST = join(NEXT_DIR, 'app-build-manifest.json');
const BUDGET_FILE = 'bundle-budget.json';

function fail(msg) {
  console.error(`check-bundle-budget: ${msg}`);
  process.exit(2);
}

function loadJson(path) {
  if (!existsSync(path)) fail(`missing ${path} (run \`pnpm build\` first)`);
  return JSON.parse(readFileSync(path, 'utf-8'));
}

// Sum gzipped bytes of a route's unique JS chunks.
function gzipKb(files) {
  const bytes = [...new Set(files)].reduce((sum, f) => {
    const p = join(NEXT_DIR, f);
    return existsSync(p) ? sum + gzipSync(readFileSync(p)).length : sum;
  }, 0);
  return bytes / 1024;
}

// '/dashboard/page' -> '/dashboard'; '/page' -> '/'; '/api/x/route' -> '/api/x'
function routeName(key) {
  const r = key.replace(/\/(page|route)$/, '');
  return r === '' ? '/' : r;
}

function isIgnored(route, ignore) {
  return ignore.some((p) => route === p || route.startsWith(p));
}

function measure(pages, budget) {
  const rows = [];
  for (const key of Object.keys(pages)) {
    const route = routeName(key);
    if (isIgnored(route, budget.ignore ?? [])) continue;
    const kb = gzipKb(pages[key]);
    const limit = budget.routes?.[route] ?? budget.defaultKb;
    rows.push({ route, kb, limit, over: kb > limit });
  }
  return rows.sort((a, b) => b.kb - a.kb);
}

function report(rows) {
  console.log('Route'.padEnd(28), 'First Load JS (gz)'.padEnd(20), 'Budget');
  for (const { route, kb, limit, over } of rows) {
    const size = `${kb.toFixed(1)} kB`.padEnd(20);
    console.log(route.padEnd(28), size, `${limit} kB${over ? '  ✗ OVER' : ''}`);
  }
}

function main() {
  const { pages } = loadJson(MANIFEST);
  const budget = loadJson(BUDGET_FILE);
  const rows = measure(pages, budget);
  report(rows);

  const violations = rows.filter((r) => r.over);
  if (violations.length > 0) {
    console.error(`\n${violations.length} route(s) over budget:`);
    for (const v of violations) {
      console.error(`  ${v.route}: ${v.kb.toFixed(1)} kB > ${v.limit} kB`);
    }
    console.error(
      '\nReduce the bundle, or if the growth is justified raise the budget in ' +
        'bundle-budget.json in the same PR so the increase is reviewed.',
    );
    process.exit(1);
  }
  console.log(`\nAll ${rows.length} route(s) within budget.`);
}

main();
