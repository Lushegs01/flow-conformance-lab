# Operator runbook

This runbook covers running the core suite against your own Jarvis host: preparing an isolated tenant, provisioning the identities the scenarios need, running and reading the results, and cleaning up afterwards. For the bundled loopback demo, see the [README quick start](../README.md#quick-start). For CI, see [CI integration](ci.md).

## 1. What a run does to your host

Know this before you point the suite at anything.

| Per full run of the 9 core scenarios | Detail                                                                                                                                                                                                                                                                                   |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WorkSessions created                 | **15**, one per scenario, each with a new `ws-<uuid>` ID. `replay` creates new ones too; it never reuses old sessions.                                                                                                                                                                   |
| Requests                             | **104** on a complete passing run (fewer if a scenario stops early), one at a time: 17 `POST /work-sessions` (two are deliberately invalid and must create nothing), 33 `POST /work-sessions/{id}/events`, 53 `GET /work-sessions/{id}`, 1 `GET /work-sessions/{id}/export`. No retries. |
| Who acts                             | Every request uses the single Authorization credential. The `Jarvis-Actor-Id` header is `actor_id`, except where a scenario removes it (HEADERS-001) or swaps in `unauthorized_actor_id` (AUTH-001). AUTH-002 puts `unauthorized_actor_id` in the event body only.                       |
| Markers on created records           | `objective` is `Flow Conformance Lab isolated lifecycle probe`. `created_by_actor_id`, the Worker IDs and `policy_id` are the values from your config.                                                                                                                                   |
| State left behind                    | A conformant host ends with 14 sessions `completed` (revision 2) and 1 `closed` (revision 3). A host that wrongly accepts a challenged request ends with more `closed` sessions.                                                                                                         |
| Deletion                             | **None.** Jarvis defines no delete endpoint, and the lab does not invent one. Records persist until you remove them with your host's own tools (see [cleanup](#8-cleanup-opt-in)).                                                                                                       |

An inconclusive or cancelled scenario can stop part-way and leave a session `active`.

## 2. Prepare an isolated test tenant

- Use a dedicated tenant or environment that holds only synthetic data. Never run the suite against production: it creates durable records and deliberately sends invalid and unauthorized requests.
- Issue a credential that works only in that tenant.
- Make the host reachable in a way the runner accepts:
  - **Loopback:** `http://127.0.0.1:<port>` or `http://[::1]:<port>`.
  - **Remote:** HTTPS with `--allow-remote`. The hostname must resolve only to public IPv4 addresses. Private-network remote targets and IPv6 are not supported in this release.
  - A base path is fine, for example `https://host.example/jarvis`. Use the final URL: redirects are refused.
- Before using a real credential remotely, apply the [recommended egress policy](security.md#recommended-egress-policy).

## 3. Provision identities and policy

Create these through your host's own administration system. Jarvis defines no provisioning endpoint, so this step is always host-specific.

| Config field            | Provision                                                                                                                                                                                                            | Used by                      |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `actor_id`              | A human Actor that the credential can act as. It must be allowed to create WorkSessions, read them, and append `work_session.completed` and `work_session.closed`.                                                   | Every scenario               |
| `unauthorized_actor_id` | A **real** Actor in the same tenant that the credential **cannot** act as. If the Actor does not exist, a host may answer with a different error than `unauthorized_actor`, and AUTH-001 will be reported as failed. | AUTH-001, AUTH-002, AUTH-003 |
| `human_worker_id`       | A human Worker that the host accepts in a WorkSession created by `actor_id`.                                                                                                                                         | Every scenario (genesis)     |
| `agent_worker_id`       | An agent Worker that the host accepts in the same WorkSession.                                                                                                                                                       | Every scenario (genesis)     |
| `policy_id`             | A Policy that lets the human Actor move `active → completed` and `completed → closed` with no review, takeover, request or other blocking obligation.                                                                | Every scenario               |
| `auth_env`              | Not a host record: the name of the environment variable that holds the complete Authorization header value.                                                                                                          | Credential loading           |

## 4. Configure the run

Copy `examples/target.json` and fill in your values:

```json
{
  "implementation": {
    "name": "Example host",
    "version": "1.4.0",
    "commit": "abc1234"
  },
  "actor_id": "actor-conformance-human",
  "unauthorized_actor_id": "actor-conformance-outsider",
  "human_worker_id": "worker-conformance-human",
  "agent_worker_id": "worker-conformance-agent",
  "policy_id": "policy-conformance-lifecycle",
  "auth_env": "FLOW_AUTHORIZATION"
}
```

Put the credential in the named environment variable, never in the config file or a command-line argument:

```sh
export FLOW_AUTHORIZATION='Bearer <test-tenant-token>'
```

## 5. Preflight: run one scenario first

CORE-001 exercises genesis, read and one accepted event. If it passes, provisioning is basically right:

```sh
node dist/apps/cli/index.js test https://host.example/jarvis \
  --allow-remote --config my-host.json --test CORE-001 --verbose
```

Omit `--allow-remote` for a loopback target. If CORE-001 is inconclusive, fix that before running the full suite (see [troubleshooting](#7-troubleshooting)). Each attempt creates one more session.

## 6. Full run and reading results

```sh
node dist/apps/cli/index.js test https://host.example/jarvis \
  --allow-remote --config my-host.json --output runs
```

| Exit | Meaning                                                                               |
| ---- | ------------------------------------------------------------------------------------- |
| 0    | Every selected scenario passed                                                        |
| 1    | At least one observed protocol failure                                                |
| 2    | Configuration or evidence error, or no failures but something inconclusive or skipped |

- The command prints the evidence directory, `runs/<run-id>/`. Open `runs/<run-id>/report/index.html` to inspect results offline.
- `node dist/apps/cli/index.js inspect runs/<run-id>` verifies the manifest hashes.
- **Failed** means the host was observed doing the wrong thing.
- **Inconclusive** means a prerequisite was missing, so the scenario could not isolate the rule it tests. That is usually provisioning, not host behaviour.

## 7. Troubleshooting

The diagnostic's **Observed** text names the cause. Common ones:

| Observed                                                                                    | Likely cause                                                                                            | Fix                                                                                                                                    |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `Valid genesis prerequisite not accepted: HTTP 401/403 …`                                   | Credential missing, expired, for another tenant, or unable to act as `actor_id`                         | Check `auth_env` and the credential's Actor binding                                                                                    |
| `Valid genesis prerequisite not accepted: … error_id=missing_policy` or `policy_denied`     | Unknown `policy_id`, or the policy forbids creation                                                     | Provision the policy described in section 3                                                                                            |
| `Valid genesis prerequisite not accepted: … error_id=stale_request_timestamp`               | The runner's clock differs from the host's                                                              | Sync the runner's clock (NTP)                                                                                                          |
| `Positive control not accepted: … review_required`, `request_unresolved` or `policy_denied` | The policy attaches obligations to completion                                                           | Use a policy with no blocking obligations                                                                                              |
| `Positive control not accepted: HTTP 400 …` on a valid-looking event                        | The host may require the richer transition payload described in the WorkSession prose                   | A known specification conflict: see [research](research.md) and the [upstream issue draft](upstream/worksession-transition-payload.md) |
| `Snapshot read unavailable: HTTP 404 …`                                                     | Wrong base path, or `actor_id` cannot read its own sessions                                             | Check the base URL and read permission                                                                                                 |
| AUTH-001 or AUTH-003 failed with an error other than `unauthorized_actor`                   | `unauthorized_actor_id` does not exist, or the credential can act as it                                 | Provision a real Actor the credential cannot act as                                                                                    |
| EXPORT-001 failed with `missing_idempotency_key` or another mutation-header error           | The host requires mutation-only headers on export reads, which the spec forbids                         | A host fix: export reads take only the read headers                                                                                    |
| `request_timeout`                                                                           | A slow host or network                                                                                  | Raise `--timeout` (up to 60000 ms)                                                                                                     |
| `non_json_response` or `redirect_refused`                                                   | The URL is not the final API URL (an HTML page, a login page, an HTTP→HTTPS or trailing-slash redirect) | Use the exact API base URL                                                                                                             |
| `non_public_remote_address`                                                                 | The hostname resolves to a private, loopback, link-local or IPv6 address                                | Not supported for remote targets in this release                                                                                       |
| `target_requires_explicit_remote_https`                                                     | A non-loopback target without HTTPS or without `--allow-remote`                                         | Use `https://` and add `--allow-remote`                                                                                                |
| `remote_targets_disabled`                                                                   | `FLOW_CONFORMANCE_LOOPBACK_ONLY=1` is set in the environment                                            | Unset it for jobs that are meant to reach a remote host                                                                                |
| CLI prints `configuration_or_evidence_error` and exits 2 before any test                    | Invalid config schema, empty credential variable, unsafe target URL or bad options                      | Check the config against section 4 and that the credential variable is exported                                                        |

## 8. Cleanup (opt-in)

Cleanup is optional and always done with your host's tools, never by this lab. The sessions a run leaves are terminal (`completed` or `closed`), so leaving them in an isolated tenant is safe. Choose one approach:

1. **Disposable tenant per run (recommended).** Create the tenant, provision section 3, run, keep the evidence, then delete the whole tenant. Nothing is left and there is nothing to filter.
2. **Long-lived test tenant, purged deliberately.** Remove only the sessions a run created, identified from its evidence. List them, check the list, then delete them with your admin tooling:

   ```sh
   jq -r '.results[] | .definition.id as $t | .exchanges[]
     | select(.request.method == "POST" and .request.path == "/work-sessions"
              and .response.status == 201)
     | "\($t) \(.request.body.id)"' runs/<run-id>/run.json
   ```

   Without `jq`:

   ```sh
   node -e 'const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
   for (const t of r.results) for (const e of t.exchanges)
     if (e.request.method === "POST" && e.request.path === "/work-sessions" && e.response?.status === 201)
       console.log(t.definition.id, e.request.body.id);' runs/<run-id>/run.json
   ```

3. **Leave them.** This is acceptable in a dedicated test tenant that nothing else reads.

Rules for any purge:

- Scope it to the test tenant **and** to the session IDs from `run.json`. In a shared tenant, never select by the `objective` marker or by actor alone.
- Never run a purge against production.
- Keep the evidence directory. It stays a valid historical record after the host data is gone, and `replay` creates new sessions, so it never needs the old ones.

## 9. After the run

- Revoke or rotate the test credential if anyone else could have seen it.
- Store `runs/` privately. It contains redacted requests, but host responses can still carry business content (see [security](security.md#residual-limits)).
- Review `issue` and `claim` drafts before sharing them. The CLI never publishes anything.
