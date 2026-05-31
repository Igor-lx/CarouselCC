# `data-gen` — carousel content generator

Self-contained kit that turns responsive image assets into the
`carousel-slides.json` document the `<Carousel>` fetches at runtime. It is part
of the carousel "box": copy the component into your app, copy **this folder** to
wherever your images live (a build box, a server, a CDN pipeline), and run it
there. It depends only on Node built-ins and imports nothing from the component,
so it travels on its own.

## What it produces

A JSON array of slides:

```jsonc
[
  {
    "id": "…",                          // stable; preserved across regenerations
    "content": "<base>/portrait/480/carousel1.webp", // identity + <img> fallback
    "alt": "",                          // scaffolded empty; fill by hand
    "image": {
      "srcSet": "…480w, …720w",
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
  portrait/480/carousel1.webp …
  portrait/720/carousel1.webp …
  landscape/480/carousel1.webp …   (optional art-directed crop)
  landscape/720/carousel1.webp …
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
  "variants": [
    { "subdir": "portrait/480", "width": 480 },
    { "subdir": "portrait/720", "width": 720 }
  ],
  "sources": [
    {
      "media": "(orientation: landscape) and (max-height: 520px)",
      "type": "image/webp",
      "variants": [
        { "subdir": "landscape/480", "width": 480 },
        { "subdir": "landscape/720", "width": 720 }
      ]
    }
  ]
}
```

- `assetsDir` — disk root of the variant subfolders (relative to cwd or absolute).
- `urlBase` — URL prefix baked into the document (the app origin / base, or a CDN
  origin in production).
- `output` — where to write the JSON.
- `variants` — the default `<img>` resolutions. The **first** one defines the
  slide set and order.
- `sources` — optional art-directed groups (e.g. an orientation crop).

## Idempotent

Re-running merges against the existing `output`: a slide is matched by its slug,
so its `id` and hand-written `alt` are preserved, new assets get a fresh id, and
removed assets are dropped. Safe to regenerate after editing `alt`.

## Programmatic use

```ts
import { runDataGen } from "./data-gen";
await runDataGen(config); // same config object as the JSON above
```
