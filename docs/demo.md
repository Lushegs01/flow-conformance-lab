# Two-minute demonstration

Prepare with `npm ci --ignore-scripts`, `npm run build` and `npm test`. Set a disposable `FLOW_AUTHORIZATION` value in your demo terminals. Replace `<good>` and `<bad>` below with evidence directories printed by the CLI. Commands use `node dist/apps/cli/index.js`; `npm link` optionally enables the short binary name.

| Time  | Action and narration                                                                                                                                                                         |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 00:00 | “Record validation checks a document. This tool sends requests to a running host and checks whether the host enforces the selected protocol rules. It produces evidence, not certification.” |
| 00:20 | Start `npm run host:reference` in terminal 1.                                                                                                                                                |
| 00:30 | Run `node dist/apps/cli/index.js test http://127.0.0.1:4000` in terminal 2.                                                                                                                  |
| 00:45 | Show nine passed scenarios and the generated evidence directory. “Only the declared subset was tested.”                                                                                      |
| 01:00 | Start `npm run host:broken` in terminal 3.                                                                                                                                                   |
| 01:10 | Run `node dist/apps/cli/index.js test http://127.0.0.1:4001`. Show four failures and exit 1.                                                                                                 |
| 01:25 | Open `<bad>/report/index.html`; filter failed tests.                                                                                                                                         |
| 01:35 | Select STATE-001. Show expected stale rejection versus HTTP 201, revision 2 -> 3. Expand its request sequence to see the stale header and subsequent read.                                   |
| 01:45 | Run `node dist/apps/cli/index.js replay <bad> --base-url http://127.0.0.1:4001 --test STATE-001`. The same behavior fails with fresh state.                                                  |
| 01:52 | Run `node dist/apps/cli/index.js inspect <bad>`; point out the retained manifest and redacted exchanges. Evidence was automatically generated during execution.                              |
| 02:00 | Run `node dist/apps/cli/index.js issue <bad> --test STATE-001 --output issue.md`. Show the draft; nothing was published.                                                                     |

For an automated rehearsal use `npm run demo`. It creates a passing run, a failing run, a replay run, inspector pages, claims and a ready-to-review issue draft. The temporary hosts stop afterward. `runs/demo-latest.json` identifies artifacts; the ephemeral target ports are historical observations, not servers that remain available.

Optional: use **Compare run** in the broken inspector and choose `<good>/run.json`. Four rows change from failed to passed. The comparison checks source/suite/test basis before labeling a difference comparable.
