# Architecture (decision made before implementation)

One strict TypeScript package with CLI, library modules, versioned Jarvis tests, and an offline React inspector. Node 22+; Commander for CLI, Zod for closed evidence/configuration schemas, native Node HTTP(S) for bounded streaming transport, Vitest for tests. Native HTTP avoids implicit proxy behavior and permits explicit connection cleanup. No arbitrary host code or downloaded plugins execute in the runner.

```text
CLI/config -> sequential runner -> versioned scenario -> bounded HTTP -> target
                    |                    |
                    +-> redacted exchanges + diagnostics
                              |
                        run.json + test files + manifest
                              |
                  HTML inspector / replay / issue / claim
```

## Execution

Concurrency is deliberately one. Every scenario creates a unique WorkSession via the published API, sends one or more operations, then reads the resulting snapshot. Assertions distinguish setup inability from observed requirement failures. Each negative scenario first demonstrates its positive control, changes one variable, and checks both rejection identity and no visible state mutation. All six missing-header variants remain one versioned header-gate scenario.

No retries. Each exchange has a wall-clock deadline, response-byte limit, no redirect following, no ambient proxies, bounded JSON nesting and cancellation. Explicit loopback IPs are the default allowed targets. Remote HTTPS needs an explicit allow-remote flag; resolved non-public addresses are denied and a validated address is pinned per connection. URLs cannot contain credentials/query/fragment. API credentials enter only through a named environment variable and are never persisted. Host-returned strings are untrusted.

## Evidence and diagnoses

Versioned Zod schemas validate configuration, exchanges, tests, diagnostics and runs. JSON Schema is exported for integrations. Evidence uses safe run/test names, new directories and bounded reads; manifest SHA-256 digests detect accidental tampering, not provide signatures. Redaction happens before persistence and reporting. Raw response means redacted JSON representation, never unredacted bytes. Invalid/non-JSON response bytes are discarded.

Every diagnostic retains expected/observed behavior, requirement, confidence, severity, possible causes, request sequence and source references. No inferred internal bug is presented as fact. Passed scenarios still retain exchanges. Unexecuted protocol areas are explicit limitations.

## Commands and exits

test, list-tests, inspect, replay, report, claim, issue, version. Test/replay exit 1 for any observed failure, else 2 for incomplete/inconclusive execution, else 0 for all selected required scenarios passed. Selection never implies full coverage. Invalid configuration exits 2. Offline inspect/report operate without network. Replay requires an explicit target and environment credentials, preventing imported evidence from selecting a network destination. Partial-suite claim artifacts state compatibility not proven; they follow upstream's six-field claim layout and attach lab-specific counts separately.

## Inspector

Self-contained HTML with bundled React, no CDN, network or server execution. Embedded sanitized evidence, searchable/category-filtered test explorer, focused diagnostics and exchanges. Local JSON import allows run comparison matched by test ID/version and source revision; mismatched bases are visible. Never render response HTML. Report generation uses a fixed trusted template and escaped JSON.

## Demonstration targets

Minimal loopback-only in-memory host with credential-to-actor binding, revision/hash gates, actor/body equality, idempotency cache and selected lifecycle transitions. Broken mode omits actual actor authority, revision and replay gates. It receives the same ordinary requests and contains no test-ID dispatch. Bounded stores and request bodies prevent unbounded demo growth. These are educational subset targets, not production Jarvis servers.

## Extension boundary

Add reviewed scenario code to the fixed catalogue, with protocol/suite/test version and pinned requirements. Do not load code from target responses, run bundles or CLI configuration. Workstream, Takeover and governed learning remain future suites after deeper provisioning/operation contracts are implemented.
