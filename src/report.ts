import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Run } from "./model.js";
export async function report(
  run: Run,
  dir: string,
  options: { sample?: boolean } = {},
): Promise<string> {
  const assets = new URL("../apps/web/", import.meta.url);
  const js = await readFile(new URL("inspector.js", assets), "utf8");
  const css = await readFile(new URL("inspector.css", assets), "utf8");
  const data = JSON.stringify(run)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'"><title>Flow Conformance Lab — Evidence Inspector</title><style>${css}</style></head><body><div id="root"${options.sample ? ' data-sample="true"' : ""}></div><script id="run-data" type="application/json">${data}</script><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`;
  await mkdir(join(dir, "report"), { recursive: true });
  const path = join(dir, "report", "index.html");
  await writeFile(path, html, { mode: 0o600 });
  return path;
}
