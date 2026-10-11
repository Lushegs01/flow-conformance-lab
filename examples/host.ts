import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  canonical,
  EventSchema,
  eventHash,
  GENESIS,
  makeEvent,
  SessionSchema,
  type Session,
} from "../src/protocol.js";

/** Deliberate subset host, not a complete Jarvis implementation. Broken mode removes real enforcement. */
export function createHost(options: {
  broken?: boolean;
  authorization: string;
  maxSessions?: number;
}): Server {
  const sessions = new Map<string, Session>();
  const cache = new Map<string, { fingerprint: string; body: unknown }>();
  const server = createServer(async (req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Jarvis-Protocol-Version": "v0.1",
      });
      res.end(JSON.stringify(body));
    };
    const fail = (id: string, field = "request", objectType = "work_session") =>
      send(400, {
        error_id: id,
        protocol_version: "v0.1",
        object_type: objectType,
        field,
        reason: `Rejected: ${id}`,
        remediation: "Correct the request and use current authorized state.",
        trace_id: `trace:${randomUUID()}`,
      });
    try {
      if (req.headers.authorization !== options.authorization) {
        fail("unauthorized_actor");
        return;
      }
      if (!req.headers["jarvis-protocol-version"]) {
        fail("missing_protocol_version");
        return;
      }
      if (req.headers["jarvis-protocol-version"] !== "v0.1") {
        fail("unsupported_protocol_version");
        return;
      }
      const actor = req.headers["jarvis-actor-id"];
      if (typeof actor !== "string") {
        fail("missing_actor");
        return;
      }
      // Broken host really treats any authenticated caller's chosen Actor header as authority.
      if (!options.broken && actor !== "actor-human-lab") {
        fail("unauthorized_actor");
        return;
      }
      const match =
        /^\/work-sessions\/([A-Za-z0-9._:-]+)(\/events|\/export)?$/.exec(
          req.url ?? "",
        );
      if (req.method === "GET" && match && !match[2]) {
        const s = sessions.get(match[1]!);
        if (!s) {
          fail("unknown_state");
          return;
        }
        send(200, s);
        return;
      }
      if (req.method === "GET" && match?.[2] === "/export") {
        const s = sessions.get(match[1]!);
        if (!s) {
          fail("unknown_state");
          return;
        }
        // Broken mode omits the export state gate.
        if (
          !options.broken &&
          !["completed", "failed", "cancelled", "closed"].includes(s.status)
        ) {
          fail("invalid_evidence_export_state", "status", "evidence_manifest");
          return;
        }
        // The subset host records no Contributions or evidence items, so it cannot build a schema-valid EvidenceManifest.
        fail("invalid_export", "evidence_item_refs", "evidence_manifest");
        return;
      }
      if (
        req.method !== "POST" ||
        (req.url !== "/work-sessions" && match?.[2] !== "/events")
      ) {
        send(404, { error: "not_found" });
        return;
      }
      const gates: Record<string, string> = {
        "jarvis-idempotency-key": "missing_idempotency_key",
        "jarvis-request-timestamp": "missing_request_timestamp",
        "jarvis-expected-worksession-revision":
          "missing_expected_work_session_revision",
        "jarvis-previous-event-hash": "missing_previous_event_hash",
      };
      for (const [header, error] of Object.entries(gates))
        if (typeof req.headers[header] !== "string") {
          fail(error, header);
          return;
        }
      const timestamp = Date.parse(
        String(req.headers["jarvis-request-timestamp"]),
      );
      // Tolerance is five minutes in the past and sixty seconds in the future.
      if (
        !Number.isFinite(timestamp) ||
        Date.now() - timestamp > 300000 ||
        timestamp - Date.now() > 60000
      ) {
        fail("stale_request_timestamp");
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of req) {
        const buffer = Buffer.from(chunk as Uint8Array);
        size += buffer.length;
        if (size > 65536) {
          send(413, { error: "request_too_large" });
          req.destroy();
          return;
        }
        chunks.push(buffer);
      }
      let body: unknown;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        fail("invalid_transition");
        return;
      }
      const key = String(req.headers["jarvis-idempotency-key"]);
      const fingerprint = canonical({
        actor,
        version: req.headers["jarvis-protocol-version"],
        operation: req.url,
        body,
      });
      const cached = cache.get(key);
      if (cached && !options.broken) {
        if (cached.fingerprint !== fingerprint) {
          fail("duplicate_idempotency_key_mismatch");
          return;
        }
        send(201, cached.body);
        return;
      }
      if (cache.size >= 10000) {
        send(503, { error: "demo_capacity" });
        return;
      }
      if (req.url === "/work-sessions") {
        const fields = (body ?? {}) as Record<string, unknown>;
        if (typeof fields.objective !== "string" || !fields.objective) {
          fail("missing_objective", "objective");
          return;
        }
        if (typeof fields.policy_id !== "string" || !fields.policy_id) {
          fail("missing_policy", "policy_id");
          return;
        }
        const parsed = SessionSchema.safeParse(body);
        if (!parsed.success) {
          fail("invalid_transition");
          return;
        }
        const input = parsed.data;
        if (input.created_by_actor_id !== actor) {
          fail("actor_body_id_mismatch");
          return;
        }
        if (
          input.human_worker_id !== "worker-human-lab" ||
          input.agent_worker_id !== "worker-agent-lab" ||
          input.policy_id !== "policy-lab"
        ) {
          fail("missing_policy");
          return;
        }
        if (req.headers["jarvis-expected-worksession-revision"] !== "0") {
          fail("stale_work_session_revision");
          return;
        }
        if (req.headers["jarvis-previous-event-hash"] !== GENESIS) {
          fail("invalid_previous_event_hash");
          return;
        }
        if (sessions.has(input.id)) {
          fail("invalid_transition");
          return;
        }
        if (sessions.size >= (options.maxSessions ?? 1000)) {
          send(503, { error: "demo_capacity" });
          return;
        }
        const genesis = makeEvent(
          { ...input, revision: 0, last_event_hash: GENESIS },
          actor,
          `event-${randomUUID()}`,
          "created",
        );
        const s: Session = {
          ...input,
          status: "active",
          revision: 1,
          last_event_hash: genesis.event_hash,
        };
        sessions.set(s.id, s);
        cache.set(key, { fingerprint, body: s });
        send(201, s);
        return;
      }
      const parsed = EventSchema.safeParse(body);
      if (!parsed.success) {
        fail("invalid_transition");
        return;
      }
      const event = parsed.data;
      const s = sessions.get(match![1]!);
      if (!s) {
        fail("unknown_state");
        return;
      }
      if (event.work_session_id !== s.id) {
        fail("path_body_id_mismatch");
        return;
      }
      if (event.actor_id !== actor) {
        fail("actor_body_id_mismatch");
        return;
      }
      if (s.status === "closed") {
        fail("sealed_work_session_mutation");
        return;
      }
      // Broken mode intentionally omits revision validation, a real lost-update bug.
      if (
        !options.broken &&
        Number(req.headers["jarvis-expected-worksession-revision"]) !==
          s.revision
      ) {
        fail("stale_work_session_revision");
        return;
      }
      if (req.headers["jarvis-previous-event-hash"] !== s.last_event_hash) {
        fail("invalid_previous_event_hash");
        return;
      }
      if (
        event.previous_hash !== s.last_event_hash ||
        event.sequence !== s.revision + 1 ||
        eventHash(event) !== event.event_hash
      ) {
        fail("invalid_previous_event_hash");
        return;
      }
      const valid =
        (s.status === "active" && event.type === "work_session.completed") ||
        (s.status === "completed" && event.type === "work_session.closed");
      if (!valid) {
        fail("invalid_transition");
        return;
      }
      const next: Session = {
        ...s,
        status: event.type === "work_session.closed" ? "closed" : "completed",
        revision: s.revision + 1,
        last_event_hash: event.event_hash,
        updated_at: event.timestamp,
      };
      sessions.set(s.id, next);
      cache.set(key, { fingerprint, body: event });
      send(201, event);
    } catch {
      if (!res.headersSent) send(500, { error: "demo_internal_error" });
      else res.destroy();
    }
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  server.timeout = 5000;
  server.maxConnections = 32;
  return server;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const index = process.argv.indexOf("--port");
  const port = index < 0 ? 4000 : Number(process.argv[index + 1]);
  const authorization = process.env.FLOW_AUTHORIZATION;
  if (!authorization || !Number.isInteger(port) || port < 1 || port > 65535) {
    process.stderr.write("Set FLOW_AUTHORIZATION and use a valid --port.\n");
    process.exitCode = 2;
  } else {
    const host = createHost({
      authorization,
      broken: process.argv.includes("--broken"),
    });
    host.listen(port, "127.0.0.1", () =>
      process.stdout.write(
        `Lab ${process.argv.includes("--broken") ? "broken" : "reference subset"} host: http://127.0.0.1:${port}\n`,
      ),
    );
    for (const signal of ["SIGINT", "SIGTERM"] as const)
      process.on(signal, () => {
        host.close();
        host.closeAllConnections();
      });
  }
}
