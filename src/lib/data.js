// Loads the YAML/JSON content files in src/data at build time.
import fs from 'node:fs';
import path from 'node:path';
import * as yaml from 'js-yaml';

const DATA_DIR = path.resolve(process.cwd(), 'src/data');

export function load(name) {
  const file = path.join(DATA_DIR, name);
  const raw = fs.readFileSync(file, 'utf8');
  return name.endsWith('.json') ? JSON.parse(raw) : yaml.load(raw);
}

/** Prefix an internal path with the configured base URL. */
export function url(p = '') {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  if (/^(https?:|mailto:|tel:|#)/.test(p)) return p;
  return `${base}/${p.replace(/^\//, '')}`;
}
