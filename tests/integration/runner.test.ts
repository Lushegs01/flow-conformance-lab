import { afterEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHost } from "../../examples/host.js";
import { runSuite } from "../../src/runner.js";
import { ConfigSchema, counts, exitCode } from "../../src/model.js";
import { claim, issue, loadRun, saveRun } from "../../src/evidence.js";
const config = ConfigSchema.parse(
  JSON.parse(await readFile("examples/target.json", "utf8")),
);
const authorization = "Bearer integration-credential-never-persist";
const servers: Server[] = [];
async function start(broken = false) {
  const server = createHost({ authorization, broken });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw Error();
  return `http://127.0.0.1:${addr.port}`;
}
afterEach(async () => {
  for (const s of servers.splice(0)) {
    s.closeAllConnections();
    await new Promise<void>((resolve) => s.close(() => resolve()));
  }
});
describe("actual HTTP scenario evidence", () => {
  it("reference subset passes all fifteen scenarios including six distinct header gates", async () => {
    const run = await runSuite({
      target: await start(),
      config,
      authorization,
    });
    expect(counts(run)).toEqual({
      passed: 15,
      failed: 0,
      inconclusive: 0,
      skipped: 0,
    });
    expect(exitCode(run)).toBe(0);
    expect(
      run.results
        .find((r) => r.definition.id === "HEADERS-001")!
        .exchanges.filter((e) => e.response?.status === 400),
    ).toHaveLength(6);
    expect(JSON.stringify(run)).not.toContain("integration-credential");
  });
  it("broken real gates fail predictably, replay fails again, issue and claim retain boundaries", async () => {
    const target = await start(true);
    const run = await runSuite({ target, config, authorization });
    expect(
      run.results
        .filter((r) => r.status === "failed")
        .map((r) => r.definition.id),
    ).toEqual([
      "AUTH-001",
      "STATE-001",
      "REPLAY-001",
      "REPLAY-002",
      "AUTH-003",
      "EXPORT-001",
    ]);
    const observed = (id: string) =>
      run.results.find((r) => r.definition.id === id)!.diagnostic.observed;
    expect(observed("AUTH-003")).toContain("HTTP 200");
    expect(observed("EXPORT-001")).toContain("error_id=invalid_export");
    expect(exitCode(run)).toBe(1);
    const replay = await runSuite({
      target,
      config,
      authorization,
      tests: ["STATE-001"],
      replayOf: run.run_id,
    });
    expect(replay.results[0]!.status).toBe("failed");
    expect(replay.results[0]!.exchanges[0]!.request.body).not.toEqual(
      run.results[4]!.exchanges[0]!.request.body,
    );
    const markdown = issue(run, "STATE-001");
    expect(markdown).toContain("revision 2 -> 3");
    expect(markdown).toContain("cannot be determined externally");
    expect(claim(run).status).toBe("Compatibility Not Proven");
    const dir = await saveRun(
      run,
      await mkdtemp(join(tmpdir(), "flow-evidence-")),
    );
    expect(await loadRun(dir)).toEqual(run);
    await writeFile(join(dir, "tests", "AUTH-001.json"), "{}");
    await expect(loadRun(dir)).rejects.toThrow("hash mismatch");
  });
  it("unavailable credentials and cancellation never yield passes", async () => {
    const target = await start();
    const bad = await runSuite({
      target,
      config,
      authorization: "Bearer invalid",
      tests: ["CORE-001"],
    });
    expect(exitCode(bad)).toBe(2);
    expect(bad.results[0]!.status).toBe("inconclusive");
    const controller = new AbortController();
    controller.abort();
    const cancelled = await runSuite({
      target,
      config,
      authorization,
      signal: controller.signal,
    });
    expect(counts(cancelled).inconclusive).toBe(15);
    expect(exitCode(cancelled)).toBe(2);
  });
});
