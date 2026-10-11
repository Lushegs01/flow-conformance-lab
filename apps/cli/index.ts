#!/usr/bin/env node
import { Command, CommanderError } from "commander";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import {
  ConfigSchema,
  counts,
  exitCode,
  NOTICE,
  SOURCE,
  VERSION,
  type Run,
} from "../../src/model.js";
import { definitions, runSuite } from "../../src/runner.js";
import {
  boundedRead,
  claim,
  issue,
  loadRun,
  saveRun,
} from "../../src/evidence.js";
import { report } from "../../src/report.js";
// The package version identifies the CLI release; VERSION is the scenario suite version recorded in runs.
const { version: packageVersion } = JSON.parse(
  readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
) as { version: string };
const program = new Command()
  .name("flow-conformance")
  .description(NOTICE)
  .version(`${packageVersion} (suite ${VERSION})`)
  .exitOverride();
program.configureOutput({
  outputError: () =>
    process.stderr.write("Invalid command or arguments. Use --help.\n"),
});
interface Options {
  config?: string;
  baseUrl?: string;
  output?: string;
  json?: boolean;
  verbose?: boolean;
  test?: string[];
  suite?: string;
  timeout?: string;
  allowRemote?: boolean;
}
function runPath(value: string) {
  return /^[a-f0-9-]{36}$/.test(value)
    ? resolve("runs", value)
    : resolve(value);
}
function output(value: unknown, json?: boolean) {
  process.stdout.write(
    json ? JSON.stringify(value) + "\n" : String(value) + "\n",
  );
}
function summary(run: Run, dir: string, json?: boolean, verbose?: boolean) {
  if (json) {
    output({ ...run, evidence_directory: dir }, true);
    return;
  }
  const c = counts(run);
  output(
    `${NOTICE}\n${run.config.implementation.name} ${run.config.implementation.version} | Jarvis ${run.protocol_version} | suite ${run.suite_version}\n${run.results.length} tests: ${c.passed} passed, ${c.failed} failed, ${c.skipped} skipped, ${c.inconclusive} inconclusive`,
  );
  for (const r of run.results)
    if (verbose || r.status !== "passed")
      output(
        `\n${r.definition.id} ${r.status.toUpperCase()} — ${r.definition.name}\nExpected: ${r.diagnostic.expected}\nObserved: ${r.diagnostic.observed}\nConfidence: ${r.diagnostic.confidence}${r.status === "failed" ? `\nPossible cause: ${r.diagnostic.possible_causes.join(" ")}` : ""}`,
      );
  output(`\nEvidence: ${dir}\nInspector: ${resolve(dir, "report/index.html")}`);
}
function executionOptions(command: Command) {
  return command
    .option(
      "--config <file>",
      "Host identities; default: examples/target.json, or recorded config during replay",
    )
    .option("--base-url <url>", "Explicit target URL")
    .option("--output <directory>", "Evidence root", "runs")
    .option(
      "--suite <name>",
      "Suite: core (selected WorkSession subset)",
      "core",
    )
    .option("--test <id...>", "Select scenario IDs")
    .option("--timeout <ms>", "Per-request deadline, 100..60000", "5000")
    .option("--allow-remote", "Allow explicitly selected public HTTPS target")
    .option("--json", "Write machine-readable JSON")
    .option("--verbose", "Show every scenario");
}
async function execute(
  target: string | undefined,
  opts: Options,
  previous?: Run,
) {
  const baseUrl = target ?? opts.baseUrl;
  if (!baseUrl) throw new Error("Provide a target URL");
  if (opts.suite !== "core")
    throw new Error("Only the core suite is implemented");
  const config = opts.config
    ? ConfigSchema.parse(
        JSON.parse(await boundedRead(resolve(opts.config), 65536)),
      )
    : (previous?.config ??
      ConfigSchema.parse(
        JSON.parse(await boundedRead(resolve("examples/target.json"), 65536)),
      ));
  const authorization = process.env[config.auth_env];
  if (!authorization)
    throw new Error("Credential environment variable is missing");
  const selected = opts.test ?? previous?.selected_tests;
  if (previous && selected?.some((id) => !previous.selected_tests.includes(id)))
    throw new Error("Replay selection must be present in the recorded run");
  if (
    previous &&
    (previous.suite_version !== VERSION ||
      previous.protocol_commit !== SOURCE ||
      previous.results.some(
        (r) =>
          definitions.find((d) => d.id === r.definition.id)?.version !==
          r.definition.version,
      ))
  )
    throw new Error("Replay requires matching suite, source and test versions");
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once("SIGINT", cancel);
  process.once("SIGTERM", cancel);
  try {
    const run = await runSuite({
      target: baseUrl,
      config,
      authorization,
      tests: selected,
      timeout: Number(opts.timeout),
      allowRemote: opts.allowRemote,
      signal: controller.signal,
      replayOf: previous?.run_id,
    });
    const dir = await saveRun(run, resolve(opts.output!));
    await report(run, dir);
    summary(run, dir, opts.json, opts.verbose);
    process.exitCode = exitCode(run);
  } finally {
    process.removeListener("SIGINT", cancel);
    process.removeListener("SIGTERM", cancel);
  }
}
executionOptions(
  program
    .command("test [target]")
    .description(
      "Mutating tests: use an isolated tenant with permission to create sessions",
    ),
).action(async (target: string | undefined, opts: Options) =>
  execute(target, opts),
);
executionOptions(
  program
    .command("replay <run>")
    .description(
      "Reconstruct recorded scenarios with fresh IDs; explicit target and credentials required",
    ),
).action(async (value: string, opts: Options) =>
  execute(undefined, opts, await loadRun(runPath(value))),
);
program
  .command("list-tests")
  .option("--json")
  .action((opts) =>
    output(
      opts.json
        ? definitions
        : definitions
            .map((d) => `${d.id}  ${d.category.padEnd(12)} ${d.name}`)
            .join("\n"),
      opts.json,
    ),
  );
program
  .command("version")
  .action(() =>
    output(
      `flow-conformance ${packageVersion} (suite ${VERSION}); Jarvis v0.1 at ${SOURCE}`,
    ),
  );
program
  .command("inspect <run>")
  .option("--json")
  .action(async (value, opts) => {
    const run = await loadRun(runPath(value));
    if (opts.json) output(run, true);
    else summary(run, runPath(value), false, true);
  });
program
  .command("report <run>")
  .action(async (value) =>
    output(await report(await loadRun(runPath(value)), runPath(value))),
  );
program
  .command("claim <run>")
  .description(
    "Generate a self-attested subset claim; full compatibility remains unproven",
  )
  .action(async (value) => output(claim(await loadRun(runPath(value))), true));
program
  .command("issue <run>")
  .option("--test <id>")
  .option("--output <file>")
  .description("Generate Markdown for review; never publishes")
  .action(async (value, opts) => {
    const text = issue(await loadRun(runPath(value)), opts.test);
    if (opts.output) {
      await writeFile(resolve(opts.output), text, { flag: "wx", mode: 0o600 });
      output(resolve(opts.output));
    } else output(text);
  });
try {
  await program.parseAsync();
} catch (error) {
  // Do not echo parser values, URLs, JSON contents, environment values or network errors.
  if (error instanceof CommanderError && error.exitCode === 0)
    process.exitCode = 0;
  else {
    output(
      {
        error: "configuration_or_evidence_error",
        message:
          "Check command options, target policy, credential environment, config schema and evidence integrity. No credentials or raw error details are printed.",
      },
      true,
    );
    process.exitCode = 2;
  }
}
