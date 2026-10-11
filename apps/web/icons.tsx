import React from "react";

const paths = {
  spark: (
    <path
      d="M12 3c.6 4.6 3.4 7.4 8 8-4.6.6-7.4 3.4-8 8-.6-4.6-3.4-7.4-8-8 4.6-.6 7.4-3.4 8-8z"
      fill="currentColor"
      stroke="none"
    />
  ),
  grid: (
    <>
      <rect x="4" y="4" width="6.5" height="6.5" rx="2" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="2" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="2" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="2" />
    </>
  ),
  chart: <path d="M4 20h16M7 16v-5M12 16V6M17 16v-8" />,
  doc: (
    <>
      <path d="M14 3H7.5A2.5 2.5 0 0 0 5 5.5v13A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </>
  ),
  list: (
    <path d="M9.5 6.5H20M9.5 12H20M9.5 17.5H20M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" />
  ),
  book: (
    <>
      <path d="M4 19V5.5A2.5 2.5 0 0 1 6.5 3H20v14H6.5A2.5 2.5 0 0 0 4 19.5 2.5 2.5 0 0 0 6.5 22H20v-5" />
      <path d="M8.5 7.5h7" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  compare: <path d="M4 8h15l-4-4M20 16H5l4 4" />,
  exchange: <path d="M5 9h13l-3.5-3.5M19 15H6l3.5 3.5" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.3-4.3" />
    </>
  ),
  chevron: <path d="M6.5 9.5 12 15l5.5-5.5" />,
  arrow: <path d="M7 17 17 7M8.5 7H17v8.5" />,
  check: <path d="M5 12.5 9.5 17 19 7.5" />,
  x: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  alert: <path d="M12 7.5v6M12 17h.01" />,
  minus: <path d="M6.5 12h11" />,
  play: <path d="M8 5.5v13l10-6.5z" />,
};

export type IconName = keyof typeof paths;

export function Icon({
  name,
  size = 18,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}

export const STATUS_ICON = {
  passed: "check",
  failed: "x",
  inconclusive: "alert",
  skipped: "minus",
} as const satisfies Record<string, IconName>;

export function Badge({ status }: { status: keyof typeof STATUS_ICON }) {
  return (
    <span className={`badge ${status}`}>
      <Icon name={STATUS_ICON[status]} size={11} />
      {status}
    </span>
  );
}
