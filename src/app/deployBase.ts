/**
 * Single source of truth for the deployment base path.
 *
 * Used by `vite.config.ts` (`base`) and by the carousel-data generator
 * (`scripts/gen-carousel-data.ts`) to prefix the image URLs it bakes into
 * `public/carousel-slides.json`. Keeping both in sync from one constant avoids
 * a drift where the app is served under one path but the data points at
 * another.
 *
 * In a real deployment the *asset* base is usually a CDN origin, independent of
 * the app's mount path; there the generator would take that origin instead.
 * For this gh-pages demo the images live in `public/`, so they are served under
 * the same base as the app.
 */
export const DEPLOY_BASE = "/CarouselCC/";
