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
import { Transport, type Reply } from "../../src/transport.js";

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
] as const;
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
      "Create an isolated WorkSession with configured human Actor, Workers and Policy. Read it without mutation-only headers. Accept one human completion event as a positive control.",
    reproduction: [
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
  async reject(
    s: Session,
    event: Event,
    headers: Record<string, string>,
    errors: string[],
  ) {
    const reply = await this.append(s, event, headers);
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
}
export async function execute(id: string, c: Context): Promise<string> {
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
    default:
      throw new Error("Unknown test");
  }
  return "Expected protocol result observed; the complete exposed WorkSession snapshot stayed unchanged after the challenged request.";
}
