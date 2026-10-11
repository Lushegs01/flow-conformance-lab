import { randomUUID } from "node:crypto";
import { SOURCE, type Config, type Definition } from "../../src/model.js";
import {
  canonical,
  createBody,
  ErrorSchema,
  EventSchema,
  GENESIS,
  makeEvent,
  SessionSchema,
  eventHash,
  type Event,
  type Session,
} from "../../src/protocol.js";
import { Transport, TransportError, type Reply } from "../../src/transport.js";

const root = `https://github.com/Flow-Research/jarvis/blob/${SOURCE}/`;
const cases = [
  [
    "CORE-001",
    "Genesis, read and accepted event",
    "WorkSession",
    "Creation is active revision 1; a valid event advances revision exactly once and sets the exposed hash head.",
  ],
  [
    "HEADERS-001",
    "Required mutation headers",
    "Headers",
    "Each of the six missing mutation headers rejects with its named error, leaving the snapshot unchanged.",
  ],
  [
    "AUTH-001",
    "Unauthorized Actor cannot mutate",
    "Participants",
    "The configured unauthorized Actor rejects as unauthorized_actor before visible mutation.",
  ],
  [
    "AUTH-002",
    "Actor body binding",
    "Participants",
    "Body actor_id differing from Jarvis-Actor-Id rejects as actor_body_id_mismatch.",
  ],
  [
    "STATE-001",
    "Stale revision after accepted mutation",
    "WorkSession",
    "A fresh operation with an old expected revision rejects as stale_work_session_revision.",
  ],
  [
    "CHAIN-001",
    "Incorrect previous hash",
    "WorkSession",
    "A fresh operation with an incorrect previous hash rejects as invalid_previous_event_hash.",
  ],
  [
    "REPLAY-001",
    "Accepted request replay",
    "Replay",
    "Identical accepted payload and key return the original result, even with stale revision/hash headers, without changing state.",
  ],
  [
    "REPLAY-002",
    "Idempotency payload mismatch",
    "Replay",
    "A changed payload under an accepted key rejects as duplicate_idempotency_key_mismatch without changing state.",
  ],
  [
    "STATE-002",
    "Closed session is immutable",
    "WorkSession",
    "After completed -> closed, a fresh mutation rejects as sealed_work_session_mutation or mutation_after_closed.",
  ],
  [
    "CREATE-001",
    "Genesis requires objective and Policy",
    "WorkSession",
    "Genesis without policy_id rejects as missing_policy and without objective rejects as missing_objective; neither creates a WorkSession.",
  ],
  [
    "HEADERS-002",
    "Request timestamp tolerance",
    "Headers",
    "A mutation timestamped an hour in the past or an hour in the future (tolerance is five minutes past, sixty seconds future) rejects as stale_request_timestamp, leaving the snapshot unchanged.",
  ],
  [
    "HEADERS-003",
    "Unsupported protocol version",
    "Headers",
    "A mutation declaring an unsupported Jarvis-Protocol-Version rejects as unsupported_protocol_version, leaving the snapshot unchanged.",
  ],
  [
    "AUTH-003",
    "Reads require Actor read authority",
    "Participants",
    "Reading the WorkSession as the configured unauthorized Actor rejects as unauthorized_actor without returning the record.",
  ],
  [
    "PATH-001",
    "Path and body WorkSession binding",
    "WorkSession",
    "An event whose body work_session_id differs from the path WorkSession rejects as path_body_id_mismatch, leaving the snapshot unchanged.",
  ],
  [
    "EXPORT-001",
    "Export refused before a terminal state",
    "Evidence",
    "EvidenceManifest export of an active WorkSession rejects as invalid_evidence_export_state, leaving the snapshot unchanged.",
  ],
] as const;
const fixtures = root + "docs/conformance/fixtures/invalid/";
const extraReferences: Partial<Record<string, string[]>> = {
  "CREATE-001": [fixtures + "missing-policy.json"],
  "HEADERS-002": [
    root + "docs/protocol/15-openapi-communication-binding.md",
    fixtures + "stale-request-timestamp.json",
  ],
  "EXPORT-001": [fixtures + "invalid-evidence-export-state.json"],
};
const custom: Partial<
  Record<string, { setup: string; reproduction: string[] }>
> = {
  "CREATE-001": {
    setup:
      "Create an isolated WorkSession with configured human Actor, Workers and Policy and accept one human completion event as a positive control. Then submit genesis bodies that omit policy_id and objective.",
    reproduction: [
      "Provision the configured identities and policy in an isolated host tenant.",
      "Create a valid session using revision 0 and hash:protocol-genesis headers, and complete it.",
      "Submit a genesis body without policy_id, then one without objective, each with a fresh session ID.",
      "Expect missing_policy and missing_objective respectively.",
      "Read each rejected session ID and confirm no WorkSession was created.",
    ],
  },
  "EXPORT-001": {
    setup:
      "Create an isolated WorkSession with configured human Actor, Workers and Policy and read it with read headers only. While it is still active, request its EvidenceManifest export with the same read headers. Then accept one human completion event as a positive control.",
    reproduction: [
      "Provision the configured identities and policy in an isolated host tenant.",
      "Create a fresh session using revision 0 and hash:protocol-genesis headers.",
      "Read the snapshot with read headers only.",
      "Execute EXPORT-001: GET /work-sessions/{id}/export with read headers only while the session is active; expect invalid_evidence_export_state.",
      "Read the snapshot again, confirm it is unchanged, then append a valid human completion event.",
    ],
  },
};
export const definitions: Definition[] = cases.map(
  ([id, name, category, expected]) => ({
    id,
    name,
    category,
    expected,
    version: "1.0.0",
    purpose: `Exercise running-host behavior: ${name.toLowerCase()}.`,
    requirement: expected,
    setup:
      custom[id]?.setup ??
      "Create an isolated WorkSession with configured human Actor, Workers and Policy. Read it without mutation-only headers. Accept one human completion event as a positive control.",
    reproduction: custom[id]?.reproduction ?? [
      "Provision the configured identities and policy in an isolated host tenant.",
      "Create a fresh session using revision 0 and hash:protocol-genesis headers.",
      "Read the snapshot and append a valid human completion event.",
      `Execute ${id}: ${expected}`,
      "Read the snapshot again; compare status, revision, last_event_hash and complete exposed record.",
    ],
    possible_causes: [
      "Possible missing or incorrectly ordered host validation; the internal cause cannot be determined externally.",
    ],
    references: [
      root + "docs/protocol/04-work-sessions.md",
      root + "docs/openapi/jarvis-openapi.yaml",
      root + "docs/conformance/checklist.md",
      ...(extraReferences[id] ?? []),
    ],
  }),
);
export class ObservationFailure extends Error {}
export class PrerequisiteError extends Error {}
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new ObservationFailure(message);
}
function detail(reply: Reply) {
  const error = ErrorSchema.safeParse(reply.body);
  return `HTTP ${reply.status}${error.success ? `; error_id=${error.data.error_id}` : ""}`;
}
export class Context {
  constructor(
    readonly config: Config,
    readonly transport: Transport,
  ) {}
  reads() {
    return {
      "Jarvis-Protocol-Version": "v0.1",
      "Jarvis-Actor-Id": this.config.actor_id,
    };
  }
  headers(s?: Session, key = randomUUID()): Record<string, string> {
    return {
      ...this.reads(),
      "Jarvis-Idempotency-Key": key,
      "Jarvis-Request-Timestamp": new Date().toISOString(),
      "Jarvis-Expected-WorkSession-Revision": String(s?.revision ?? 0),
      "Jarvis-Previous-Event-Hash": s?.last_event_hash ?? GENESIS,
    };
  }
  async read(id: string): Promise<Session> {
    const reply = await this.transport.call(
      "GET",
      `/work-sessions/${id}`,
      this.reads(),
    );
    if (reply.status !== 200)
      throw new PrerequisiteError(
        `Snapshot read unavailable: ${detail(reply)}.`,
      );
    const parsed = SessionSchema.safeParse(reply.body);
    if (!parsed.success)
      throw new PrerequisiteError(
        "Snapshot did not match the required WorkSession shape.",
      );
    assert(
      parsed.data.id === id,
      "Read returned a different WorkSession identity.",
    );
    return parsed.data;
  }
  async create(): Promise<Session> {
    const body = createBody(this.config, `ws-${randomUUID()}`);
    const reply = await this.transport.call(
      "POST",
      "/work-sessions",
      this.headers(),
      body,
    );
    if (reply.status !== 201)
      throw new PrerequisiteError(
        `Valid genesis prerequisite not accepted: ${detail(reply)}. Check host provisioning.`,
      );
    const parsed = SessionSchema.safeParse(reply.body);
    if (!parsed.success)
      throw new PrerequisiteError("Genesis returned a malformed WorkSession.");
    const s = parsed.data;
    assert(
      s.id === body.id &&
        s.status === "active" &&
        s.revision === 1 &&
        s.last_event_hash !== GENESIS,
      "Genesis must return the requested active session at revision 1 with an event hash.",
    );
    assert(
      s.created_by_actor_id === body.created_by_actor_id &&
        s.policy_id === body.policy_id &&
        s.human_worker_id === body.human_worker_id &&
        s.agent_worker_id === body.agent_worker_id,
      "Genesis changed supplied Actor, Worker or Policy identities.",
    );
    const read = await this.read(s.id);
    assert(
      canonical(read) === canonical(s),
      "Creation result differs from stored snapshot.",
    );
    return s;
  }
  async append(
    s: Session,
    event: Event,
    headers = this.headers(s),
  ): Promise<Reply> {
    return this.transport.call(
      "POST",
      `/work-sessions/${s.id}/events`,
      headers,
      event,
    );
  }
  async accepted(s: Session, action = "completed") {
    const event = makeEvent(
      s,
      this.config.actor_id,
      `event-${randomUUID()}`,
      action,
    );
    const headers = this.headers(s);
    const reply = await this.append(s, event, headers);
    if (reply.status !== 201)
      throw new PrerequisiteError(
        `Positive control not accepted: ${detail(reply)}. Scenario cannot isolate its negative gate.`,
      );
    const parsed = EventSchema.safeParse(reply.body);
    assert(
      parsed.success,
      "Accepted append did not return a valid JarvisEvent.",
    );
    assert(
      canonical(reply.body) === canonical(event),
      "Accepted event differs from the supplied canonical event.",
    );
    const next = await this.read(s.id);
    assert(
      next.revision === s.revision + 1 &&
        next.last_event_hash === event.event_hash &&
        next.status === action,
      `Accepted ${action}: expected revision ${s.revision + 1}, event head and status ${action}; observed revision ${next.revision}, status ${next.status}.`,
    );
    return { next, event, headers, reply };
  }
  exportManifest(id: string): Promise<Reply> {
    return this.transport.call(
      "GET",
      `/work-sessions/${id}/export`,
      this.reads(),
    );
  }
  async reject(
    s: Session,
    event: Event,
    headers: Record<string, string>,
    errors: string[],
  ) {
    await this.rejectWith(s, () => this.append(s, event, headers), errors);
  }
  async rejectWith(s: Session, send: () => Promise<Reply>, errors: string[]) {
    const reply = await send();
    const after = await this.read(s.id);
    const parsed = ErrorSchema.safeParse(reply.body);
    assert(
      reply.status >= 400 &&
        reply.status < 500 &&
        parsed.success &&
        errors.includes(parsed.data.error_id) &&
        canonical(after) === canonical(s),
      `Expected ${errors.join(" or ")} and unchanged state; observed ${detail(reply)}, revision ${s.revision} -> ${after.revision}, status ${s.status} -> ${after.status}, snapshot ${canonical(after) === canonical(s) ? "unchanged" : "changed"}.`,
    );
  }
  async rejectGenesis(body: Record<string, unknown>, errors: string[]) {
    const reply = await this.transport.call(
      "POST",
      "/work-sessions",
      this.headers(),
      body,
    );
    let readable: boolean;
    try {
      const lookup = await this.transport.call(
        "GET",
        `/work-sessions/${String(body.id)}`,
        this.reads(),
      );
      readable = lookup.status === 200;
    } catch (err) {
      // A non-JSON answer (for example a plain 404 page) still means no WorkSession is readable.
      if (err instanceof TransportError && err.code === "non_json_response")
        readable = false;
      else throw err;
    }
    const parsed = ErrorSchema.safeParse(reply.body);
    assert(
      reply.status >= 400 &&
        reply.status < 500 &&
        parsed.success &&
        errors.includes(parsed.data.error_id) &&
        !readable,
      `Expected ${errors.join(" or ")} and no WorkSession created; observed ${detail(reply)}, rejected session ID ${readable ? "readable" : "not readable"}.`,
    );
  }
}
export async function execute(id: string, c: Context): Promise<string> {
  if (id === "EXPORT-001") {
    const active = await c.create();
    await c.rejectWith(active, () => c.exportManifest(active.id), [
      "invalid_evidence_export_state",
    ]);
    await c.accepted(active);
    return "Export of the active session rejected as invalid_evidence_export_state with an unchanged snapshot; the session then accepted its completion.";
  }
  const initial = await c.create();
  const accepted = await c.accepted(initial);
  const s = accepted.next;
  if (id === "CORE-001")
    return "Genesis, minimal-header read, accepted event, revision increment and stored hash head matched the selected contract.";
  const event = makeEvent(
    s,
    c.config.actor_id,
    `event-${randomUUID()}`,
    "closed",
  );
  switch (id) {
    case "HEADERS-001": {
      const gates: Record<string, string> = {
        "Jarvis-Protocol-Version": "missing_protocol_version",
        "Jarvis-Actor-Id": "missing_actor",
        "Jarvis-Idempotency-Key": "missing_idempotency_key",
        "Jarvis-Request-Timestamp": "missing_request_timestamp",
        "Jarvis-Expected-WorkSession-Revision":
          "missing_expected_work_session_revision",
        "Jarvis-Previous-Event-Hash": "missing_previous_event_hash",
      };
      for (const [header, error] of Object.entries(gates)) {
        const h = c.headers(s);
        delete h[header];
        await c.reject(s, event, h, [error]);
      }
      break;
    }
    case "AUTH-001": {
      event.actor_id = c.config.unauthorized_actor_id;
      event.event_hash = eventHash(event);
      await c.reject(
        s,
        event,
        { ...c.headers(s), "Jarvis-Actor-Id": c.config.unauthorized_actor_id },
        ["unauthorized_actor"],
      );
      break;
    }
    case "AUTH-002":
      event.actor_id = c.config.unauthorized_actor_id;
      event.event_hash = eventHash(event);
      await c.reject(s, event, c.headers(s), ["actor_body_id_mismatch"]);
      break;
    case "STATE-001":
      await c.reject(
        s,
        event,
        {
          ...c.headers(s),
          "Jarvis-Expected-WorkSession-Revision": String(initial.revision),
        },
        ["stale_work_session_revision"],
      );
      break;
    case "CHAIN-001":
      await c.reject(
        s,
        event,
        { ...c.headers(s), "Jarvis-Previous-Event-Hash": GENESIS },
        ["invalid_previous_event_hash"],
      );
      break;
    case "REPLAY-001": {
      const reply = await c.append(s, accepted.event, accepted.headers);
      const after = await c.read(s.id);
      assert(
        reply.status === accepted.reply.status &&
          canonical(reply.body) === canonical(accepted.reply.body) &&
          canonical(after) === canonical(s),
        `Replay expected original result and unchanged state; observed ${detail(reply)}, revision ${s.revision} -> ${after.revision}, original response ${canonical(reply.body) === canonical(accepted.reply.body) ? "preserved" : "not preserved"}.`,
      );
      break;
    }
    case "REPLAY-002":
      await c.reject(
        s,
        event,
        {
          ...c.headers(s),
          "Jarvis-Idempotency-Key": accepted.headers["Jarvis-Idempotency-Key"]!,
        },
        ["duplicate_idempotency_key_mismatch"],
      );
      break;
    case "STATE-002": {
      const closed = await c.accepted(s, "closed");
      await c.reject(
        closed.next,
        makeEvent(closed.next, c.config.actor_id, `event-${randomUUID()}`),
        c.headers(closed.next),
        ["sealed_work_session_mutation", "mutation_after_closed"],
      );
      break;
    }
    case "CREATE-001": {
      const gates = [
        ["policy_id", "missing_policy"],
        ["objective", "missing_objective"],
      ] as const;
      for (const [field, error] of gates) {
        const body: Record<string, unknown> = {
          ...createBody(c.config, `ws-${randomUUID()}`),
        };
        delete body[field];
        await c.rejectGenesis(body, [error]);
      }
      break;
    }
    case "HEADERS-002":
      for (const offset of [-3600000, 3600000])
        await c.reject(
          s,
          event,
          {
            ...c.headers(s),
            "Jarvis-Request-Timestamp": new Date(
              Date.now() + offset,
            ).toISOString(),
          },
          ["stale_request_timestamp"],
        );
      break;
    case "HEADERS-003":
      await c.reject(
        s,
        event,
        { ...c.headers(s), "Jarvis-Protocol-Version": "v99.0" },
        ["unsupported_protocol_version"],
      );
      break;
    case "AUTH-003":
      await c.rejectWith(
        s,
        () =>
          c.transport.call("GET", `/work-sessions/${s.id}`, {
            ...c.reads(),
            "Jarvis-Actor-Id": c.config.unauthorized_actor_id,
          }),
        ["unauthorized_actor"],
      );
      break;
    case "PATH-001": {
      const misbound = { ...event, work_session_id: `ws-${randomUUID()}` };
      misbound.event_hash = eventHash(misbound);
      await c.reject(s, misbound, c.headers(s), ["path_body_id_mismatch"]);
      break;
    }
    default:
      throw new Error("Unknown test");
  }
  return "Expected protocol result observed; the complete exposed WorkSession snapshot stayed unchanged after the challenged request.";
}
