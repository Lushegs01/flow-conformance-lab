import { z } from "zod";
import { mkdir, writeFile } from "node:fs/promises";
import { RunSchema } from "../src/model.js";
await mkdir("schemas", { recursive: true });
await writeFile(
  "schemas/run.schema.json",
  JSON.stringify(
    z.toJSONSchema(RunSchema, { unrepresentable: "any" }),
    null,
    2,
  ) + "\n",
);
