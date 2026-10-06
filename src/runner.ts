import { randomUUID } from "node:crypto";
import {
  Context,
  definitions,
  execute,
  ObservationFailure,
  PrerequisiteError,
} from "../suites/jarvis/core.js";
import {
  ConfigSchema,
  NOTICE,
  RunSchema,
  SOURCE,
  VERSION,
  type Config,
  type Result,
  type Run,
} from "./model.js";
import {
  redact,
  Transport,
  TransportError,
  validateTarget,
} from "./transport.js";

export interface RunOptions {
  target: string;
  config: Config;
  authorization: string;
  tests?: string[];
  timeout?: number;
  allowRemote?: boolean;
  signal?: AbortSignal;
  replayOf?: string;
}
export async function runSuite(options: RunOptions): Promise<Run> {
  ConfigSchema.parse(options.config);
  validateTarget(options.target, options.allowRemote);
  const timeout = options.timeout ?? 5000;
  if (!Number.isInteger(timeout) || timeout < 100 || timeout > 60000)
    throw new Error("Timeout must be 100..60000 ms");
  const selected = options.tests ?? definitions.map((d) => d.id);
  if (
    !selected.length ||
    new Set(selected).size !== selected.length ||
    selected.some((id) => !definitions.some((d) => d.id === id))
  )
    throw new Error("Unknown, empty or duplicate test selection");
  // Validate credentials before entering tests so configuration errors are not mislabeled as observations.
  new Transport(options.target, options.authorization, {
    timeout,
    allowRemote: options.allowRemote,
  });
  const started = performance.now();
  const startedAt = new Date().toISOString();
  const results: Result[] = [];
  for (const id of selected) {
    const definition = definitions.find((d) => d.id === id)!;
    const start = performance.now();
    const startAt = new Date().toISOString();
    const transport = new Transport(options.target, options.authorization, {
      timeout,
      allowRemote: options.allowRemote,
      signal: options.signal,
    });
    let status: Result["status"] = "passed";
    let observed = "";
    try {
      observed = await execute(id, new Context(options.config, transport));
    } catch (err) {
      status = err instanceof ObservationFailure ? "failed" : "inconclusive";
      observed =
        err instanceof ObservationFailure ||
        err instanceof TransportError ||
        err instanceof PrerequisiteError
          ? err.message
          : "Scenario prerequisite or execution unavailable.";
    }
    results.push({
      definition,
      status,
      started_at: startAt,
      finished_at: new Date().toISOString(),
      duration_ms: Math.round(performance.now() - start),
      exchanges: transport.exchanges,
      diagnostic: {
        failure_code:
          status === "passed"
            ? "none"
            : status === "failed"
              ? `${id}_behavior_mismatch`
              : "execution_incomplete",
        severity: status === "failed" ? "high" : "info",
        category: definition.category,
        expected: definition.expected,
        observed,
        protocol_requirement: definition.requirement,
        evidence: transport.exchanges.map((e) => e.sequence),
        reproduction: definition.reproduction,
        possible_causes: status === "failed" ? definition.possible_causes : [],
        confidence: status === "inconclusive" ? "limited" : "high",
        references: definition.references,
      },
    });
  }
  const run = {
    schema_version: "1",
    run_id: randomUUID(),
    protocol: "jarvis",
    protocol_version: "v0.1",
    protocol_commit: SOURCE,
    suite_version: VERSION,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    duration_ms: Math.round(performance.now() - started),
    target: options.target,
    config: options.config,
    selected_tests: selected,
    results,
    notice: NOTICE,
    limitations: [
      "Selected WorkSession/header/actor/replay subset only; full Jarvis compatibility is not proven.",
      "No PolicyDecision, Request/Review/Takeover, Contribution, EvidenceManifest, learning, memory, skill, outcome or extension suite.",
      "HTTP binding profile: transition payload uses the closed OpenAPI object/action shape; richer prose transition fields are incompatible with that schema at the pinned revision. See research.md.",
      "Snapshot equality cannot exclude hidden side effects or dishonest host reads.",
      "Replay reconstructs scenarios with fresh identifiers/timestamps; credentials and host provisioning are required.",
      "Raw exchanges are redacted JSON representations; malformed bytes and sensitive response headers are not retained.",
    ],
    ...(options.replayOf ? { replay_of: options.replayOf } : {}),
  };
  return RunSchema.parse(
    redact(run, [
      options.authorization,
      options.authorization.replace(/^\S+\s+/, ""),
    ]),
  );
}
export { definitions };
