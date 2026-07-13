import { existsSync } from "node:fs";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { generateSlides, type GenVariantWidth } from "./generateSlides";
import type { GeneratedSlide } from "./types";

/**
 * Filesystem driver: reads the image variant folders described by `config`,
 * builds the `GeneratedSlide[]` document (idempotently — see `generateSlides`),
 * and writes it as JSON. The only part that touches the disk; everything else
 * in `data-gen/` is pure.
 *
 * Self-contained: depends on Node built-ins only, nothing from the carousel
 * component, so the folder can be copied to a server and run on its own.
 */

const IMAGE_EXTENSIONS = new Set([
  ".webp",
  ".avif",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
]);

/** One resolution variant: a subfolder (under `assetsDir`) and its width. */
export interface DataGenVariant {
  subdir: string;
  width: number;
}

/** An art-directed source group (e.g. an orientation crop). */
export interface DataGenSource {
  media: string;
  type?: string;
  /** Intrinsic aspect (width / height) of this group's crop. */
  aspect?: number;
  variants: DataGenVariant[];
}

export interface DataGenConfig {
  /** Disk root holding the variant subfolders (relative to cwd or absolute). */
  assetsDir: string;
  /** URL prefix prepended to each file, e.g. `"/CarouselCC/carousel/"`. */
  urlBase: string;
  /** Where to write the JSON document (relative to cwd or absolute). */
  output: string;
  /** Default `<img>` resolution variants. */
  variants: DataGenVariant[];
  /** Intrinsic aspect (width / height) of the default crop. */
  aspect?: number;
  /** Art-directed source groups. */
  sources?: DataGenSource[];
}

export interface DataGenResult {
  written: number;
  output: string;
}

const slugFromFile = (file: string): string => file.replace(/\.[^.]+$/, "");
const slideNumber = (slug: string): number =>
  Number.parseInt(slug.replace(/\D/g, ""), 10);

const joinUrl = (base: string, subdir: string, file: string): string =>
  `${base.replace(/\/$/, "")}/${subdir}/${file}`;

/** Read one variant subfolder into a `slug -> public URL` map. */
const readVariant = async (
  assetsDir: string,
  urlBase: string,
  variant: DataGenVariant,
): Promise<GenVariantWidth> => {
  const dir = path.join(assetsDir, variant.subdir);
  const files = (await readdir(dir)).filter((file) =>
    IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase()),
  );
  const urlBySlug: Record<string, string> = {};
  for (const file of files) {
    urlBySlug[slugFromFile(file)] = joinUrl(urlBase, variant.subdir, file);
  }
  return { width: variant.width, urlBySlug };
};

const loadPrevious = async (output: string): Promise<GeneratedSlide[]> => {
  if (!existsSync(output)) return [];
  try {
    return JSON.parse(await readFile(output, "utf8")) as GeneratedSlide[];
  } catch {
    return [];
  }
};

export async function runDataGen(config: DataGenConfig): Promise<DataGenResult> {
  const assetsDir = path.resolve(process.cwd(), config.assetsDir);
  const output = path.resolve(process.cwd(), config.output);

  const widths = await Promise.all(
    config.variants.map((variant) =>
      readVariant(assetsDir, config.urlBase, variant),
    ),
  );

  const sources = await Promise.all(
    (config.sources ?? []).map(async (group) => ({
      media: group.media,
      ...(group.type !== undefined && { type: group.type }),
      ...(group.aspect !== undefined && { aspect: group.aspect }),
      widths: await Promise.all(
        group.variants.map((variant) =>
          readVariant(assetsDir, config.urlBase, variant),
        ),
      ),
    })),
  );

  // The first default variant defines the slide set + order.
  const slugs = Object.keys(widths[0]?.urlBySlug ?? {}).sort(
    (a, b) => slideNumber(a) - slideNumber(b),
  );

  const slides = generateSlides({
    widths,
    ...(config.aspect !== undefined && { aspect: config.aspect }),
    sources,
    slugs,
    previous: await loadPrevious(output),
    newId: () => randomUUID(),
  });

  await writeFile(output, `${JSON.stringify(slides, null, 2)}\n`, "utf8");
  return { written: slides.length, output };
}
