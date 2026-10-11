import { z } from "zod";

export const SOURCE = "e0c4842a5fc62b304e0af9cbc823d0be1eb72adb";
export const VERSION = "0.2.0";
export const NOTICE =
  "Independent conformance evidence. Compatibility not proven. This is not an official certification.";
const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
export const ConfigSchema = z
  .object({
    implementation: z
      .object({
        name: z.string().min(1).max(160),
        version: z.string().min(1).max(80),
        commit: z.string().max(80).optional(),
      })
      .strict(),
    actor_id: id,
    unauthorized_actor_id: id,
    human_worker_id: id,
    agent_worker_id: id,
    policy_id: id,
    auth_env: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,100}$/),
  })
  .strict()
  .refine(
    (c) => c.actor_id !== c.unauthorized_actor_id,
    "Unauthorized actor must differ",
  );
export type Config = z.infer<typeof ConfigSchema>;
export const StatusSchema = z.enum([
  "passed",
  "failed",
  "skipped",
  "inconclusive",
]);
export const ExchangeSchema = z.object({
  sequence: z.number().int().nonnegative(),
  timestamp: z.string(),
  duration_ms: z.number().nonnegative(),
  request: z.object({
    method: z.enum(["GET", "POST"]),
    path: z.string(),
    headers: z.record(z.string(), z.string()),
    body: z.unknown().optional(),
  }),
  response: z
    .object({
      status: z.number().int(),
      headers: z.record(z.string(), z.string()),
      body: z.unknown(),
      normalized: z.unknown(),
    })
    .optional(),
  error: z.string().optional(),
});
export type Exchange = z.infer<typeof ExchangeSchema>;
export const DefinitionSchema = z.object({
  id: z.string().regex(/^[A-Z]+-\d{3}$/),
  version: z.string(),
  name: z.string(),
  category: z.string(),
  purpose: z.string(),
  requirement: z.string(),
  references: z.array(z.string().url()),
  expected: z.string(),
  setup: z.string(),
  reproduction: z.array(z.string()),
  possible_causes: z.array(z.string()),
});
export type Definition = z.infer<typeof DefinitionSchema>;
export const DiagnosticSchema = z.object({
  failure_code: z.string(),
  severity: z.enum(["info", "medium", "high"]),
  category: z.string(),
  expected: z.string(),
  observed: z.string(),
  protocol_requirement: z.string(),
  evidence: z.array(z.number()),
  reproduction: z.array(z.string()),
  possible_causes: z.array(z.string()),
  confidence: z.enum(["high", "limited"]),
  references: z.array(z.string()),
});
export const ResultSchema = z.object({
  definition: DefinitionSchema,
  status: StatusSchema,
  started_at: z.string(),
  finished_at: z.string(),
  duration_ms: z.number(),
  exchanges: z.array(ExchangeSchema).max(100),
  diagnostic: DiagnosticSchema,
});
export type Result = z.infer<typeof ResultSchema>;
export const RunSchema = z
  .object({
    schema_version: z.literal("1"),
    run_id: z.string().uuid(),
    protocol: z.literal("jarvis"),
    protocol_version: z.literal("v0.1"),
    protocol_commit: z.string(),
    suite_version: z.string(),
    started_at: z.string(),
    finished_at: z.string(),
    duration_ms: z.number(),
    target: z.string().max(2048),
    config: ConfigSchema,
    selected_tests: z.array(z.string()).min(1).max(50),
    results: z.array(ResultSchema).max(50),
    notice: z.string(),
    limitations: z.array(z.string()),
    replay_of: z.string().optional(),
  })
  .superRefine((r, ctx) => {
    if (
      new Set(r.selected_tests).size !== r.selected_tests.length ||
      r.results.length !== r.selected_tests.length ||
      r.results.some((t, i) => t.definition.id !== r.selected_tests[i])
    )
      ctx.addIssue({
        code: "custom",
        message: "Results must correspond exactly to selected tests",
      });
  });
export type Run = z.infer<typeof RunSchema>;
export function counts(run: Run) {
  const result = { passed: 0, failed: 0, skipped: 0, inconclusive: 0 };
  for (const test of run.results) result[test.status]++;
  return result;
}
export function exitCode(run: Run): number {
  const c = counts(run);
  return c.failed ? 1 : c.inconclusive || c.skipped ? 2 : 0;
}
