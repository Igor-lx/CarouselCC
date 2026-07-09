# Carousel masters — untouchable originals

One folder per photo collection; the highest-quality originals we have. They
are **never served and never imported by code** — every deployed tier under
`public/carousel/<collection>/<crop>/<width>/` is cut from these with
ImageMagick, then the JSON documents are rebuilt (`npm run gen:carousel`).

| Collection | Dimensions | Native aspect |
| ---------- | ---------- | ------------- |
| `nature/`  | 2000×1125  | 16:9 (wide)   |
| `family/`  | 720×1280   | 9:16 (tall)   |

The filename is the photo's identity: `carouselN.webp` must stay the same
slug across every cut folder — that is what keeps the same picture on every
device/orientation and preserves slide ids across regenerations.

## Cutting recipes (per file)

Wide tiers from a wide master (resize only):

```bash
magick nature/carouselN.webp -resize 480x  -quality 82 .../nature/wide/480/carouselN.webp
# …same for 720 / 1080 / 1600
```

Tall 9:16 centre-crop from a wide 16:9 master (crop, then tier):

```bash
magick nature/carouselN.webp -gravity center -crop 633x1125+0+0 +repage \
  -resize 480x853!  -quality 82 .../nature/tall/480/carouselN.webp   # and 720x1280!
```

Wide 16:9 centre-crop from a tall 9:16 master:

```bash
magick family/carouselN.webp -gravity center -crop 720x405+0+0 +repage \
  -quality 85 .../family/wide/720/carouselN.webp
# small tier: same crop + -resize 480x270!
```

Note: the family master is only 720 px wide, so its `tall/720` tier is a
byte-for-byte copy of the master — there was nothing bigger to keep separate.
If a higher-resolution family original ever appears, replace the files here
and re-cut.
