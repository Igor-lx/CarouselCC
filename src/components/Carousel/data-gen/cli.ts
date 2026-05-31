import { readFile } from "node:fs/promises";
import path from "node:path";

import { runDataGen, type DataGenConfig } from "./runDataGen";

/**
 * CLI entry: `tsx cli.ts <config.json>`.
 *
 * Reads the host's config (paths / base / output / variants) from a JSON file
 * and runs the generator. This is the one-time, server-side command — copy
 * `data-gen/` to where the assets live, drop a `config.json` next to it, run.
 */
const main = async (): Promise<void> => {
  const configArg = process.argv[2];
  if (!configArg) {
    console.error("usage: cli <config.json>");
    process.exitCode = 1;
    return;
  }

  const configPath = path.resolve(process.cwd(), configArg);
  const config = JSON.parse(await readFile(configPath, "utf8")) as DataGenConfig;

  const { written, output } = await runDataGen(config);
  console.log(`Wrote ${written} slides -> ${path.relative(process.cwd(), output)}`);
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
