import { defineConfig } from 'astro/config';

// SITE_URL / BASE_PATH can be overridden at build time (see .github/workflows/deploy.yml).
// - User site  https://<user>.github.io            -> BASE_PATH=/
// - Project site https://<user>.github.io/<repo>/  -> BASE_PATH=/<repo>/
// - Custom domain https://pierrickcoupe.fr          -> BASE_PATH=/
export default defineConfig({
  site: process.env.SITE_URL || 'https://example.github.io',
  base: process.env.BASE_PATH || '/',
  trailingSlash: 'always',
});
