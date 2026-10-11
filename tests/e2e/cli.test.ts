import { afterEach, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import type { Server } from "node:http";
import { createHost } from "../../examples/host.js";
const servers: Server[] = [];
const credential = "Bearer cli-e2e-credential-not-for-output";
const cli = (args: string[], auth = credential) =>
  new Promise<{ code: number | null; stdout: string; stderr: string }>(
    (done, reject) => {
      const child = spawn(
        process.execPath,
        ["dist/apps/cli/index.js", ...args],
        {
          env: { ...process.env, FLOW_AUTHORIZATION: auth },
          windowsHide: true,
        },
      );
      let stdout = "",
        stderr = "";
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error("CLI timeout"));
      }, 15000);
      child.stdout.on("data", (b) => (stdout += String(b)));
      child.stderr.on("data", (b) => (stderr += String(b)));
      child.on("error", reject);
      child.on("close", (code) => {
        clearTimeout(timer);
        done({ code, stdout, stderr });
      });
    },
  );
async function target(broken: boolean) {
  const host = createHost({ authorization: credential, broken });
  servers.push(host);
  await new Promise<void>((r) => host.listen(0, "127.0.0.1", r));
  const a = host.address();
  if (!a || typeof a === "string") throw Error();
  return `http://127.0.0.1:${a.port}`;
}
afterEach(async () => {
  for (const s of servers.splice(0)) {
    s.closeAllConnections();
    await new Promise<void>((r) => s.close(() => r()));
  }
});
it("CLI executes both hosts, produces parseable JSON, replays, verifies and generates reports/issues/claims", async () => {
  const output = await mkdtemp(join(tmpdir(), "flow-cli-"));
  const good = await cli([
    "test",
    await target(false),
    "--output",
    output,
    "--json",
  ]);
  expect(good.code).toBe(0);
  const passed = JSON.parse(good.stdout);
  expect(passed.results).toHaveLength(9);
  const url = await target(true);
  const bad = await cli(["test", url, "--output", output, "--json"]);
  expect(bad.code).toBe(1);
  expect(bad.stdout).not.toContain("cli-e2e-credential");
  const run = JSON.parse(bad.stdout);
  const dir = run.evidence_directory;
  const inspection = await cli(["inspect", dir, "--json"]);
  expect(inspection.code).toBe(0);
  expect(JSON.parse(inspection.stdout).run_id).toBe(run.run_id);
  const replay = await cli([
    "replay",
    dir,
    "--base-url",
    url,
    "--test",
    "STATE-001",
    "--output",
    output,
    "--json",
  ]);
  expect(replay.code).toBe(1);
  expect(JSON.parse(replay.stdout).replay_of).toBe(run.run_id);
  expect((await cli(["replay", dir])).code).toBe(2);
  expect((await cli(["report", dir])).code).toBe(0);
  const html = await readFile(join(dir, "report/index.html"), "utf8");
  expect(html).toContain("Content-Security-Policy");
  expect(html).toContain("connect-src &#39;none&#39;".replaceAll("&#39;", "'"));
  expect(html).not.toContain("cli-e2e-credential");
  const issueFile = join(output, "issue.md");
  expect(
    (await cli(["issue", dir, "--test", "STATE-001", "--output", issueFile]))
      .code,
  ).toBe(0);
  expect(await readFile(issueFile, "utf8")).toContain("## Observed");
  const claim = await cli(["claim", dir]);
  expect(JSON.parse(claim.stdout).claim.Verifier).toBe("self-attested");
  expect((await cli(["test", url, "--suite", "takeover", "--json"])).code).toBe(
    2,
  );
  expect(
    (await cli(["test", url, "--test", "DOES-NOT-EXIST", "--json"])).code,
  ).toBe(2);
  expect((await cli(["unknown-command"])).code).toBe(2);
  expect((await cli(["test", url, "--invalid-option"])).code).toBe(2);
  expect((await cli(["--help"])).code).toBe(0);
  const { version } = JSON.parse(await readFile("package.json", "utf8"));
  expect((await cli(["--version"])).stdout.trim()).toBe(
    `${version} (suite 0.1.0)`,
  );
  const authFailure = await cli(
    ["test", url, "--test", "CORE-001", "--output", output, "--json"],
    "Bearer wrong",
  );
  expect(authFailure.code).toBe(2);
  const escapedConfig = JSON.parse(
    await readFile("examples/target.json", "utf8"),
  );
  escapedConfig.implementation.name = "</script><img src=x onerror=alert(1)>";
  const configPath = resolve(output, "hostile.json");
  await writeFile(configPath, JSON.stringify(escapedConfig));
  const hostile = await cli([
    "test",
    url,
    "--config",
    configPath,
    "--test",
    "CORE-001",
    "--output",
    output,
    "--json",
  ]);
  const hostileRun = JSON.parse(hostile.stdout);
  const hostileHtml = await readFile(
    join(hostileRun.evidence_directory, "report/index.html"),
    "utf8",
  );
  expect(hostileHtml).not.toContain("</script><img");
  expect(hostileHtml).toContain("\\u003c/script\\u003e");
});
