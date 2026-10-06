import { build } from "esbuild";
await build({
  entryPoints: ["apps/web/inspector.tsx"],
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "es2022",
  minify: true,
  outfile: "dist/apps/web/inspector.js",
  define: { "process.env.NODE_ENV": '"production"' },
});
