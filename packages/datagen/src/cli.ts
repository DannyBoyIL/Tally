// Generates the golden set: one folder per document with page.jpg + case.json,
// plus manifest.json and vendors.json (master data for the validators).
//
//   pnpm --filter @tally/datagen generate --seed 2026 --out data/golden   (both optional)

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { buildGoldenSet } from './golden-set.ts';
import { renderImages } from './render.ts';
import { vendorMasterData } from './vendors.ts';

const repoRoot = resolve(import.meta.dirname, '../../..');
const { values } = parseArgs({
  // pnpm forwards a literal "--" (npm habit: `generate -- --seed 7`); ignore it.
  args: process.argv.slice(2).filter((arg) => arg !== '--'),
  options: {
    seed: { type: 'string', default: '2026' },
    out: { type: 'string', default: join(repoRoot, 'data/golden') },
  },
});
const seed = Number(values.seed);
const outDir = resolve(values.out);

const cases = buildGoldenSet(seed);
await rm(outDir, { recursive: true, force: true });

const toJson = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

for (const c of cases) {
  const dir = join(outDir, c.id);
  await mkdir(dir, { recursive: true });
  const { spec } = c;
  await writeFile(
    join(dir, 'case.json'),
    toJson({
      id: c.id,
      category: c.category,
      image: 'page.jpg',
      truth: spec.invoice,
      expectedFlags: c.expectedFlags,
      attack: spec.attack,
      render: {
        layout: spec.layout,
        vendorId: spec.vendor.id,
        moneyStyle: spec.moneyStyle,
        dateStyle: spec.dateStyle,
        labels: spec.labels,
        scan: spec.scan,
      },
    }),
  );
}

await writeFile(join(outDir, 'vendors.json'), toJson(vendorMasterData()));
await writeFile(
  join(outDir, 'manifest.json'),
  toJson({
    seed,
    generatedBy: '@tally/datagen',
    count: cases.length,
    cases: cases.map((c) => ({ id: c.id, category: c.category, layout: c.spec.layout })),
  }),
);

await renderImages(cases.map((c) => ({ spec: c.spec, path: join(outDir, c.id, 'page.jpg') })));
console.log(`Wrote ${cases.length} documents to ${outDir}`);
