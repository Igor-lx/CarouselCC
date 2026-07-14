/** Serves the two A/B builds (.perf-probe/ab/{off,on}) to the phone over `adb reverse`. */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

const ROOT = resolve(".perf-probe/ab");
const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
};

createServer(async (req, res) => {
  let path = decodeURIComponent(req.url.split("?")[0]);
  if (path.endsWith("/")) path += "index.html";

  // Slide images are addressed with the deployed base (/CarouselCC/...), which
  // is baked into the image data, not derived from vite's --base. Serve them
  // from a build's public assets — otherwise every slide 404s into an error
  // state and the rig measures broken slides instead of a carousel.
  if (path.startsWith("/CarouselCC/")) {
    path = `/on${path.slice("/CarouselCC".length)}`;
  }

  const file = join(ROOT, path);
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end("forbidden");
    return;
  }

  try {
    const body = await readFile(file);
    res.writeHead(200, {
      "content-type": TYPES[extname(file)] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
}).listen(8080, () => console.log("serving .perf-probe/ab on :8080"));
