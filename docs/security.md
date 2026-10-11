# Security model and review

Review date: 2026-10-06; remote-path tests and egress guidance added 2026-10-11. This is a code/test review of this initial release, not an independent audit or a statement that vulnerabilities do not exist.

## Assets and trust boundaries

The target can be slow, unavailable or malicious. Protect host credentials, the runner filesystem/process, retained evidence and report viewers. Configuration and installed scenario code are operator-controlled. Target responses, imported evidence, URLs and report text are untrusted. Do not run this tool as a network-facing service accepting arbitrary target URLs. Use an isolated test tenant with synthetic data; these tests intentionally create and challenge protocol state.

## Implemented controls

| Boundary           | Control                                                                                                                                                                            | Verification                                             |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Target execution   | Fixed reviewed HTTP scenarios; no shell/plugin/import instructions from target or evidence                                                                                         | Code review of catalogue/runner                          |
| Network            | Exact loopback by default; explicit remote HTTPS; public IPv4-only DNS resolution; reject any private/mixed answer; pin validated address for connection                           | Address-denial unit tests; stubbed-resolver remote tests |
| CI guard           | `FLOW_CONFORMANCE_LOOPBACK_ONLY=1` refuses every non-loopback target, whatever `--allow-remote` or caller options say; set in the committed workflow                               | Unit test; workflow environment                          |
| Credentials        | Environment-only Authorization; no URL credentials, cookies, redirect following, ambient proxies or relaxed TLS                                                                    | Redaction/redirect tests; CLI end-to-end secret scan     |
| Time/resources     | 100–60000ms wall-clock deadline including DNS; 64 KiB response; 16 KiB headers; bounded request, JSON depth/node count; one active request; no retries                             | Slow, oversized, malformed and nested response tests     |
| Cancellation       | SIGINT/SIGTERM abort in-flight request; remaining scenarios become inconclusive; evidence is saved when process survives                                                           | Abort integration test                                   |
| Cleanup            | Request destroyed at every completion/error; agent pooling disabled                                                                                                                | Transport tests and code review                          |
| Logs/evidence      | Known credential echoes scrubbed in values and keys; sensitive-key and recognizable-token patterns; terminal controls removed; response header allowlist; invalid bodies discarded | Redaction and CLI tests                                  |
| Files              | New UUID directories, fixed test filenames, bounded reads, file/directory symlink rejection at final components, fixed manifest path grammar                                       | Tamper tests and code review                             |
| Reports            | JSON escapes angle brackets and ampersands; React text rendering; fixed GitHub protocol-link prefix; no network in CSP; no target response HTML rendering                          | Hostile script-closing payload test; browser inspection  |
| Replay             | Explicit target; stored config contains environment-variable name only; version checks; no dynamic code or recorded URLs dispatched                                                | CLI replay tests                                         |
| Demonstration host | Loopback binding, explicit credential, 64 KiB body limit, 1000-session/10000-operation caps, 32 connections, 5s timeouts                                                           | Integration tests and code review                        |

## Findings addressed during implementation

- Initial Vitest version/transitive dependencies had registry advisories. Updated to 4.1.11; the subsequent installation audit reported zero known vulnerabilities. Lockfile retained. This is a point-in-time registry result.
- Replay initially defaulted to example identities; changed to the recorded config unless explicitly overridden.
- Commander default argument errors used exit 1; overridden to the documented configuration exit 2.
- Native Node dual-stack lookup can request an address array; explicitly set the validated address family because the connection deliberately uses one pinned address.
- Reduced response budget to 64 KiB and added a serialized-run budget so a hostile target cannot generate evidence too large for the bounded reader.
- Changed bounded-file reads to enforce the cap while reading, not only in a pre-read stat.
- Unexpected exceptions are not printed. Only explicitly classified observation/setup/transport messages reach diagnostics.

## Remote-path verification

`tests/unit/remote.test.ts` drives remote mode against a stubbed resolver and HTTPS client, so it needs no network. It covers:

- DNS answers that are private, cloud metadata (`169.254.169.254`), loopback, mixed public/private in either order, IPv6-only, IPv4-mapped IPv6 or empty. Each is refused before any connection is opened.
- IP-literal targets, including hexadecimal and octal IPv4 forms and IPv6 literals. These are refused without a DNS lookup.
- Address pinning: the connection uses the validated address, TLS still verifies the certificate against the hostname, pooling and ambient agents are disabled, and certificate checks are not relaxed.
- Re-validation on every request, so a later rebinding answer is refused.
- A DNS answer that arrives after the deadline never opens a connection.
- Remote redirects are refused rather than followed.

Removing the mixed-answer check, the late-answer check or address pinning makes the corresponding test fail, so these tests guard against regressions rather than passing vacuously.

## Recommended egress policy

The runner refuses private, link-local, loopback and IPv6 destinations itself, but it cannot know which public host you meant to test. Before giving it a real host credential, enforce the destination outside the process too:

- Run it on a dedicated machine, VM or container, not a shared workstation or a CI runner that holds other secrets.
- Allow outbound traffic only to your DNS resolver (UDP/TCP 53) and to the test host's IPv4 addresses on TCP 443. Deny everything else, including `169.254.0.0/16` (cloud instance metadata), the RFC 1918 ranges and all IPv6.
- Scope the credential to the isolated test tenant, so a mistaken destination receives a low-value token.

An nftables example for a dedicated Linux host or network namespace. Replace the documentation addresses with your resolver and test host:

```
table inet flow_conformance_egress {
  chain output {
    type filter hook output priority filter; policy drop;
    oifname "lo" accept
    ct state established,related accept
    ip daddr 192.0.2.53 udp dport 53 accept
    ip daddr 192.0.2.53 tcp dport 53 accept
    ip daddr { 203.0.113.10, 203.0.113.11 } tcp dport 443 accept
  }
}
```

GitHub-hosted runners cannot enforce a policy like this. For real host credentials, use a self-hosted runner or cloud firewall that does, and keep the credential in a protected environment (see [CI integration](ci.md)). Jobs that only build, test or run the demo should set `FLOW_CONFORMANCE_LOOPBACK_ONLY=1`, as the committed workflow does.

## Residual limits

Redaction is defense in depth, not a data-loss-prevention oracle. A target can encode an unknown secret in an innocuous field, or return sensitive business content that is not recognizable as a credential. Use synthetic data, retain artifacts privately, and review issue/claim/report files before sharing. CLI issue generation never publishes.

Public-address checks reduce SSRF risk but do not prove that a public server, network route or authenticated endpoint is safe. Egress firewalls and operator control remain necessary. Remote HTTPS/DNS handling is covered by stubbed-resolver tests but has not been validated against a live third-party deployment. IPv6 remote support is intentionally absent.

The filesystem directory and its ancestors must be operator-controlled. Final-component checks and bounded reads do not provide a hardened defense against a separate local attacker replacing parent directories concurrently. Run in a dedicated workspace; do not grant an untrusted target filesystem access.

Hashes detect accidental modification against a retained manifest; they are not signatures. Reports and generated issue/claim files are derived, regenerable artifacts, outside the canonical evidence manifest. A malicious host can lie consistently about state; snapshot equality cannot prove no hidden writes or side effects. Confidence describes the observation, not knowledge of internal root cause.

Browser import is local and capped at 32 MiB; schema parsing/rendering is synchronous and a large valid file may briefly pause the UI. It is not a hostile-file analysis sandbox. A stalled DNS operation cannot always be cancelled inside the OS resolver, although the request deadline prevents a late connection and the CLI issues no concurrent requests.

The demonstration targets hold snapshots and replay results in memory. They do not durably implement the complete Jarvis event ledger, policy engine or evidence export. Never deploy either as a production host.
