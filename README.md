# Pierrick Coupé — professional website

Static site built with [Astro](https://astro.build), hosted on GitHub Pages.
Publications are synced every week from **ORCID** (metadata) and **HAL** (open-access PDFs).

## Editing content

All content lives in `src/data/` — edit the files directly on GitHub (pencil icon) and the
site is rebuilt automatically within ~2 minutes.

| File | Content |
|---|---|
| `profile.yaml` | Name, position, contact, profile links, home-page text, biography |
| `news.yaml` | Latest news (3 most recent shown on the home page) |
| `research.yaml` | The three research axes |
| `projects.yaml` | Research projects |
| `software.yaml` | volBrain, pipelines, research code, registered software |
| `team.yaml` | Current members, alumni, open positions |
| `career.yaml` | Experience, education, editorial activities |
| `awards.yaml` | Awards and distinctions |
| `jury.yaml` | Thesis committees |
| `patents.yaml` | Patents |
| `corrections.yml` | Fixes applied on top of ORCID (type, year, hide, featured papers…) |
| `publications.json` | **Generated** — do not edit by hand |

Portrait: add `public/images/portrait.jpg` (4:5 ratio, ~800×1000 px) and set `portrait: true` in `profile.yaml`.

## Publications

- `npm run sync` fetches ORCID + HAL and rewrites `src/data/publications.json`.
- On GitHub this runs every Monday and on every push (see `.github/workflows/deploy.yml`);
  you can also trigger it from the **Actions** tab → *Sync publications & deploy* → *Run workflow*.
- Duplicates (preprint + journal, LNCS "book" + paper) are merged automatically.
  Anything else is fixed in `corrections.yml`, never in ORCID-generated data.

## Local development

```bash
npm install
npm run sync     # optional, refreshes publications
npm run dev      # http://localhost:4321
npm run build    # static site in dist/
```

## First-time setup on GitHub

1. Create a repository named `<username>.github.io` and push this folder to its `main` branch.
2. Settings → Pages → Build and deployment → Source: **GitHub Actions**.
3. Settings → Actions → General → Workflow permissions: **Read and write permissions**.
4. (Optional) custom domain: Settings → Pages → Custom domain, then add the DNS records
   given by GitHub at your registrar.
