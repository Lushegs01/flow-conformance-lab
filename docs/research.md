# Research and protocol boundary

Researched 2026-10-06 from live public Git clones and GitHub REST issue/PR listings, before implementation. Browser search snapshots were older; they were not used as current issue inventories.

## A. Current landscape

[Flow Research](https://github.com/Flow-Research) publishes separate protocol and implementation projects. Jarvis is a human-agent collaboration and learning-loop protocol, released as **v0.1.0 Protocol Alpha**, with wire version **v0.1**. This lab pins Jarvis commit `e0c4842a5fc62b304e0af9cbc823d0be1eb72adb` and Workstream commit `b5e764d1da330ad2b15d63597885182359779716`. Neither an alpha release nor a passing lab run confers official status.

Primary source index (all Jarvis paths below are at the pinned commit):

- [README and ownership boundary](https://github.com/Flow-Research/jarvis/blob/e0c4842a5fc62b304e0af9cbc823d0be1eb72adb/README.md)
- [Conformance checklist and claim format](https://github.com/Flow-Research/jarvis/blob/e0c4842a5fc62b304e0af9cbc823d0be1eb72adb/docs/conformance/checklist.md)
- [Golden path](https://github.com/Flow-Research/jarvis/blob/e0c4842a5fc62b304e0af9cbc823d0be1eb72adb/docs/conformance/golden-path.md), [failure modes](https://github.com/Flow-Research/jarvis/blob/e0c4842a5fc62b304e0af9cbc823d0be1eb72adb/docs/conformance/failure-modes.md), [fixtures](https://github.com/Flow-Research/jarvis/tree/e0c4842a5fc62b304e0af9cbc823d0be1eb72adb/docs/conformance/fixtures)
- [Core objects](https://github.com/Flow-Research/jarvis/blob/e0c4842a5fc62b304e0af9cbc823d0be1eb72adb/docs/protocol/11-core-protocol-objects.md), [WorkSessions](https://github.com/Flow-Research/jarvis/blob/e0c4842a5fc62b304e0af9cbc823d0be1eb72adb/docs/protocol/04-work-sessions.md), [HTTP binding](https://github.com/Flow-Research/jarvis/blob/e0c4842a5fc62b304e0af9cbc823d0be1eb72adb/docs/openapi/jarvis-openapi.yaml)

Workers identify participants; Actors identify authorized acting identities. WorkSession mutations require host authentication and six Jarvis headers: protocol version, actor, idempotency key, timestamp, expected revision, previous event hash. Reads require authentication, version and actor only. Creation uses revision 0/genesis headers, accepting an active revision-1 snapshot. Accepted mutations append an event, advance revision exactly once and update the chain head. Actor-bearing bodies must match the header. Identical accepted requests replay before stale-revision/hash rejection; changed payloads under an accepted key reject.

The broader protocol requires PolicyDecision before AgentWorker action; blocked scope becomes Request, resolved through Review or Takeover. ApprovalScope bounds permission; Takeover epochs and reconciliation references prevent stale continuation. Jarvis calls attributable work **Contribution**; Workstream uses **ContributionRecord**. EvidenceManifest exports terminal-session portable proof, excluding host-private fields. LearningRecord cites source events; reviewed MemoryProposal and SkillProposal govern durable changes. OutcomeReport is post-session feedback referencing learning without rewriting sealed evidence. Unsupported required capabilities reject; optional missing proof is a limitation. Namespaced extensions cannot override core fields or carry host secrets. These areas are researched but are not all implemented in this first suite.

## B. Existing tooling and changes under review

Jarvis TypeScript and Python helpers provide OpenAPI types, record validation, operation paths/envelopes/headers, event canonicalization/hash chains, Request/Review/Takeover checks, EvidenceManifest and learning checks, and fixture evaluation. Its CLI validates records/fixtures/manifests, checks headers/hash chains, lists rejection IDs and prints a claim template. Fixture validation explicitly does not execute host behavior. This lab sends actual HTTP operations, reads state after rejection/replay, and preserves diagnostics and executable scenario recipes. It complements those helpers.

Live open Jarvis items: [#69 implementation-proof tracker](https://github.com/Flow-Research/jarvis/issues/69), [#75 security ownership](https://github.com/Flow-Research/jarvis/pull/75), [#89 external live-agent proof harness](https://github.com/Flow-Research/jarvis/pull/89), [#91 Python canonical encoding](https://github.com/Flow-Research/jarvis/pull/91), [#92 QA gates](https://github.com/Flow-Research/jarvis/pull/92). PRs are proposals, not normative merged semantics. In particular #91 claims JSON.stringify escapes non-ASCII by default; that premise is incorrect. Do not use its prose as a hashing specification. This suite uses ASCII event content and the merged sorted-key JSON helper convention, and does not claim cross-language Unicode canonicalization coverage.

### Workstream (research only)

[Current roadmap](https://github.com/Flow-Research/workstream/blob/b5e764d1da330ad2b15d63597885182359779716/docs/roadmap_status.md) explicitly says the complete v0.1 lifecycle is not yet usable. Older 30-day/backlog plans are historical. [Architecture](https://github.com/Flow-Research/workstream/blob/b5e764d1da330ad2b15d63597885182359779716/docs/architecture_system_architecture.md) uses FastAPI, PostgreSQL, object storage, async workers and an append-only audit boundary. External Flow Identity authenticates; Workstream's own authorization service evaluates actor/grants, exact resource scopes, revocation and transactional evidence. A valid bearer alone is not product authority.

[Checker framework](https://github.com/Flow-Research/workstream/blob/b5e764d1da330ad2b15d63597885182359779716/docs/architecture_checker_framework.md) separates pre-submission intake from post-submission evaluation. Locked policies and artifact identity bind diagnostic provenance. Hidden durable execution, leases, immutable ordered results and authority receipts are present; the full public dispatch/acceptance flow is unfinished. Checker success does not grant acceptance authority. Its independent [Go CLI](https://github.com/Flow-Research/workstream/blob/b5e764d1da330ad2b15d63597885182359779716/cli/README.md) inspects identity, projects, authority and tasks, and supports claim/start through public REST routes.

Public security reports remain open: [#133 in-process checkers](https://github.com/Flow-Research/workstream/issues/133) and [#135 DB lifecycle enforcement](https://github.com/Flow-Research/workstream/issues/135). These are reported risks, not independently reproduced findings against this pinned revision; current execution architecture has evolved since filing. Open PRs at inspection: [#433 lease deferral](https://github.com/Flow-Research/workstream/pull/433), [#448 authorization proof split](https://github.com/Flow-Research/workstream/pull/448), [#455 advisory CI impact](https://github.com/Flow-Research/workstream/pull/455), [#481 verified ZIP metadata](https://github.com/Flow-Research/workstream/pull/481), [#482 contributor/locked-rule CLI inspection](https://github.com/Flow-Research/workstream/pull/482). Open tooling issues #181/#182/#184 concern observability, typing and caching. No Workstream suite is implemented.

## C. Conformance boundary

Record validation asks if a document satisfies a schema/invariant. Implementation conformance asks if a running host enforces a rule under interaction. Certification/governance assigns authority. This lab performs the second, uses the first as supporting evidence, and never performs the third. Passing nine scenarios cannot establish full Jarvis compatibility or host security.

## D. Behavior matrix

| Requirement                                                 | Existing artifact                                         | Testability                                   | Planned test          |
| ----------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------- | --------------------- |
| Genesis, reads, revision and event linkage                  | OpenAPI create/get/append; WorkSession revision section   | HTTP + visible snapshot                       | CORE-001              |
| Six required mutation headers before changes                | Checklist; missing-header fixtures                        | HTTP rejection + before/after                 | HEADERS-001           |
| Authorized Actor before mutation                            | unauthorized-actor fixture                                | credential-to-actor provisioning assumption   | AUTH-001              |
| Body Actor equals header                                    | OpenAPI actor-body binding                                | HTTP + snapshot                               | AUTH-002              |
| Current expected revision                                   | stale-work-session-revision fixture                       | multi-operation sequence                      | STATE-001             |
| Previous hash equals current head                           | invalid-previous-event-hash fixture                       | HTTP + snapshot                               | CHAIN-001             |
| Exact accepted request replay is side-effect free           | WorkSessions revision/idempotency rules                   | replay with stale headers                     | REPLAY-001            |
| Reused key with changed payload rejects                     | duplicate_idempotency_key_mismatch (no dedicated fixture) | HTTP + snapshot                               | REPLAY-002            |
| Closed session rejects fresh mutation                       | sealed-work-session fixture; transition table             | complete, close, append                       | STATE-002             |
| Policy, Review, Takeover, evidence, learning and extensions | Checklist and record fixtures                             | additional host capabilities/scenarios needed | Deferred, NOT covered |

## E. Risks and assumptions

- Host owns credential format and provisioning. Supply authorized human Actor, human/agent Worker and Policy IDs. AUTH-001 assumes a configured second actor is not authorized for the supplied credential. The demo supplies controlled identities. Use an isolated test tenant; tests create durable sessions and have no protocol-defined delete operation.
- No standard discovery, reset, event-log retrieval or policy-creation endpoint is invented. Opaque event_log_ref values are never fetched. The demo host supports only the selected subset and is not a full reference implementation of Jarvis.
- OpenAPI uses WorkSession as both input and output. Create bodies follow its active revision-1 example while headers use revision 0/genesis. Host computes authoritative genesis hash. This asymmetry is explicit.
- Post-rejection equality proves only the exposed snapshot stayed unchanged. Hidden side effects, execution isolation, transaction ordering and honesty of the read API need host introspection. Authority-before-acceptance is observed externally, not instrumented internally.
- Transport failures, missing setup, oversized/malformed responses and cancellation are inconclusive, never passes. A well-formed wrong protocol result is a failure. Prerequisite failure stops that scenario.
- Hash-link tests verify accepted supplied event and exposed chain head, not an entire exported history. Symbolic upstream fixtures are not cryptographic proof. Canonicalization interoperability remains a follow-up.
- Scenario replay regenerates IDs, timestamps and setup. It is not a byte-exact replay against old state. Credentials must be re-supplied; source/suite/test versions must match.
- Alpha rules may evolve. Evidence embeds references, test definition versions and source commit. Later versions must not reinterpret historical runs.

### Discovered specification inconsistency: transition payload

The WorkSessions prose says state-change payloads record `from_status`, `to_status`, `reason`, `previous_revision`, and `next_revision`. At this same commit, OpenAPI's `JarvisEventPayload` is closed (`additionalProperties: false`) and does not admit those fields. The golden fixture also uses object/action/summary rather than those richer fields. This lab explicitly selects the **published HTTP binding profile** and sends object_type/object_id/action, matching the OpenAPI shape and upstream SDK validator. It does not claim to satisfy the incompatible prose payload requirement. Hosts requiring the richer form will fail the positive-control prerequisite, making affected scenarios inconclusive. Resolution needs an upstream contract change; the lab does not invent an extension or silently treat one document as universal authority. Every run carries this limitation. A ready-to-post upstream issue with permalinks and an SDK reproduction is drafted in [upstream/worksession-transition-payload.md](upstream/worksession-transition-payload.md).
