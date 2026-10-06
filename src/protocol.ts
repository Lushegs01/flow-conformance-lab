import { createHash } from "node:crypto";
import { z } from "zod";
import type { Config } from "./model.js";
export const GENESIS = "hash:protocol-genesis";
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value !== null && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v))
        .join(",") +
      "}"
    );
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error("Non-JSON value");
  return encoded;
}
export function hash(value: unknown): string {
  return "hash:" + createHash("sha256").update(canonical(value)).digest("hex");
}
export const SessionSchema = z
  .object({
    id: z.string().min(1),
    protocol_version: z.literal("v0.1"),
    created_by_actor_id: z.string(),
    objective: z.string().min(1),
    human_worker_id: z.string(),
    agent_worker_id: z.string(),
    policy_id: z.string(),
    status: z.enum([
      "active",
      "waiting_on_human",
      "takeover",
      "reconciling",
      "completed",
      "failed",
      "cancelled",
      "closed",
    ]),
    revision: z.number().int().nonnegative(),
    last_event_hash: z.string().min(1),
    event_log_ref: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .passthrough();
export type Session = z.infer<typeof SessionSchema>;
export const EventSchema = z
  .object({
    id: z.string(),
    sequence: z.number().int().nonnegative(),
    type: z.string(),
    work_session_id: z.string(),
    actor_id: z.string(),
    timestamp: z.string(),
    payload: z.object({
      object_type: z.literal("work_session"),
      object_id: z.string(),
      action: z.string(),
    }),
    previous_hash: z.string(),
    event_hash: z.string(),
    canonicalization: z.object({
      serialization: z.literal("json-c14n"),
      hash_method: z.literal("sha256"),
      profile_ref: z.string().optional(),
    }),
  })
  .strict();
export type Event = z.infer<typeof EventSchema>;
export const ErrorSchema = z
  .object({
    error_id: z.string(),
    protocol_version: z.string(),
    object_type: z.string(),
    field: z.string(),
    reason: z.string(),
    remediation: z.string(),
    trace_id: z.string(),
  })
  .strict();
export function eventHash(e: Event) {
  const { event_hash: ignored, ...rest } = e;
  void ignored;
  return hash(rest);
}
export function makeEvent(
  s: Session,
  actor: string,
  eventId: string,
  action = "completed",
): Event {
  const event: Event = {
    id: eventId,
    sequence: s.revision + 1,
    type: `work_session.${action}`,
    work_session_id: s.id,
    actor_id: actor,
    timestamp: new Date().toISOString(),
    payload: { object_type: "work_session", object_id: s.id, action },
    previous_hash: s.last_event_hash,
    event_hash: "",
    canonicalization: { serialization: "json-c14n", hash_method: "sha256" },
  };
  event.event_hash = eventHash(event);
  return event;
}
export function createBody(c: Config, sessionId: string): Session {
  const now = new Date().toISOString();
  return {
    id: sessionId,
    protocol_version: "v0.1",
    created_by_actor_id: c.actor_id,
    objective: "Flow Conformance Lab isolated lifecycle probe",
    human_worker_id: c.human_worker_id,
    agent_worker_id: c.agent_worker_id,
    policy_id: c.policy_id,
    status: "active",
    revision: 1,
    last_event_hash: GENESIS,
    event_log_ref: `event-log:${sessionId}`,
    created_at: now,
    updated_at: now,
  };
}
