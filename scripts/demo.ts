import { randomBytes } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createHost } from "../examples/host.js";
import { ConfigSchema, counts } from "../src/model.js";
import { runSuite } from "../src/runner.js";
import { claim, issue, saveRun } from "../src/evidence.js";
import { report } from "../src/report.js";
const config = ConfigSchema.parse(
  JSON.parse(await readFile("examples/target.json", "utf8")),
);
const authorization = `Bearer ${randomBytes(32).toString("hex")}`;
const root = resolve("runs");
await mkdir(root, { recursive: true });
const artifacts: Record<string, string> = {};
for (const broken of [false, true]) {
  const host = createHost({ authorization, broken });
  await new Promise<void>((r) => host.listen(0, "127.0.0.1", r));
  const a = host.address();
  if (!a || typeof a === "string") throw Error("Missing address");
  const target = `http://127.0.0.1:${a.port}`;
  try {
    const run = await runSuite({
      target,
      config: {
        ...config,
        implementation: {
          name: broken
            ? "Intentionally broken subset host"
            : "Reference subset host",
          version: "0.1.0",
        },
      },
      authorization,
    });
    const dir = await saveRun(run, root);
    await report(run, dir);
    await writeFile(
      resolve(dir, "claim.json"),
      JSON.stringify(claim(run), null, 2),
    );
    artifacts[broken ? "broken" : "reference"] = dir;
    process.stdout.write(
      `${broken ? "Broken" : "Reference"}: ${JSON.stringify(counts(run))}\n${dir}\n`,
    );
    const failures = run.results
      .filter((r) => r.status === "failed")
      .map((r) => r.definition.id);
    if (
      counts(run).inconclusive ||
      JSON.stringify(failures) !==
        JSON.stringify(
          broken ? ["AUTH-001", "STATE-001", "REPLAY-001", "REPLAY-002"] : [],
        )
    )
      throw new Error(
        "Demo results differed from expected behavioral controls",
      );
    if (broken) {
      await writeFile(resolve(dir, "issue.md"), issue(run));
      const replay = await runSuite({
        target,
        config,
        authorization,
        tests: ["STATE-001"],
        replayOf: run.run_id,
      });
      const replayDir = await saveRun(replay, root);
      await report(replay, replayDir);
      artifacts.replay = replayDir;
      if (replay.results[0]?.status !== "failed")
        throw new Error("Demo replay did not reproduce failure");
    }
  } finally {
    host.closeAllConnections();
    await new Promise<void>((r) => host.close(() => r()));
  }
}
await writeFile(
  resolve(root, "demo-latest.json"),
  JSON.stringify(artifacts, null, 2),
);
