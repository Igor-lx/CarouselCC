# Carousel — box with two halves

This folder is a self-contained kit. Open it and you see the two parts, each
copied to a different place:

| Folder | Role | Goes to | Runs |
| ------ | ---- | ------- | ---- |
| [`client/`](./client) | The React carousel **component** | your application | in the browser |
| [`data-gen/`](./data-gen) | The **content generator** that turns image assets into the `carousel-slides.json` the component fetches | your server / build box | once, offline (Node) |

The two halves are independent: **`data-gen/` imports nothing from `client/`**
(so it can be dropped on a server by itself, and `node:fs` never reaches the
app bundle), and **`client/` imports nothing from `data-gen/`**. The only thing
that flows between them is the JSON document `data-gen/` produces and the
component consumes — its shape is the `Slide` contract.

## Compatibility tests

The [`boundary/`](./boundary) folder holds the tests that enforce this fit
between the two halves as CI invariants. They belong to **this source repo
only** — they are not copied into the app or shipped with either half. They run
here, where both halves still sit side by side, to prove the split stays clean.
They live on neutral ground (above both halves), so they can see both without
crossing the boundary they guard:

- [`boundaries.test.ts`](./boundary/boundaries.test.ts) — fails the build if
  `client/` ever imports `data-gen/`, or if any `data-gen/` import escapes the
  folder. This is what keeps the Node generator (and `node:fs`) out of the app
  bundle.
- [`slide-contract.test.ts`](./boundary/slide-contract.test.ts) — a compile-time
  check that the slide the generator emits is always a valid component `Slide`.
  The two halves define the slide type independently; this locks them compatible.

## Use it

1. **Client.** Import the component from `client/` and feed it `slidesData`:
   ```ts
   import Carousel from "@/components/Carousel/client";
   ```
   Full architecture: [`client/ARCHITECTURE.md`](./client/ARCHITECTURE.md).

2. **Data.** Put your image variants where they'll be served, point a config at
   them, and run the generator once to produce the JSON:
   ```bash
   npm run gen:carousel   # tsx data-gen/cli.ts carousel-data.config.json
   ```
   How-to: [`data-gen/README.md`](./data-gen/README.md).
