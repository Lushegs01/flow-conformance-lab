import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { counts, RunSchema, type Run } from "../../src/model.js";
import "./style.css";

function App({ initial }: { initial: Run }) {
  const [run, setRun] = useState(initial);
  const [compare, setCompare] = useState<Run>();
  const [selected, setSelected] = useState(
    initial.results.find((r) => r.status === "failed")?.definition.id ??
      initial.selected_tests[0],
  );
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [error, setError] = useState("");
  const c = counts(run);
  const result =
    run.results.find((r) => r.definition.id === selected) ?? run.results[0]!;
  const tests = run.results.filter(
    (r) =>
      (status === "all" || r.status === status) &&
      (category === "all" || r.definition.category === category) &&
      `${r.definition.id} ${r.definition.name}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const load = async (
    event: React.ChangeEvent<HTMLInputElement>,
    comparison: boolean,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 32 * 1024 * 1024) throw Error();
      const value = RunSchema.parse(JSON.parse(await file.text()));
      if (comparison) setCompare(value);
      else {
        setRun(value);
        setSelected(
          value.results.find((r) => r.status === "failed")?.definition.id ??
            value.selected_tests[0],
        );
        setCompare(undefined);
      }
      setError("");
    } catch {
      setError(
        "Could not load this file. Choose a valid run.json under 32 MiB. Imported JSON is schema-checked; use CLI inspect to verify manifest integrity.",
      );
    }
    event.target.value = "";
  };
  const sameBasis =
    compare &&
    compare.protocol_commit === run.protocol_commit &&
    compare.suite_version === run.suite_version;
  return (
    <>
      <header>
        <div className="brand">
          <span className="mark">F/</span>
          <div>
            FLOW CONFORMANCE LAB<small>PROTOCOL EVIDENCE INSPECTOR</small>
          </div>
        </div>
        <nav>
          <label className="button">
            Open run
            <input
              aria-label="Open run JSON"
              type="file"
              accept=".json"
              onChange={(e) => void load(e, false)}
            />
          </label>
          <label className="button">
            Compare run
            <input
              aria-label="Compare run JSON"
              type="file"
              accept=".json"
              onChange={(e) => void load(e, true)}
            />
          </label>
        </nav>
      </header>
      <main>
        <div className="eyebrow">
          CONFORMANCE RUN / {run.run_id.slice(0, 8)}
        </div>
        <div className="title">
          <div>
            <h1>{run.config.implementation.name}</h1>
            <p>
              Implementation {run.config.implementation.version} · Jarvis{" "}
              {run.protocol_version} · Suite {run.suite_version}
            </p>
          </div>
          <span
            className={`outcome ${c.failed ? "failed" : c.inconclusive ? "inconclusive" : "passed"}`}
          >
            {c.failed
              ? "Failures observed"
              : c.inconclusive
                ? "Evidence incomplete"
                : "Selected tests passed"}
          </span>
        </div>
        <div className="boundary">{run.notice}</div>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <section className="metrics" aria-label="Run statistics">
          {[
            ["Total", run.results.length],
            ["Passed", c.passed],
            ["Failed", c.failed],
            ["Skipped", c.skipped],
            ["Inconclusive", c.inconclusive],
          ].map(([label, value]) => (
            <div key={label}>
              <strong className={String(label).toLowerCase()}>{value}</strong>
              <span>{label}</span>
            </div>
          ))}
          <div>
            <strong>
              {(run.duration_ms / 1000).toFixed(2)}
              <small>s</small>
            </strong>
            <span>Duration</span>
          </div>
        </section>
        <div className="metadata">
          <span>{new Date(run.started_at).toISOString()}</span>
          <span>Source {run.protocol_commit.slice(0, 12)}</span>
          <span>{run.target}</span>
        </div>
        {compare && (
          <section className="comparison">
            <div className="section-heading">
              <h2>Run comparison</h2>
              <button onClick={() => setCompare(undefined)}>
                Close comparison
              </button>
            </div>
            <p>
              Current {run.run_id.slice(0, 8)} → loaded{" "}
              {compare.run_id.slice(0, 8)} ·{" "}
              {compare.config.implementation.name}
            </p>
            {!sameBasis && (
              <p className="error">
                Different protocol or suite basis. These results are not
                directly comparable.
              </p>
            )}
            <table>
              <thead>
                <tr>
                  <th>Scenario</th>
                  <th>Current</th>
                  <th>Loaded</th>
                  <th>Change</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(
                  new Set([...run.selected_tests, ...compare.selected_tests]),
                ).map((id) => {
                  const a = run.results.find((t) => t.definition.id === id);
                  const b = compare.results.find((t) => t.definition.id === id);
                  const comparable =
                    sameBasis &&
                    a &&
                    b &&
                    a.definition.version === b.definition.version;
                  return (
                    <tr key={id}>
                      <td>{id}</td>
                      <td>{a?.status ?? "not run"}</td>
                      <td>{b?.status ?? "not run"}</td>
                      <td>
                        {!comparable
                          ? "Different coverage / basis"
                          : a.status === b.status
                            ? "Unchanged"
                            : a.status === "passed" && b.status === "failed"
                              ? "Regression"
                              : `${a.status} → ${b.status}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}
        <div className="workspace">
          <aside>
            <div className="section-heading">
              <h2>Test explorer</h2>
              <span>{tests.length}</span>
            </div>
            <input
              aria-label="Search tests"
              className="search"
              placeholder="Search ID or requirement…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="filters">
              <select
                aria-label="Filter by status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                {["all", "failed", "passed", "inconclusive", "skipped"].map(
                  (s) => (
                    <option key={s} value={s}>
                      {s === "all" ? "All results" : s}
                    </option>
                  ),
                )}
              </select>
              <select
                aria-label="Filter by protocol area"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {[
                  "all",
                  ...new Set(run.results.map((r) => r.definition.category)),
                ].map((s) => (
                  <option key={s} value={s}>
                    {s === "all" ? "All areas" : s}
                  </option>
                ))}
              </select>
            </div>
            <div className="test-list">
              {tests.map((t) => (
                <button
                  className={`test ${selected === t.definition.id ? "selected" : ""}`}
                  key={t.definition.id}
                  onClick={() => setSelected(t.definition.id)}
                >
                  <span className="test-top">
                    <code>{t.definition.id}</code>
                    <span className={`badge ${t.status}`}>{t.status}</span>
                  </span>
                  <strong>{t.definition.name}</strong>
                  <small>
                    {t.definition.category} ·{" "}
                    {(t.duration_ms / 1000).toFixed(2)}s
                  </small>
                </button>
              ))}
              {!tests.length && (
                <p className="empty">No tests match these filters.</p>
              )}
            </div>
          </aside>
          <article>
            <div className="section-heading">
              <code>
                {result.definition.id} / v{result.definition.version}
              </code>
              <span className={`badge ${result.status}`}>{result.status}</span>
            </div>
            <h2 className="detail-title">{result.definition.name}</h2>
            <p>{result.definition.purpose}</p>
            <div className={`diagnostic ${result.status}`}>
              <div className="eyebrow">
                {result.status === "failed"
                  ? "OBSERVED PROTOCOL FAILURE"
                  : "OBSERVATION"}{" "}
                · {result.diagnostic.confidence.toUpperCase()} CONFIDENCE
              </div>
              <h3>Expected behavior</h3>
              <p>{result.diagnostic.expected}</p>
              <h3>Observed behavior</h3>
              <p>{result.diagnostic.observed}</p>
              {result.diagnostic.possible_causes.length > 0 && (
                <>
                  <h3>Possible cause</h3>
                  <p>{result.diagnostic.possible_causes.join(" ")}</p>
                </>
              )}
            </div>
            <details open>
              <summary>Requirement & reproduction</summary>
              <p>{result.definition.requirement}</p>
              <h3>Setup</h3>
              <p>{result.definition.setup}</p>
              <ol>
                {result.diagnostic.reproduction.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
              <p className="muted">
                Replay reconstructs this scenario with fresh state. Supply the
                credential environment and an explicit target.
              </p>
              <pre>
                flow-conformance replay {run.run_id} --base-url &lt;target&gt;
                --config &lt;config.json&gt; --test {result.definition.id}
              </pre>
              {result.diagnostic.references
                .filter((url) =>
                  url.startsWith("https://github.com/Flow-Research/jarvis/"),
                )
                .map((url, i) => (
                  <a key={url} href={url} target="_blank" rel="noreferrer">
                    Protocol reference {i + 1} ↗{" "}
                  </a>
                ))}
            </details>
            <details open>
              <summary>
                Request sequence{" "}
                <span>{result.exchanges.length} exchanges</span>
              </summary>
              {result.exchanges.map((e) => (
                <details className="exchange" key={e.sequence}>
                  <summary>
                    <span className="method">{e.request.method}</span>
                    <code>{e.request.path}</code>
                    <span>
                      {e.response?.status ?? e.error} · {e.duration_ms}ms
                    </span>
                  </summary>
                  <h3>Request · {e.timestamp}</h3>
                  <pre>{JSON.stringify(e.request, null, 2)}</pre>
                  <h3>Response (redacted JSON)</h3>
                  <pre>
                    {JSON.stringify(e.response ?? { error: e.error }, null, 2)}
                  </pre>
                </details>
              ))}
            </details>
          </article>
        </div>
        <details className="limitations">
          <summary>Coverage & evidence limitations</summary>
          <ul>
            {run.limitations.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          <p>
            Offline inspector. No telemetry, remote requests, target execution
            or issue publishing. CLI inspect verifies manifest hashes; a hash is
            not a signature.
          </p>
        </details>
        <footer>
          Evidence over claims. Independent tooling; no Flow Research
          endorsement implied.
        </footer>
      </main>
    </>
  );
}
const mount = document.getElementById("root")!;
try {
  const run = RunSchema.parse(
    JSON.parse(document.getElementById("run-data")!.textContent!),
  );
  createRoot(mount).render(<App initial={run} />);
} catch {
  mount.textContent =
    "Invalid conformance evidence. Use CLI inspect to validate the run.";
}
