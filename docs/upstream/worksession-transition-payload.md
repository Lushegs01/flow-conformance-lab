# Upstream issue draft: WorkSession transition payload conflict

Status: **draft, not posted.** Target: [Flow-Research/jarvis issues](https://github.com/Flow-Research/jarvis/issues/new). Before posting, [search existing issues](https://github.com/Flow-Research/jarvis/issues?q=is%3Aissue+from_status+OR+JarvisEventPayload+OR+blocked_scope_resolution_refs) for a duplicate. Open pull requests #70–#92 were checked through git on 2026-10-11, and none changes `JarvisEventPayload` or the WorkSession prose.

Every reference below is a permalink to `e0c4842a5fc62b304e0af9cbc823d0be1eb72adb`, which was still the head of `main` when this was drafted. Copy everything under the line into the issue form.

---

**Title:** WorkSession state-change payload fields required by the prose are rejected by the closed `JarvisEventPayload` schema

## Summary

At `e0c4842` (v0.1.0, Protocol Alpha), the WorkSession prose requires state-change events to carry fields that the published HTTP contract does not allow. A host cannot satisfy both sources:

- An event that includes the prose fields fails the closed `JarvisEventPayload` schema and the TypeScript SDK validator.
- An event without them matches OpenAPI, the golden fixtures and the SDK, but not the prose.

## What the prose requires

`docs/protocol/04-work-sessions.md` says every WorkSession state change records `from_status`, `to_status`, `reason`, `previous_revision` and `next_revision` in the event payload:

https://github.com/Flow-Research/jarvis/blob/e0c4842a5fc62b304e0af9cbc823d0be1eb72adb/docs/protocol/04-work-sessions.md#L256-L264

It also says state-change events include `blocked_scope_resolution_refs` when leaving `waiting_on_human`, and `reconciliation_refs` when leaving `reconciling`:

https://github.com/Flow-Research/jarvis/blob/e0c4842a5fc62b304e0af9cbc823d0be1eb72adb/docs/protocol/04-work-sessions.md#L269-L271

The structure of those two ref sets is defined at [L284–L291](https://github.com/Flow-Research/jarvis/blob/e0c4842a5fc62b304e0af9cbc823d0be1eb72adb/docs/protocol/04-work-sessions.md#L284-L291) and [L303–L315](https://github.com/Flow-Research/jarvis/blob/e0c4842a5fc62b304e0af9cbc823d0be1eb72adb/docs/protocol/04-work-sessions.md#L303-L315).

## What the HTTP contract allows

`JarvisEventPayload` is `additionalProperties: false`. It defines `object_type`, `object_id`, `action`, `field_refs`, `evidence_refs` and `summary`, and none of the prose fields:

https://github.com/Flow-Research/jarvis/blob/e0c4842a5fc62b304e0af9cbc823d0be1eb72adb/docs/openapi/jarvis-openapi.yaml#L940-L986

`JarvisEvent.payload` references that schema ([L1610–L1611](https://github.com/Flow-Research/jarvis/blob/e0c4842a5fc62b304e0af9cbc823d0be1eb72adb/docs/openapi/jarvis-openapi.yaml#L1610-L1611)).

The two ref sets have the same problem:

- `blocked_scope_resolution_refs` is not defined by any schema. It appears only in the error ID `missing_blocked_scope_resolution_refs`.
- `reconciliation_refs` is defined on `Takeover` ([L2062–L2073](https://github.com/Flow-Research/jarvis/blob/e0c4842a5fc62b304e0af9cbc823d0be1eb72adb/docs/openapi/jarvis-openapi.yaml#L2062-L2073)), not on the event payload.

So hosts are given error IDs for events that lack these refs, but a schema-valid event has nowhere to put them:

https://github.com/Flow-Research/jarvis/blob/e0c4842a5fc62b304e0af9cbc823d0be1eb72adb/docs/openapi/jarvis-openapi.yaml#L823-L824

## Fixtures and SDK follow the schema

The golden-path `work_session.completed` event carries only `object_type`, `object_id`, `action` and `summary`:

https://github.com/Flow-Research/jarvis/blob/e0c4842a5fc62b304e0af9cbc823d0be1eb72adb/docs/conformance/fixtures/valid/golden-path.json#L972-L977

The TypeScript SDK treats `JarvisEventPayload` as closed ([schema-metadata.js L1264](https://github.com/Flow-Research/jarvis/blob/e0c4842a5fc62b304e0af9cbc823d0be1eb72adb/packages/typescript/src/generated/schema-metadata.js#L1264)), and its validator ([index.js L973–L1018](https://github.com/Flow-Research/jarvis/blob/e0c4842a5fc62b304e0af9cbc823d0be1eb72adb/packages/typescript/src/index.js#L973-L1018)) rejects the prose fields.

## Reproduction

From the repository root at `e0c4842`:

```js
// node repro.mjs
import { validateSchemaRecord } from "./packages/typescript/src/index.js";

const schemaShape = {
  object_type: "work_session",
  object_id: "ws-1",
  action: "completed",
};
const proseFields = {
  from_status: "active",
  to_status: "completed",
  reason: "human completed the session",
  previous_revision: 1,
  next_revision: 2,
};

console.log(validateSchemaRecord("JarvisEventPayload", schemaShape).valid);
// true
const result = validateSchemaRecord("JarvisEventPayload", {
  ...schemaShape,
  ...proseFields,
});
console.log(result.valid, result.errors[0].reason);
// false "JarvisEventPayload.from_status is not defined by the closed OpenAPI schema."
```

## Why it matters

- Implementers have to choose which source to follow. Two hosts that each follow one source will each look non-conformant to tooling built on the other.
- The state-change rules cannot be exercised through the HTTP binding. These are blocked-scope accounting when leaving `waiting_on_human` and reconciliation proof when leaving `reconciling`; the proof has no schema-valid place in the request.
- No schema-valid request can trigger `missing_blocked_scope_resolution_refs` or `missing_reconciliation_refs` for a reason other than the schema itself.

## Possible resolutions

These are offered only as options; the choice belongs to the maintainers.

1. **Extend the contract.** Add a state-change payload variant for `work_session.*` events, carrying the five transition fields plus optional `blocked_scope_resolution_refs` and `reconciliation_refs` objects. Update the fixtures and both SDKs to match.
2. **Narrow the prose.** State that statuses and revisions are derived from the event type and the WorkSession revision chain rather than carried in the payload. Specify how the blocked-scope and reconciliation proofs are carried, for example through a documented convention over `field_refs` and `evidence_refs`, or through the referenced Review, Takeover and Request records.
3. **Declare the fields out of band.** Mark them as host-internal, not part of the portable v0.1 record, and remove or re-scope the two error IDs for the HTTP binding.

## Questions

- For v0.1 HTTP hosts, which source is normative where the protocol prose and the OpenAPI schema disagree?
- If the transition fields stay, are they required on every `work_session.*` event or only on specific transitions?

## Context

I maintain [Flow Conformance Lab](https://github.com/Lushegs01/flow-conformance-lab), an independent black-box conformance runner. It is not affiliated with or endorsed by Flow Research. It currently follows the OpenAPI and fixture shape and records this discrepancy as a limitation on every run. A host that requires the prose form therefore gets "inconclusive" rather than "failed" results. I'll update the suite once the contract is clarified.
