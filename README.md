# Flow Conformance Lab

Independent black-box conformance evidence for running Jarvis implementations. The CLI sends real HTTP requests, challenges protocol gates, reads resulting state and records reproducible diagnostics. **This is not an official Flow Research service or certification system.** A passing run describes the executed scenarios; full compatibility remains unproven.

**Sample report:** [flow-conformance-lab.vercel.app](https://flow-conformance-lab.vercel.app) shows the offline evidence inspector with a demo run against the lab's intentionally broken test host. It is not a browser-based scanner and cannot test your server; testing happens only through the CLI.

## Why it exists

A structurally valid record cannot prove that a host rejects an unauthorized Actor, protects its current revision, or handles a retried mutation without a second write. Jarvis's existing SDK/CLI validators check records and fixtures. This lab tests those observable implementation behaviors through the published HTTP binding.

The initial suite covers **nine scenarios**: creation/read/event acceptance, six required header gates, unauthorized Actor rejection, body/header Actor binding, stale revision, incorrect previous hash, exact replay, changed-payload replay and closed-session immutability. It pins Jarvis wire version `v0.1` at commit `e0c4842a5fc62b304e0af9cbc823d0be1eb72adb` (release `v0.1.0`, Protocol Alpha).

## How it works

```text
CLI + host identity config -> versioned scenarios -> bounded HTTP -> running host
                                    |
                     redacted exchanges + state comparisons
                                    |
                    evidence / diagnostics / offline inspector
                                    |
                     replay / issue draft / self-attested claim
```

## Quick start

Requires Node **22.12+** (Node 24 recommended) and npm. Open a checkout of this repository:

```sh
npm ci --ignore-scripts
npm run build
npm test
npm run demo
```

`demo` starts both loopback targets, runs the suite, persists both evidence packages, replays a stale-revision failure and writes issue/claim artifacts. It uses an ephemeral generated credential without printing it, then shuts down the targets. Open the broken run's `report/index.html`; `runs/demo-latest.json` identifies all three run directories. This requires no external account, service or database.

To run the CLI against a persistent demo host, choose a disposable local credential. Set the **same** environment value in both terminals:

```powershell
# PowerShell — terminal 1
$env:FLOW_AUTHORIZATION = 'Bearer disposable-local-demo'
npm run host:reference

# PowerShell — terminal 2
$env:FLOW_AUTHORIZATION = 'Bearer disposable-local-demo'
node dist/apps/cli/index.js test http://127.0.0.1:4000 --verbose
```

On macOS/Linux use `export FLOW_AUTHORIZATION='Bearer disposable-local-demo'`. The demo credential is only for the local subset host. Production credentials belong in your secret environment mechanism, never CLI arguments or config files. `npm run host:broken` uses port 4001.

Use `node dist/apps/cli/index.js` without installing globally. Optional `npm link` registers the `flow-conformance` command used below.

Tagged releases publish the CLI to npm as `flow-conformance-lab` and attach the same tarball to a GitHub release (see [releasing](docs/releasing.md)). After the first release, `npm install -g flow-conformance-lab` installs the `flow-conformance` command; `npx --package flow-conformance-lab flow-conformance list-tests` runs it without installing. The installed CLI has no bundled default config, so always pass `--config`.

```sh
flow-conformance list-tests
flow-conformance test http://127.0.0.1:4000 --config examples/target.json --json
flow-conformance test --base-url http://127.0.0.1:4001 --suite core --test STATE-001
flow-conformance inspect <run-directory> --json
flow-conformance replay <run-directory> --base-url http://127.0.0.1:4001 --test STATE-001
flow-conformance report <run-directory>
flow-conformance issue <run-directory> --test STATE-001 --output issue.md
flow-conformance claim <run-directory>
```

A run UUID resolves under `./runs`; otherwise pass its directory. `--output` on test/replay sets the evidence root. `--timeout` is a per-request deadline in milliseconds (default 5000, permitted 100–60000). `--verbose` shows all diagnostics. JSON output is one complete object; use `node ...` rather than `npm run` when stdout must contain only JSON.

## Use your implementation

Copy `examples/target.json`, set the implementation name/version/optional commit, authorized human Actor, unauthorized Actor, human/agent Worker and Policy IDs. Set `auth_env` to the environment variable containing your host's complete Authorization header. Provision these identities/policy through the **host's own administration system**. Jarvis does not define a login or policy provisioning endpoint, and this tool does not invent one.

The actor must be authorized to create/read sessions, complete them and close them. The policy must permit the minimal human-controlled lifecycle without additional blocking obligations. `unauthorized_actor_id` must identify an Actor the supplied credential cannot act as. Use an isolated test tenant: tests create persistent WorkSessions and Jarvis provides no standard cleanup endpoint. Host-specific unmet prerequisites produce **inconclusive** results. The [operator runbook](docs/operator-runbook.md) walks through tenant setup, provisioning, a one-scenario preflight, troubleshooting and opt-in cleanup.

Loopback testing accepts explicit `127.0.0.1` or `[::1]`. Remote testing requires HTTPS and `--allow-remote`; every resolved address must be public IPv4. Private-network remote targets and public IPv6 are intentionally unsupported in this release. A base path is supported, for example `https://host.example/jarvis`.

## Example output

```text
Reference subset host 0.1.0 | Jarvis v0.1 | suite 0.1.0
9 tests: 9 passed, 0 failed, 0 skipped, 0 inconclusive
Independent conformance evidence. Compatibility not proven.
```

The intentionally broken host produces four predictable failures:

```text
9 tests: 5 passed, 4 failed, 0 skipped, 0 inconclusive

STATE-001 FAILED — Stale revision after accepted mutation
Expected: stale_work_session_revision and unchanged state
Observed: HTTP 201, revision 2 -> 3, status completed -> closed, snapshot changed
Confidence: high
Possible cause: missing or incorrectly ordered host validation;
the internal cause cannot be determined externally.
```

It also fails AUTH-001, REPLAY-001 and REPLAY-002. Broken behavior comes from omitted enforcement, not hardcoded test results. Both targets implement only this subset, not a complete Jarvis host.

## Evidence and replay

```text
runs/<uuid>/
  manifest.json          SHA-256 digests of canonical evidence files
  run.json               versioned, schema-validated run + recorded scenario config
  summary.json           exact result counts
  tests/<TEST-ID>.json    definition, requirement, exchanges and diagnosis
  report/index.html      self-contained React inspector; works offline
```

The inspector filters by area/status, shows expected/observed state, expands requests and redacted responses, and compares a locally selected `run.json`. It does not execute tests from the browser. CLI `inspect` verifies hashes and per-test consistency; browser file import validates shape only. SHA-256 detects changes relative to the manifest, not an attacker who replaces both files and manifest.

Replay executes the recorded test selection/config with new session IDs, keys and timestamps. It requires matching suite/source/test versions, an explicit target and restored credential environment. Override `--config` for another provisioned environment. Historical evidence is not rewritten. This is **scenario reproduction**, not byte-identical reuse of stale state.

## Claims and exit codes

`claim` generates a **SELF-ASSERTED COMPATIBILITY CLAIM** artifact using the upstream six-field layout with `Verifier: self-attested`. It explicitly says **Compatibility Not Proven**; even nine passing tests cover only the selected subset. Lab counts and versions are separate evidence metadata, not invented upstream governance fields. `issue` only writes a reviewable draft and never publishes it.

| Exit | Meaning for test/replay                                                                       |
| ---- | --------------------------------------------------------------------------------------------- |
| 0    | Every selected required scenario passed                                                       |
| 1    | At least one observed protocol failure (even if another is inconclusive)                      |
| 2    | Invalid configuration/evidence, or no failures but at least one inconclusive/skipped scenario |

Unknown or empty selections fail configuration; an empty suite cannot pass. Offline commands return 0 on success and 2 on errors. See [CI integration](docs/ci.md).

## Security and limits

The runner executes no target code. Requests have wall-clock deadlines, 64 KiB response limits, one-at-a-time execution, cancellation, no retries, no redirects, verified TLS, address pinning and no ambient proxy forwarding. Credentials and sensitive keys are redacted before persistence; malformed response bytes are discarded. Responses remain untrusted data. See [security controls and review](docs/security.md) before using real host data.

This is a useful initial conformance subset, **not a production readiness or security attestation**. It does not test PolicyDecision ordering, Requests/Review/Takeover, Contributions, EvidenceManifest export, learning, memory/skills, OutcomeReport, extensions or Workstream. It cannot see hidden side effects, prove server honesty or audit an entire event log.

One pinned-source ambiguity matters: WorkSession prose requires richer transition payload fields that the closed OpenAPI schema excludes. This suite follows the HTTP schema/fixture shape and records that limitation in every run. See the source matrix and findings in [research](docs/research.md), then [architecture](docs/architecture.md), [testing](docs/testing.md), [compatibility](docs/compatibility.md) and [two-minute demonstration](docs/demo.md).

## Relationship and contributions

This independent project is not owned, endorsed or operated by Flow Research. Jarvis protocol semantics belong to their upstream specification; this lab generates observations, not compatibility authority. Do not describe its results as official approval.

Add source-backed, versioned behavior scenarios with positive controls and negative observations; preserve uncertainty and historical definitions. Follow [contributing](docs/contributing.md). Code is MIT licensed.
