# Testing and verification

```sh
npm ci --ignore-scripts
npm run build
npm test
npm run demo
```

Build first: end-to-end tests deliberately execute the compiled CLI in child processes. Vitest runs sequential test files; each HTTP test binds an ephemeral loopback port and closes its servers. Node 22.12+ is required; implementation verification used Node 24.20.0 on Windows.

## Evidence of the initial implementation

- Reference target: nine selected scenarios pass. HEADERS-001 checks all six required mutation headers independently.
- Broken target: AUTH-001, STATE-001, REPLAY-001 and REPLAY-002 fail; the other five scenarios pass. Replay reproduces the stale-revision violation against fresh state.
- Unit coverage: URL/address restrictions, redaction, mutation retry discipline, redirect refusal, response size/time/JSON-depth limits, canonical JSON hashing and an independently generated upstream SDK event vector.
- Integration coverage: actual HTTP sequences, exact expected failing IDs, cancellation, failed setup, evidence write/read, per-test tamper detection, claim and issue boundaries.
- CLI coverage: success/failure/inconclusive exits, selection/configuration errors, machine JSON, inspect, report, replay requiring explicit target, issue output, claims, and script-closing text in generated HTML.
- The pinned upstream SDK independently accepted the generated WorkSession and JarvisEvent record shapes and event-chain sample. The retained `fixtures/upstream-event.json` makes the ASCII hash check reproducible without downloading the SDK.
- Browser verification: generated report renders; failed filter selects four tests; STATE-001 shows HTTP 201 and revision 2 -> 3; loading reference JSON displays four failed-to-passed differences.

The test-case count is not a compatibility percentage. These tests verify the selected lab behaviors and controls. They do not prove complete Jarvis conformance, actual remote-deployment interoperability, concurrency correctness of arbitrary targets or comprehensive host security.

## Add a regression

Reproduce the behavior with a self-contained scenario, include a positive control, then add an intentionally flawed target variant or isolated HTTP test that would fail if the runner incorrectly accepted the behavior. Prefer assertions on protocol state and exit semantics over snapshots of internal implementation details. Do not weaken a requirement to make the demo pass.

## Status classification

A valid but wrong protocol response after successful prerequisites is a failure. Missing setup, invalid/malformed or oversized responses, transport failure and cancellation are inconclusive. The current suite emits no intentional skipped scenarios; the schema/exit handling reserves that status for future explicit capability selection. Partial selections still require every selected scenario to execute and pass for exit 0.
