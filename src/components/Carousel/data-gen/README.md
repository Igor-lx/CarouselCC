# `data-gen` — carousel content generator

Self-contained kit that turns responsive image assets into the
`carousel-slides.json` document the `<Carousel>` fetches at runtime. It is part
of the carousel "box": copy the component into your app, copy **this folder** to
wherever your images live (a build box, a server, a CDN pipeline), and run it
there. It depends only on Node built-ins and imports nothing from the component,
so it travels on its own.

## Running it in THIS repo

```bash
npm run gen:carousel
```

That is the whole command. It processes BOTH demo configs
(`carousel-data.config1.json` and `carousel-data.config2.json` in the repo
root) and rewrites `public/carousel-slides1.json` / `public/carousel-slides2.json`.
Edit a config by hand → run this → the app picks the fresh document up on
the next reload (the demo fetches `carousel-slides${SLIDES_SET}.json`;
which set is live is `DEFAULT_SLIDES_SET` in `App.tsx`, overridable per
visit with `?slides=1|2`). Anywhere else, the raw form is
`tsx cli.ts <config.json>` — see "CLI" below.

## This generator is OPTIONAL

`<Carousel>` takes its slides through the `slidesData` prop, which is a plain
`Slide[]` — a JavaScript array. There are three tiers of effort, all valid:

1. **Hand-written objects.** Build a `Slide[]` in code and pass it straight to
   `slidesData` — no JSON, no generator. A slide can be as small as
   `{ id, content: "/my.jpg" }`.
2. **A tiny JSON, no variants.** Have a folder of images and want a document?
   Write a three-line config with a single `variants` entry (or even hand-write
   the JSON array) and load it however you like — `fetch`, import, bundler.
3. **The full pipeline.** Multiple resolutions and art-directed crops → let this
   generator assemble `srcSet`/`sources` and keep ids stable across regenerations.

The demo app uses tier 3 and `fetch`es the result, but that is a demo choice, not
a contract — `slidesData` never cares where the array came from.

## What it produces

A JSON array of slides:

```jsonc
[
  {
    "id": "…",                          // stable; preserved across regenerations
    "content": "<base>/nature/tall/480/carousel1.webp", // identity + <img> fallback
    "alt": "",                          // scaffolded empty; fill by hand
    "image": {
      "srcSet": "…480w, …720w",
      "defaultSrc": "<base>/nature/tall/720/carousel1.webp",  // only if `default` is set
      "sources": [ { "media": "…", "srcSet": "…", "type": "image/webp" } ]
    }
  }
]
```

`content` (the smallest candidate) is the slide's identity — it stays fixed
across viewports, which is what lets the carousel keep its position on rotation.
`sizes` is intentionally absent: the carousel supplies it from its slot count.

## Layout it expects

Variant files grouped by subfolder under one assets root, each subfolder one
resolution. The filename is the slug (e.g. `carousel1.webp` → `carousel1`); the
same slug across folders is the same logical slide.

```
<assetsDir>/
  nature/tall/480/carousel1.webp …   (the demo’s default set — tall 9:16 cut)
  nature/tall/720/carousel1.webp …
  nature/wide/480/carousel1.webp …   (the demo’s art-directed 16:9 crop of the SAME
  nature/wide/720/carousel1.webp …    photos, behind its media condition)
```

## Run it

```bash
tsx src/components/Carousel/data-gen/cli.ts carousel-data.config.json
```

`config.json`:

```json
{
  "assetsDir": "public/carousel",
  "urlBase": "/CarouselCC/carousel/",
  "output": "public/carousel-slides.json",
  "default": "nature/tall/720",
  "variants": [
    { "subdir": "nature/tall/480", "width": 480 },
    { "subdir": "nature/tall/720", "width": 720 }
  ],
  "sources": [
    {
      "media": "(orientation: landscape) and (max-height: 520px)",
      "type": "image/webp",
      "variants": [
        { "subdir": "nature/wide/480", "width": 480 },
        { "subdir": "nature/wide/720", "width": 720 },
        { "subdir": "nature/wide/1080", "width": 1080 },
        { "subdir": "nature/wide/1600", "width": 1600 }
      ]
    }
  ]
}
```

The generator is crop-agnostic: which variant family is the default set and
which sits behind a `<source media>` condition is purely this config's
choice (the carousel component bakes in no art direction). The one rule:
every `media` string must be one of the carousel's CANONICAL axis strings
(`SLIDE_CANONICAL_SOURCE_MEDIA`, generated from the breakpoint table in
`config/viewport.ts` plus the orientation and `short-landscape`
conditions) — that is what guarantees the asset choice flips together with
the slide box, the warm and the veil. `orientationMediaSync.test.ts` checks
these configs in CI; Diagnostics re-checks whatever data a host feeds at
runtime. The example mirrors the DEMO's current tuning — tall 9:16 as the
default set, wide 16:9 behind the `short-landscape` condition.

- `assetsDir` — disk root of the variant subfolders (relative to cwd or absolute).
- `urlBase` — URL prefix baked into the document (the app origin / base, or a CDN
  origin in production).
- `output` — where to write the JSON.
- `default` — **optional**, and only meaningful for a MULTI-set deck. It names
  the subfolder whose asset is the designated single-set / no-module fallback
  (`image.defaultSrc`): the one image to render when `<ResponsiveImages />` is
  not mounted, fitted via `object-fit`. A deck built from several sets already
  has a human who knows which asset stands alone — this records that choice
  instead of making the code derive it. It typically names a subfolder already
  listed in `variants` or `sources` (the value is deliberately duplicated). Omit
  it for a single-set deck: without it the carousel renders the widest candidate
  it can find, then `content`.
- `variants` — the default `<img>` resolutions. The **first** one defines the
  slide set and order.
- `sources` — optional art-directed groups (e.g. an orientation crop).

## What `default` actually controls (read before debugging crops)

`default` designates the SINGLE-SET asset — the one candidate a slide
renders when the `<ResponsiveImages />` module is NOT mounted (it becomes
`image.defaultSrc` in the document). **With the module mounted it plays no
role at all**: the browser then picks the crop through the art-directed
`<source media>` queries. Under the demo's CURRENT tuning both paths agree
on big screens — the tall crop is the default `variants` set AND the
`default` asset — so a desktop shows the vertical picture with or without
the module; only compact landscape diverges (module: wide crop via
`<source media>`; no module: the default asset centre-cropped by
`object-fit: cover`). With a different config the split lands wherever its
media condition puts it.
(Runtime rule: `resolveRenderedImageSrc` — responsive mode returns the
canonical URL, single-set mode returns `defaultSrc` → widest candidate →
content.)

## Idempotent

Re-running merges against the existing `output`: a slide is matched by its slug,
so its `id` and hand-written `alt` are preserved, new assets get a fresh id, and
removed assets are dropped. Safe to regenerate after editing `alt`.

## Programmatic use

```ts
import { runDataGen } from "./data-gen";
await runDataGen(config); // same config object as the JSON above
```
