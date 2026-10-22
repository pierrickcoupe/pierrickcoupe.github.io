#!/usr/bin/env node
// Usage: npm run sync
// Fetches ORCID + HAL and writes src/data/publications.json.
import fs from 'node:fs';
import path from 'node:path';
import * as yaml from 'js-yaml';
import { buildPublications } from './lib/publications.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const data = (f) => path.join(root, 'src/data', f);

const profile = yaml.load(fs.readFileSync(data('profile.yaml'), 'utf8'));
const corr = yaml.load(fs.readFileSync(data('corrections.yml'), 'utf8')) || {};

const result = await buildPublications({
  orcid: profile.orcid,
  halId: profile.halId,
  corrections: corr.corrections || [],
  extra: corr.additions || [],
});

const out = data('publications.json');
const previous = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null;
if (previous && result.count < previous.count * 0.8) {
  // Safety net: never wipe the list because of a partial API answer.
  console.error(`Refusing to write: ${result.count} publications vs ${previous.count} before.`);
  process.exit(1);
}
fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
const byType = result.publications.reduce((m, p) => ((m[p.type] = (m[p.type] || 0) + 1), m), {});
console.log(`Wrote ${result.count} publications`, byType);
