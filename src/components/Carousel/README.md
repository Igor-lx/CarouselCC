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
