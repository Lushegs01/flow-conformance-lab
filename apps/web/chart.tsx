import React from "react";
import type { Result } from "../../src/model.js";
import { Badge, Icon, STATUS_ICON } from "./icons.js";

export function outcomes(result: Result) {
  const accepted = result.exchanges.filter(
    (e) => e.response && e.response.status >= 200 && e.response.status < 300,
  ).length;
  const total = result.exchanges.length;
  return { accepted, rejected: total - accepted, total };
}

function scale(max: number) {
  const step = [1, 2, 5, 10, 20, 25, 50].find((s) => max / s <= 5) ?? 50;
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ticks: number[] = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  return { top, ticks };
}

export function OutcomeChart({
  results,
  visible,
  selected,
  onSelect,
}: {
  results: Result[];
  visible: Set<string>;
  selected: string;
  onSelect: (id: string) => void;
}) {
  const rows = results.map((r) => ({ r, ...outcomes(r) }));
  const { top, ticks } = scale(Math.max(1, ...rows.map((x) => x.total)));
  const pct = (v: number) => `${(v / top) * 100}%`;
  return (
    <div className="chart">
      <div className="chart-axis" aria-hidden="true">
        {ticks.map((t) => (
          <span key={t} style={{ bottom: pct(t) }}>
            {t}
          </span>
        ))}
      </div>
      <div className="chart-scroll">
        <div className="chart-plot">
          <div className="gridlines" aria-hidden="true">
            {ticks.map((t) => (
              <span key={t} style={{ bottom: pct(t) }} />
            ))}
          </div>
          {rows.map(({ r, accepted, rejected, total }, i) => {
            const id = r.definition.id;
            const active = selected === id;
            const side = i >= rows.length / 2 ? "left" : "right";
            return (
              <button
                key={id}
                className={`column${active ? " selected" : ""}${visible.has(id) ? "" : " dimmed"}`}
                aria-pressed={active}
                aria-label={`${id} ${r.definition.name}: ${accepted} accepted, ${rejected} rejected, ${r.status}`}
                onClick={() => onSelect(id)}
              >
                <span className="column-plot">
                  {total ? (
                    <span className="bar" style={{ height: pct(total) }}>
                      {rejected > 0 && (
                        <span className="bar-rejected">
                          {(rejected / top) * 200 >= 28 && (
                            <span className="dot" />
                          )}
                          {active && (
                            <span className="value rejected">{rejected}</span>
                          )}
                        </span>
                      )}
                      {accepted > 0 && (
                        <span
                          className="bar-accepted"
                          style={{ height: `${(accepted / total) * 100}%` }}
                        >
                          <span className="dot" />
                          {active && (
                            <span className="value accepted">{accepted}</span>
                          )}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="bar empty">
                      <span className="dot" />
                    </span>
                  )}
                  {r.status !== "passed" && (
                    <span
                      className={`status-mark ${r.status}`}
                      style={{
                        bottom: `calc(max(${total ? pct(total) : "100%"}, 26px) + 6px)`,
                      }}
                      aria-hidden="true"
                    >
                      <Icon name={STATUS_ICON[r.status]} size={10} />
                    </span>
                  )}
                  <span
                    className={`tip ${side}`}
                    style={{
                      bottom: `clamp(0px, calc(${pct(total)} - 36px), calc(100% - 92px))`,
                    }}
                    aria-hidden="true"
                  >
                    <strong>{id}</strong>
                    <span>
                      <i className="key accepted" />
                      <b>{accepted}</b> accepted
                    </span>
                    <span>
                      <i className="key rejected" />
                      <b>{rejected}</b> rejected or error
                    </span>
                    <em className={r.status}>{r.status}</em>
                  </span>
                </span>
                <span className="column-label">
                  <span>{id.split("-")[0]}</span>
                  <span>{id.split("-")[1]}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function OutcomeTable({
  results,
  onSelect,
}: {
  results: Result[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <caption className="sr-only">
          HTTP exchanges per scenario, split by accepted (2xx) and rejected
          responses
        </caption>
        <thead>
          <tr>
            <th>Scenario</th>
            <th>Status</th>
            <th className="num">Accepted</th>
            <th className="num">Rejected</th>
            <th className="num">Total</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => {
            const o = outcomes(r);
            return (
              <tr key={r.definition.id}>
                <td>
                  <button
                    className="link-button"
                    onClick={() => onSelect(r.definition.id)}
                  >
                    {r.definition.id}
                  </button>{" "}
                  {r.definition.name}
                </td>
                <td>
                  <Badge status={r.status} />
                </td>
                <td className="num">{o.accepted}</td>
                <td className="num">{o.rejected}</td>
                <td className="num">{o.total}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
