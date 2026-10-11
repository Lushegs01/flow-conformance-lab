import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { counts, RunSchema, type Run } from "../../src/model.js";
import { OutcomeChart, OutcomeTable, outcomes } from "./chart.js";
import { Badge, Icon, STATUS_ICON, type IconName } from "./icons.js";
import "./style.css";

const SECTIONS: [string, string, IconName][] = [
  ["overview", "Overview", "grid"],
  ["statistics", "Request outcomes", "chart"],
  ["detail", "Scenario detail", "doc"],
  ["tests", "Test explorer", "list"],
];
const FILTERS = {
  all: "All results",
  failed: "Failed",
  passed: "Passed",
  inconclusive: "Inconclusive",
  skipped: "Skipped",
} as const;

const PROJECT_URL = "https://github.com/Lushegs01/flow-conformance-lab";
const firstFailure = (run: Run) =>
  run.results.find((r) => r.status === "failed")?.definition.id;
const motion = (): ScrollBehavior =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";

function Ring({ value }: { value: number }) {
  const c = 2 * Math.PI * 5;
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <circle
        cx="7"
        cy="7"
        r="5"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.3"
        strokeWidth="2"
      />
      <circle
        cx="7"
        cy="7"
        r="5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={`${(value / 100) * c} ${c}`}
        transform="rotate(-90 7 7)"
      />
    </svg>
  );
}

function StatCard({
  tone,
  icon,
  label,
  value,
  unit,
  percent,
  percentLabel,
  filled,
  total,
}: {
  tone: "neutral" | "blue";
  icon: IconName;
  label: string;
  value: number;
  unit: string;
  percent: number;
  percentLabel: string;
  filled: number;
  total: number;
}) {
  const blocks = total > 12 ? 10 : total;
  const on = total > 12 ? Math.round((filled / total) * 10) : filled;
  return (
    <div className={`stat-card ${tone}`}>
      <div className="stat-head">
        <span className="icon-tile">
          <Icon name={icon} />
        </span>
        <h2>{label}</h2>
      </div>
      <div className="stat-value">
        <strong>{value}</strong>
        <span className="stat-side">
          <span className="chip">
            {percent}%<span className="sr-only"> {percentLabel}</span>
            <Ring value={percent} />
          </span>
          <span className="unit">{unit}</span>
        </span>
      </div>
      <div
        className="segments"
        role="img"
        aria-label={`${filled} of ${total} ${percentLabel}`}
      >
        {Array.from({ length: blocks }, (_, i) => (
          <span key={i} className={i < on ? "on" : ""} />
        ))}
      </div>
    </div>
  );
}

function App({ initial, sample }: { initial: Run; sample: boolean }) {
  const [run, setRun] = useState(initial);
  const [compare, setCompare] = useState<Run>();
  const [selected, setSelected] = useState(
    firstFailure(initial) ?? initial.selected_tests[0],
  );
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<keyof typeof FILTERS>("all");
  const [category, setCategory] = useState("all");
  const [error, setError] = useState("");
  const [view, setView] = useState<"chart" | "table">("chart");
  const [section, setSection] = useState("overview");
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
  const exchanges = run.results.map(outcomes).reduce(
    (sum, o) => ({
      accepted: sum.accepted + o.accepted,
      total: sum.total + o.total,
    }),
    { accepted: 0, total: 0 },
  );
  const failure = firstFailure(run);
  const outcome = c.failed
    ? "failed"
    : c.inconclusive
      ? "inconclusive"
      : "passed";

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) setSection(entry.target.id);
      },
      { rootMargin: "-30% 0px -65% 0px" },
    );
    for (const id of ["overview", "statistics", "detail", "limitations"]) {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, []);

  const reveal = (id: string) => {
    setSelected(id);
    const detail = document.getElementById("detail");
    if (!detail) return;
    const top = detail.getBoundingClientRect().top;
    if (top < 0 || top > window.innerHeight * 0.5)
      detail.scrollIntoView({ behavior: motion(), block: "start" });
  };
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
        setSelected(firstFailure(value) ?? value.selected_tests[0]);
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
    <div className="shell">
      <nav className="rail" aria-label="Sections">
        <a className="rail-logo" href="#overview" aria-label="Overview">
          <Icon name="spark" size={20} />
        </a>
        <div className="rail-links">
          {SECTIONS.map(([id, label, icon]) => (
            <a
              key={id}
              href={`#${id}`}
              className="rail-link"
              aria-label={label}
              aria-current={section === id ? "location" : undefined}
              onClick={() => setSection(id)}
            >
              <Icon name={icon} size={20} />
              <span className="rail-tip" aria-hidden="true">
                {label}
              </span>
            </a>
          ))}
        </div>
        <a
          href="#limitations"
          className="rail-link rail-bottom"
          aria-label="Limitations"
          aria-current={section === "limitations" ? "location" : undefined}
          onClick={() => {
            const limits = document.getElementById("limitations");
            if (limits instanceof HTMLDetailsElement) limits.open = true;
            setSection("limitations");
          }}
        >
          <Icon name="book" size={20} />
          <span className="rail-tip" aria-hidden="true">
            Limitations
          </span>
        </a>
      </nav>
      <div className="page">
        {sample && run === initial && (
          <aside className="sample-banner" aria-label="About this report">
            <span className="sample-icon" aria-hidden="true">
              <Icon name="alert" size={16} />
            </span>
            <p>
              <strong>Sample report.</strong> This is a demonstration run
              against one of the lab's bundled test hosts, not a real
              implementation. This page is an offline evidence inspector: it
              cannot test servers from your browser. To test your own Jarvis
              host, run the command-line tool.
            </p>
            <a href={`${PROJECT_URL}#readme`} target="_blank" rel="noreferrer">
              How to run it
              <Icon name="arrow" size={14} />
            </a>
          </aside>
        )}
        <header className="page-head" id="overview">
          <div className="headline">
            <div className="eyebrow">
              Flow Conformance Lab · Evidence inspector
              <code>run {run.run_id.slice(0, 8)}</code>
            </div>
            <h1>
              {run.config.implementation.name}{" "}
              <span className={`headline-pill ${outcome}`} aria-hidden="true">
                <Icon
                  name={STATUS_ICON[outcome]}
                  className="headline-icon"
                  size={26}
                />
              </span>
            </h1>
            <p className="subtitle">
              Implementation {run.config.implementation.version} · Jarvis{" "}
              {run.protocol_version} · Suite {run.suite_version}
            </p>
            <ul className="meta">
              <li>
                <b>Started</b>
                {new Date(run.started_at).toISOString()}
              </li>
              <li>
                <b>Source</b>
                {run.protocol_commit.slice(0, 12)}
              </li>
              <li>
                <b>Target</b>
                {run.target}
              </li>
            </ul>
          </div>
          <div className="actions">
            <label className="pill-button light">
              <Icon name="compare" />
              Compare run
              <input
                aria-label="Compare run JSON"
                type="file"
                accept=".json"
                onChange={(e) => void load(e, true)}
              />
            </label>
            <label className="pill-button primary">
              <Icon name="plus" />
              Open run
              <input
                aria-label="Open run JSON"
                type="file"
                accept=".json"
                onChange={(e) => void load(e, false)}
              />
            </label>
          </div>
        </header>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="layout">
          <div className="main-col">
            <div className="tabs" role="group" aria-label="Filter by status">
              {(Object.keys(FILTERS) as (keyof typeof FILTERS)[]).map((s) => (
                <button
                  key={s}
                  className={`tab${status === s ? " active" : ""}`}
                  aria-pressed={status === s}
                  onClick={() => setStatus(s)}
                >
                  {FILTERS[s]}
                  <span className="tab-count">
                    {s === "all" ? run.results.length : c[s]}
                  </span>
                </button>
              ))}
            </div>
            <section className="stat-grid" aria-label="Run statistics">
              <StatCard
                tone="neutral"
                icon="check"
                label="Scenarios passed"
                value={c.passed}
                unit={`/ ${run.results.length}`}
                percent={Math.round((c.passed / run.results.length) * 100)}
                percentLabel="scenarios passed"
                filled={c.passed}
                total={run.results.length}
              />
              <StatCard
                tone="blue"
                icon="exchange"
                label="HTTP exchanges"
                value={exchanges.total}
                unit={`in ${(run.duration_ms / 1000).toFixed(2)} s`}
                percent={
                  exchanges.total
                    ? Math.round((exchanges.accepted / exchanges.total) * 100)
                    : 0
                }
                percentLabel="exchanges accepted (2xx)"
                filled={exchanges.accepted}
                total={exchanges.total}
              />
              <div className={`promo ${outcome}`}>
                <svg
                  className="promo-art"
                  viewBox="0 0 200 200"
                  aria-hidden="true"
                >
                  {[30, 55, 80, 105].map((r) => (
                    <circle
                      key={r}
                      cx="150"
                      cy="50"
                      r={r}
                      fill="none"
                      stroke="currentColor"
                    />
                  ))}
                </svg>
                <div className="eyebrow">Run outcome</div>
                <h2>
                  {c.failed
                    ? "Failures observed"
                    : c.inconclusive
                      ? "Evidence incomplete"
                      : "Selected tests passed"}
                </h2>
                <p className="promo-counts">
                  {c.failed} failed · {c.inconclusive} inconclusive ·{" "}
                  {c.skipped} skipped
                </p>
                <p className="promo-notice">{run.notice}</p>
                <button
                  className="promo-button"
                  onClick={() => reveal(failure ?? result.definition.id)}
                >
                  {failure ? `Inspect ${failure}` : "Review evidence"}
                  <Icon name="play" size={16} />
                </button>
              </div>
            </section>
            {compare && (
              <section className="card comparison">
                <div className="card-head">
                  <span className="icon-tile">
                    <Icon name="compare" />
                  </span>
                  <h2>Run comparison</h2>
                  <button
                    className="ghost-button"
                    onClick={() => setCompare(undefined)}
                  >
                    Close comparison
                  </button>
                </div>
                <p className="card-note">
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
                <div className="table-wrap">
                  <table className="data-table">
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
                        new Set([
                          ...run.selected_tests,
                          ...compare.selected_tests,
                        ]),
                      ).map((id) => {
                        const a = run.results.find(
                          (t) => t.definition.id === id,
                        );
                        const b = compare.results.find(
                          (t) => t.definition.id === id,
                        );
                        const comparable =
                          sameBasis &&
                          a &&
                          b &&
                          a.definition.version === b.definition.version;
                        const regression =
                          comparable &&
                          a.status === "passed" &&
                          b.status === "failed";
                        return (
                          <tr key={id}>
                            <td>
                              <code>{id}</code>
                            </td>
                            <td>
                              {a ? <Badge status={a.status} /> : "not run"}
                            </td>
                            <td>
                              {b ? <Badge status={b.status} /> : "not run"}
                            </td>
                            <td className={regression ? "regression" : ""}>
                              {!comparable
                                ? "Different coverage / basis"
                                : a.status === b.status
                                  ? "Unchanged"
                                  : regression
                                    ? "Regression"
                                    : `${a.status} → ${b.status}`}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
            <section
              id="statistics"
              className="card chart-card"
              aria-labelledby="statistics-title"
            >
              <div className="card-head">
                <span className="icon-tile">
                  <Icon name="chart" />
                </span>
                <h2 id="statistics-title">Request outcomes</h2>
                <ul className="legend">
                  <li>
                    <i className="key accepted" />
                    Accepted (2xx)
                  </li>
                  <li>
                    <i className="key rejected" />
                    Rejected or error
                  </li>
                </ul>
                <div className="segmented" role="group" aria-label="Display">
                  {(["chart", "table"] as const).map((v) => (
                    <button
                      key={v}
                      aria-pressed={view === v}
                      onClick={() => setView(v)}
                    >
                      {v === "chart" ? "Chart" : "Table"}
                    </button>
                  ))}
                </div>
              </div>
              <p className="card-note">
                HTTP exchanges per scenario. Select a scenario to inspect it;
                filters dim the scenarios they exclude.
              </p>
              {view === "chart" ? (
                <OutcomeChart
                  results={run.results}
                  visible={new Set(tests.map((t) => t.definition.id))}
                  selected={result.definition.id}
                  onSelect={setSelected}
                />
              ) : (
                <OutcomeTable results={run.results} onSelect={setSelected} />
              )}
            </section>
            <section
              id="detail"
              className="card detail"
              aria-labelledby="detail-title"
            >
              <div className="detail-head">
                <span className={`icon-tile ${result.status}`}>
                  <Icon name={STATUS_ICON[result.status]} />
                </span>
                <div>
                  <code>
                    {result.definition.id} / v{result.definition.version} ·{" "}
                    {result.definition.category}
                  </code>
                  <h2 id="detail-title">{result.definition.name}</h2>
                </div>
                <Badge status={result.status} />
              </div>
              <p className="lead">{result.definition.purpose}</p>
              <div className={`diagnostic ${result.status}`}>
                <div className="eyebrow">
                  {result.status === "failed"
                    ? "Observed protocol failure"
                    : "Observation"}{" "}
                  · {result.diagnostic.confidence} confidence
                </div>
                <div className="diag-grid">
                  <div>
                    <h3>Expected behavior</h3>
                    <p>{result.diagnostic.expected}</p>
                  </div>
                  <div>
                    <h3>Observed behavior</h3>
                    <p>{result.diagnostic.observed}</p>
                  </div>
                </div>
                {result.diagnostic.possible_causes.length > 0 && (
                  <div className="cause">
                    <h3>Possible cause</h3>
                    <p>{result.diagnostic.possible_causes.join(" ")}</p>
                  </div>
                )}
              </div>
              <details className="panel" open>
                <summary>
                  Requirement & reproduction
                  <Icon name="chevron" className="chev" />
                </summary>
                <div className="panel-body">
                  <p>{result.definition.requirement}</p>
                  <h3>Setup</h3>
                  <p>{result.definition.setup}</p>
                  <ol className="steps">
                    {result.diagnostic.reproduction.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                  <p className="muted">
                    Replay reconstructs this scenario with fresh state. Supply
                    the credential environment and an explicit target.
                  </p>
                  <pre className="command">
                    {`flow-conformance replay ${run.run_id} --base-url <target> --config <config.json> --test ${result.definition.id}`}
                  </pre>
                  <div className="refs">
                    {result.diagnostic.references
                      .filter((url) =>
                        url.startsWith(
                          "https://github.com/Flow-Research/jarvis/",
                        ),
                      )
                      .map((url, i) => (
                        <a
                          key={url}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Protocol reference {i + 1}
                          <Icon name="arrow" size={14} />
                        </a>
                      ))}
                  </div>
                </div>
              </details>
              <details className="panel" open>
                <summary>
                  Request sequence
                  <span className="summary-meta">
                    {result.exchanges.length} exchanges
                  </span>
                  <Icon name="chevron" className="chev" />
                </summary>
                <div className="panel-body exchange-list">
                  {result.exchanges.map((e) => {
                    const code = e.response?.status;
                    const kind =
                      code === undefined
                        ? "error"
                        : code >= 200 && code < 300
                          ? "ok"
                          : "rejected";
                    return (
                      <details className="exchange" key={e.sequence}>
                        <summary>
                          <span className="seq">{e.sequence}</span>
                          <span
                            className={`method ${e.request.method.toLowerCase()}`}
                          >
                            {e.request.method}
                          </span>
                          <code>{e.request.path}</code>
                          <span className={`code ${kind}`}>
                            {code ?? e.error}
                          </span>
                          <span className="duration">{e.duration_ms}ms</span>
                        </summary>
                        <div className="exchange-body">
                          <div>
                            <h3>Request · {e.timestamp}</h3>
                            <pre>{JSON.stringify(e.request, null, 2)}</pre>
                          </div>
                          <div>
                            <h3>Response (redacted JSON)</h3>
                            <pre>
                              {JSON.stringify(
                                e.response ?? { error: e.error },
                                null,
                                2,
                              )}
                            </pre>
                          </div>
                        </div>
                      </details>
                    );
                  })}
                </div>
              </details>
            </section>
            <details id="limitations" className="card panel limitations">
              <summary>
                <span className="icon-tile">
                  <Icon name="book" />
                </span>
                Coverage & evidence limitations
                <Icon name="chevron" className="chev" />
              </summary>
              <div className="panel-body">
                <ul>
                  {run.limitations.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
                <p>
                  Offline inspector. No telemetry, remote requests, target
                  execution or issue publishing. CLI inspect verifies manifest
                  hashes; a hash is not a signature.
                </p>
              </div>
            </details>
          </div>
          <aside id="tests" className="explorer" aria-labelledby="tests-title">
            <div className="explorer-head">
              <h2 id="tests-title">Test explorer</h2>
              <span className="tab-count">{tests.length}</span>
            </div>
            <label className="search">
              <Icon name="search" />
              <input
                aria-label="Search tests"
                placeholder="Search ID or requirement…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <label className="select">
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
              <Icon name="chevron" />
            </label>
            <div className="test-list">
              {tests.map((t) => (
                <button
                  className={`test-card${selected === t.definition.id ? " selected" : ""}`}
                  key={t.definition.id}
                  aria-pressed={selected === t.definition.id}
                  onClick={() => reveal(t.definition.id)}
                >
                  <span className={`icon-tile ${t.status}`}>
                    <Icon name={STATUS_ICON[t.status]} />
                  </span>
                  <span className="test-body">
                    <span className="test-top">
                      <code>{t.definition.id}</code>
                      <Badge status={t.status} />
                    </span>
                    <strong>{t.definition.name}</strong>
                    <small>
                      {t.definition.category} ·{" "}
                      {(t.duration_ms / 1000).toFixed(2)}s
                    </small>
                  </span>
                </button>
              ))}
              {!tests.length && (
                <p className="empty">No tests match these filters.</p>
              )}
            </div>
          </aside>
        </div>
        <footer>
          Evidence over claims. Independent tooling; no Flow Research
          endorsement implied.
        </footer>
      </div>
    </div>
  );
}
const mount = document.getElementById("root")!;
try {
  const run = RunSchema.parse(
    JSON.parse(document.getElementById("run-data")!.textContent!),
  );
  createRoot(mount).render(
    <App initial={run} sample={mount.dataset.sample === "true"} />,
  );
} catch {
  mount.textContent =
    "Invalid conformance evidence. Use CLI inspect to validate the run.";
}
