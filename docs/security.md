# Security model and review

Review date: 2026-10-06. This is a code/test review of this initial release, not an independent audit or a statement that vulnerabilities do not exist.

## Assets and trust boundaries

The target can be slow, unavailable or malicious. Protect host credentials, the runner filesystem/process, retained evidence and report viewers. Configuration and installed scenario code are operator-controlled. Target responses, imported evidence, URLs and report text are untrusted. Do not run this tool as a network-facing service accepting arbitrary target URLs. Use an isolated test tenant with synthetic data; these tests intentionally create and challenge protocol state.

## Implemented controls

| Boundary           | Control                                                                                                                                                                            | Verification                                            |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Target execution   | Fixed reviewed HTTP scenarios; no shell/plugin/import instructions from target or evidence                                                                                         | Code review of catalogue/runner                         |
| Network            | Exact loopback by default; explicit remote HTTPS; public IPv4-only DNS resolution; reject any private/mixed answer; pin validated address for connection                           | Address-denial unit tests; remote path code review      |
| Credentials        | Environment-only Authorization; no URL credentials, cookies, redirect following, ambient proxies or relaxed TLS                                                                    | Redaction/redirect tests; CLI end-to-end secret scan    |
| Time/resources     | 100–60000ms wall-clock deadline including DNS; 64 KiB response; 16 KiB headers; bounded request, JSON depth/node count; one active request; no retries                             | Slow, oversized, malformed and nested response tests    |
| Cancellation       | SIGINT/SIGTERM abort in-flight request; remaining scenarios become inconclusive; evidence is saved when process survives                                                           | Abort integration test                                  |
| Cleanup            | Request destroyed at every completion/error; agent pooling disabled                                                                                                                | Transport tests and code review                         |
| Logs/evidence      | Known credential echoes scrubbed in values and keys; sensitive-key and recognizable-token patterns; terminal controls removed; response header allowlist; invalid bodies discarded | Redaction and CLI tests                                 |
| Files              | New UUID directories, fixed test filenames, bounded reads, file/directory symlink rejection at final components, fixed manifest path grammar                                       | Tamper tests and code review                            |
| Reports            | JSON escapes angle brackets and ampersands; React text rendering; fixed GitHub protocol-link prefix; no network in CSP; no target response HTML rendering                          | Hostile script-closing payload test; browser inspection |
| Replay             | Explicit target; stored config contains environment-variable name only; version checks; no dynamic code or recorded URLs dispatched                                                | CLI replay tests                                        |
| Demonstration host | Loopback binding, explicit credential, 64 KiB body limit, 1000-session/10000-operation caps, 32 connections, 5s timeouts                                                           | Integration tests and code review                       |

## Findings addressed during implementation

- Initial Vitest version/transitive dependencies had registry advisories. Updated to 4.1.11; the subsequent installation audit reported zero known vulnerabilities. Lockfile retained. This is a point-in-time registry result.
- Replay initially defaulted to example identities; changed to the recorded config unless explicitly overridden.
- Commander default argument errors used exit 1; overridden to the documented configuration exit 2.
- Native Node dual-stack lookup can request an address array; explicitly set the validated address family because the connection deliberately uses one pinned address.
- Reduced response budget to 64 KiB and added a serialized-run budget so a hostile target cannot generate evidence too large for the bounded reader.
- Changed bounded-file reads to enforce the cap while reading, not only in a pre-read stat.
- Unexpected exceptions are not printed. Only explicitly classified observation/setup/transport messages reach diagnostics.

## Residual limits

Redaction is defense in depth, not a data-loss-prevention oracle. A target can encode an unknown secret in an innocuous field, or return sensitive business content that is not recognizable as a credential. Use synthetic data, retain artifacts privately, and review issue/claim/report files before sharing. CLI issue generation never publishes.

Public-address checks reduce SSRF risk but do not prove that a public server, network route or authenticated endpoint is safe. Egress firewalls and operator control remain necessary. Remote HTTPS/DNS behavior was reviewed but was not validated against a live third-party deployment. IPv6 remote support is intentionally absent.

The filesystem directory and its ancestors must be operator-controlled. Final-component checks and bounded reads do not provide a hardened defense against a separate local attacker replacing parent directories concurrently. Run in a dedicated workspace; do not grant an untrusted target filesystem access.

Hashes detect accidental modification against a retained manifest; they are not signatures. Reports and generated issue/claim files are derived, regenerable artifacts, outside the canonical evidence manifest. A malicious host can lie consistently about state; snapshot equality cannot prove no hidden writes or side effects. Confidence describes the observation, not knowledge of internal root cause.

Browser import is local and capped at 32 MiB; schema parsing/rendering is synchronous and a large valid file may briefly pause the UI. It is not a hostile-file analysis sandbox. A stalled DNS operation cannot always be cancelled inside the OS resolver, although the request deadline prevents a late connection and the CLI issues no concurrent requests.

The demonstration targets hold snapshots and replay results in memory. They do not durably implement the complete Jarvis event ledger, policy engine or evidence export. Never deploy either as a production host.
