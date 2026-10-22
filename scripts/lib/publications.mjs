// Builds the publication list from ORCID (metadata) + HAL (open-access PDFs).
// Pure module: only relies on the global `fetch`, so it runs in Node 18+ and in a browser.

const ORCID_API = 'https://pub.orcid.org/v3.0';
const HAL_API = 'https://api.archives-ouvertes.fr/search/';

// Display order / priority when the same paper exists in several versions.
const TYPE_PRIORITY = {
  journal: 0, conference: 1, chapter: 2, book: 3, thesis: 4, preprint: 8, other: 9,
};

export const norm = (s = '') =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

const normDoi = (d = '') => d.trim().toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, '');

/** Map ORCID work types to the site's categories. */
function classify(orcidType, doi, title, venue) {
  const t = (orcidType || '').toLowerCase();
  if (t === 'journal-article' || t === 'review' || t === 'journal-issue') return 'journal';
  if (t === 'conference-paper' || t === 'conference-abstract' || t === 'conference-poster') return 'conference';
  if (t === 'preprint' || t === 'working-paper') return 'preprint';
  if (t === 'book-chapter') return 'chapter';
  if (t === 'book' || t === 'edited-book') {
    // Springer LNCS & co.: a chapter DOI ends with "_<n>" => it is a paper in proceedings.
    if (/^10\.1007\/978-[\d-]+_\d+$/.test(doi)) return 'conference';
    if (/lecture notes|proceedings|miccai|workshop|isbi|ipmi/i.test(venue || '')) return title.toLowerCase() === 'preface' ? 'book' : 'conference';
    return 'book';
  }
  if (t === 'dissertation-thesis' || t === 'dissertation') return 'thesis';
  return 'other';
}


// ---------- Cosmetic normalisation (ORCID data comes from many sources) ----------
const SMALL = new Set(['a','an','and','as','at','by','for','from','in','of','on','or','the','to','with','de','la','et']);

/** "Coupé, P." / "Coupé P" / "Pierrick Coupé" / "Coupe PJ" -> "P. Coupé" */
export function formatAuthor(raw = '') {
  let a = raw.replace(/\s+/g, ' ').trim();
  if (!a || /consortium|initiative|group|cohort|investigators/i.test(a)) return a;
  let last, first;
  if (a.includes(',')) {
    [last, first] = a.split(',').map((x) => x.trim());
  } else {
    const parts = a.split(' ');
    const tail = parts[parts.length - 1];
    if (parts.length > 1 && /^[A-Z]{1,3}$/.test(tail.replace(/\./g, ''))) {
      // PubMed style: "Manjón JV"
      first = tail.replace(/\./g, '').split('').join('. ') + '.';
      last = parts.slice(0, -1).join(' ');
      return `${first} ${last}`;
    }
    last = parts.pop();
    // keep particles with the last name: "Denis de Senneville", "van Swieten"
    while (parts.length > 1 && /^(de|da|del|della|di|du|van|von|der|le|la)$/i.test(parts[parts.length - 1])) last = parts.pop() + ' ' + last;
    first = parts.join(' ');
  }
  if (!first) return last;
  const initials = first
    .split(/[\s.]+/).filter(Boolean)
    .map((w) => w.split(/[-\u2010]/).filter(Boolean).map((x) => x[0].toUpperCase() + '.').join('-'))
    .join(' ');
  const out = `${initials} ${last}`;
  return out === 'P. Coupe' ? 'P. Coupé' : out;
}

export function formatVenue(raw = '') {
  let v = raw.trim()
    .replace(/\s*:\s.*$/, '')            // "Brain : a journal of neurology" -> "Brain"
    .replace(/\s*\((London, England|Cambridge, Mass\.|R)\)/gi, '')
    .replace(/\(R\)/g, '')
    .replace(/\.$/, '');
  if (v && v === v.toLowerCase().replace(/^./, (c) => c) && /[a-z]/.test(v)) {
    v = v.split(' ').map((w, i) => (i > 0 && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
  } else if (v && /^\S+( [a-z&'\-]+)+$/.test(v) && /^[A-Z]/.test(v)) {
    // "Scientific reports" -> "Scientific Reports"
    v = v.split(' ').map((w, i) => (i > 0 && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
  }
  return v;
}

export function formatTitle(raw = '') {
  let t = raw.replace(/\s+/g, ' ').trim().replace(/\.$/, '');
  const letters = t.replace(/[^A-Za-z]/g, '');
  if (letters.length > 10 && letters === letters.toUpperCase()) {
    t = t.charAt(0) + t.slice(1).toLowerCase();
  }
  return t;
}

export function cleanRecord(r) {
  return {
    ...r,
    title: formatTitle(r.title),
    venue: formatVenue(r.venue),
    authors: (r.authors || []).map(formatAuthor),
  };
}

async function getJson(fetchImpl, url) {
  const res = await fetchImpl(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

function extIds(ids = []) {
  const out = {};
  for (const e of ids) {
    const type = e['external-id-type'];
    const value = e['external-id-normalized']?.value || e['external-id-value'];
    if (!out[type]) out[type] = value;
  }
  return out;
}

/** Fetch full ORCID work records (with contributors), 100 at a time. */
async function fetchOrcidWorks(fetchImpl, orcid) {
  const list = await getJson(fetchImpl, `${ORCID_API}/${orcid}/works`);
  const groups = list.group || [];
  const putCodes = groups.flatMap((g) => g['work-summary'].map((s) => s['put-code']));
  const details = new Map();
  for (let i = 0; i < putCodes.length; i += 100) {
    const chunk = putCodes.slice(i, i + 100);
    const bulk = await getJson(fetchImpl, `${ORCID_API}/${orcid}/works/${chunk.join(',')}`);
    for (const b of bulk.bulk || []) if (b.work) details.set(b.work['put-code'], b.work);
  }
  return groups.map((g) => g['work-summary'].map((s) => details.get(s['put-code']) || s));
}

function toRecord(work) {
  const title = work.title?.title?.value?.trim() || '';
  const ids = extIds(work['external-ids']?.['external-id']);
  const doi = ids.doi ? normDoi(ids.doi) : '';
  const venue = work['journal-title']?.value?.trim() || '';
  const year = Number(work['publication-date']?.year?.value) || null;
  const authors = (work.contributors?.contributor || [])
    .filter((c) => !c['contributor-attributes'] || ['author', null, undefined].includes(c['contributor-attributes']['contributor-role']) || /author/i.test(c['contributor-attributes']['contributor-role'] || ''))
    .map((c) => c['credit-name']?.value?.trim())
    .filter(Boolean);
  const source = work.source?.['source-name']?.value || '';
  return {
    title, year, venue, doi, authors,
    hal: ids.hal || '',
    arxiv: ids.arxiv || '',
    pmid: ids.pmid || '',
    url: work.url?.value || '',
    orcidType: work.type,
    type: classify(work.type, doi, title, venue),
    source,
  };
}

/** Pick the best version inside a group of duplicates. */
function pickBest(records) {
  return [...records].sort((a, b) => {
    const pa = TYPE_PRIORITY[a.type] ?? 9, pb = TYPE_PRIORITY[b.type] ?? 9;
    if (pa !== pb) return pa - pb;
    if (!!b.doi !== !!a.doi) return b.doi ? 1 : -1;
    if (b.authors.length !== a.authors.length) return b.authors.length - a.authors.length;
    return (b.venue ? 1 : 0) - (a.venue ? 1 : 0);
  })[0];
}

function mergeVersions(best, all) {
  // Fill gaps in the chosen version with data from the other versions.
  const out = { ...best };
  for (const r of all) {
    if (!out.authors.length && r.authors.length) out.authors = r.authors;
    if (!out.venue && r.venue && r.type === out.type) out.venue = r.venue;
    if (!out.hal && r.hal) out.hal = r.hal;
    if (!out.arxiv && r.arxiv) out.arxiv = r.arxiv;
    if (!out.pmid && r.pmid) out.pmid = r.pmid;
    if (!out.doi && r.doi && r.type === out.type) out.doi = r.doi;
  }
  return out;
}

/** HAL records of the author, indexed by DOI and normalised title. */
async function fetchHal(fetchImpl, halId) {
  const fl = 'halId_s,doiId_s,title_s,fileMain_s,linkExtUrl_s,openAccess_bool,producedDateY_i,submitType_s';
  const url = `${HAL_API}?q=authIdHal_s:${encodeURIComponent(halId)}&fl=${fl}&rows=2000&wt=json`;
  const data = await getJson(fetchImpl, url);
  const byDoi = new Map(), byTitle = new Map(), byId = new Map();
  for (const d of data.response?.docs || []) {
    const rec = {
      halId: d.halId_s,
      pdf: d.fileMain_s || '',
      page: `https://hal.science/${d.halId_s}`,
    };
    byId.set(d.halId_s, rec);
    if (d.doiId_s) byDoi.set(normDoi(d.doiId_s), rec);
    for (const t of d.title_s || []) byTitle.set(norm(t), rec);
  }
  return { byDoi, byTitle, byId };
}

export function applyCorrection(rec, corrections) {
  for (const c of corrections) {
    const hit = (c.doi && rec.doi && normDoi(c.doi) === rec.doi)
      || (c.title && norm(c.title) === norm(rec.title))
      || (c.hal && rec.hal && c.hal === rec.hal);
    if (!hit) continue;
    for (const k of ['type', 'year', 'venue', 'title', 'hide', 'featured', 'pdf', 'authors', 'note']) {
      if (c[k] !== undefined) rec[k] = c[k];
    }
  }
  return rec;
}

/**
 * @param {object} opts
 * @param {string} opts.orcid
 * @param {string} [opts.halId]
 * @param {Array}  [opts.corrections]  entries from corrections.yml
 * @param {Array}  [opts.extra]        manual additions (same shape as output)
 * @param {Function} [opts.fetch]
 */
export async function buildPublications({ orcid, halId, corrections = [], extra = [], fetch: fetchImpl = globalThis.fetch }) {
  const groups = await fetchOrcidWorks(fetchImpl, orcid);

  // 1. One record per ORCID group (ORCID already groups versions sharing an identifier).
  let records = groups.map((versions) => {
    const recs = versions.map(toRecord);
    return mergeVersions(pickBest(recs), recs);
  });

  // 2. Merge remaining duplicates by normalised title (e.g. preprint vs journal, LNCS "book" vs "journal").
  const byTitle = new Map();
  for (const r of records) {
    const k = norm(r.title);
    if (!k) continue;
    if (!byTitle.has(k)) byTitle.set(k, []);
    byTitle.get(k).push(r);
  }
  records = [...byTitle.values()].map((recs) => mergeVersions(pickBest(recs), recs));

  // 3. Manual additions and corrections.
  records = records.concat(extra.map((e) => ({ authors: [], venue: '', doi: '', hal: '', type: 'journal', ...e })));
  records = records.map(cleanRecord).map((r) => applyCorrection(r, corrections));

  // 4. Open-access PDFs from HAL.
  if (halId) {
    try {
      const hal = await fetchHal(fetchImpl, halId);
      for (const r of records) {
        const h = (r.hal && hal.byId.get(r.hal)) || (r.doi && hal.byDoi.get(r.doi)) || hal.byTitle.get(norm(r.title));
        if (h) {
          r.hal = h.halId;
          r.halPage = h.page;
          if (!r.pdf && h.pdf) r.pdf = h.pdf;
        }
      }
    } catch (e) {
      console.warn('HAL lookup failed, continuing without PDFs:', e.message);
    }
  }

  // 5. Clean up: hide "Preface" entries and untitled items, sort.
  records = records
    .filter((r) => r.title && !r.hide && norm(r.title) !== 'preface' && !/^(correction|erratum|corrigendum)\b/i.test(r.title))
    .map(({ source, orcidType, hide, ...r }) => ({
      ...r,
      link: r.doi ? `https://doi.org/${r.doi}` : (r.url || r.halPage || ''),
    }))
    .sort((a, b) => (b.year || 0) - (a.year || 0) || (TYPE_PRIORITY[a.type] - TYPE_PRIORITY[b.type]) || a.title.localeCompare(b.title));

  return { updated: new Date().toISOString(), count: records.length, publications: records };
}
