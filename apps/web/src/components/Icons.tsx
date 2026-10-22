// Toolbar icons from the prototype: 18 px line icons, stroke 1.6, round caps and joins (SPEC 3.3).
const paths = {
  side: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
    </>
  ),
  back: <path d="M15 5l-7 7 7 7" />,
  share: <path d="M12 15V3M8 7l4-4 4 4M5 12v8h14v-8" />,
  chg: <path d="M12 4v8M8 8h8M8 18h8" />,
  rev: <path d="M4 6h12M4 12h12M4 18h7M15 17l2 2 4-4" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  moon: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />,
};

export type IconName = keyof typeof paths;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
