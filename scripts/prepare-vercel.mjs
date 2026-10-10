
import { readFile, mkdir, copyFile, access } from "node:fs/promises";
import { resolve } from "node:path";

const artifacts = JSON.parse(
  await readFile(resolve("runs", "demo-latest.json"), "utf8")
);

if (!artifacts.broken) {
  throw new Error("The demo did not generate a broken-host report.");
}

const source = resolve(artifacts.broken, "report", "index.html");
const outputDir = resolve("public");

await access(source);
await mkdir(outputDir, { recursive: true });
await copyFile(source, resolve(outputDir, "index.html"));

console.log("Static demo prepared for Vercel.");
