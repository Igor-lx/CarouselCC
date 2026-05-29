/**
 * Offline carousel-data generator (run via `npm run gen:carousel`).
 *
 * Reads the image variants from `public/carousel/<orientation>/<width>/`, bakes
 * stable public URLs, and writes the `Slide[]` content document to
 * `public/carousel-slides.json`. Idempotent: re-running preserves the `id` and
 * hand-written `alt` of slides that still exist (see `generateCarouselSlides`).
 *
 * This is author/build-time tooling — it is NOT shipped to the client. The
 * client only fetches the produced JSON. In a real deployment the URL base
 * would be the asset CDN origin; here it is the gh-pages `DEPLOY_BASE` because
 * the images live in `public/`.
 *
 * Run with `tsx` (resolves the extensionless TS imports into `src/`).
 */
import { existsSync } from "node:fs";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import {
  generateCarouselSlides,
  type GenVariantWidth,
} from "../src/app/carouselContentGen";
import { DEPLOY_BASE } from "../src/app/deployBase";
import type { Slide } from "../src/components/Carousel/contract/types";

const ROOT = path.resolve(import.meta.dirname, "..");
const CAROUSEL_DIR = path.join(ROOT, "public", "carousel");
const OUTPUT = path.join(ROOT, "public", "carousel-slides.json");

// Product decision: the portrait asset is the default; the landscape crop only
// applies in the wide-and-short slot (matches the compact-landscape breakpoint).
const LANDSCAPE_CROP_MEDIA = "(orientation: landscape) and (max-height: 520px)";

const slugFromFile = (file: string): string => file.replace(/\.[^.]+$/, "");
const slideNumber = (slug: string): number =>
  Number.parseInt(slug.replace(/\D/g, ""), 10);

/** Read one `<orientation>/<width>` folder into a slug -> public-URL map. */
const readVariant = async (
  orientation: string,
  width: number,
): Promise<GenVariantWidth> => {
  const dir = path.join(CAROUSEL_DIR, orientation, String(width));
  const files = (await readdir(dir)).filter((file) => file.endsWith(".webp"));
  const urlBySlug: Record<string, string> = {};
  for (const file of files) {
    urlBySlug[slugFromFile(file)] =
      `${DEPLOY_BASE}carousel/${orientation}/${width}/${file}`;
  }
  return { width, urlBySlug };
};

const loadPrevious = async (): Promise<Slide[]> => {
  if (!existsSync(OUTPUT)) return [];
  try {
    return JSON.parse(await readFile(OUTPUT, "utf8")) as Slide[];
  } catch {
    return [];
  }
};

const main = async (): Promise<void> => {
  const [portrait480, portrait720, landscape480, landscape720] =
    await Promise.all([
      readVariant("portrait", 480),
      readVariant("portrait", 720),
      readVariant("landscape", 480),
      readVariant("landscape", 720),
    ]);

  const slugs = Object.keys(portrait480.urlBySlug).sort(
    (a, b) => slideNumber(a) - slideNumber(b),
  );

  const slides = generateCarouselSlides({
    widths: [portrait480, portrait720],
    sources: [
      {
        media: LANDSCAPE_CROP_MEDIA,
        type: "image/webp",
        widths: [landscape480, landscape720],
      },
    ],
    slugs,
    previous: await loadPrevious(),
    newId: () => randomUUID(),
  });

  await writeFile(OUTPUT, `${JSON.stringify(slides, null, 2)}\n`, "utf8");
  console.log(
    `Wrote ${slides.length} slides -> ${path.relative(ROOT, OUTPUT)}`,
  );
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
