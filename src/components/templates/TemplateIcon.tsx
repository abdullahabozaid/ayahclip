import type { SVGProps } from "react";

export type TemplateIconName =
  | "arrow-left"
  | "broll"
  | "check"
  | "copy"
  | "download"
  | "expand"
  | "image"
  | "layout"
  | "minimal"
  | "motion"
  | "nature"
  | "reciter"
  | "refresh"
  | "save"
  | "settings"
  | "sparkles"
  | "trash"
  | "type";

const paths: Record<TemplateIconName, React.ReactNode> = {
  "arrow-left": <path d="M15 18l-6-6 6-6" />,
  broll: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M8 5v14M16 5v14M3 9h5M16 9h5M3 15h5M16 15h5" /></>,
  check: <path d="M5 12l4 4L19 6" />,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3" /></>,
  download: <><path d="M12 3v12M7 10l5 5 5-5" /><path d="M5 21h14" /></>,
  expand: <><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" /><path d="M3 8l5-5M21 8l-5-5M3 16l5 5M21 16l-5 5" /></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 15l-5-5L5 20" /></>,
  layout: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16M9 10h12" /></>,
  minimal: <><path d="M5 7h14M7 12h10M9 17h6" /></>,
  motion: <><path d="M13 2L3 14h8l-1 8 11-13h-8z" /></>,
  nature: <><path d="M3 20l7-12 4 7 2-3 5 8z" /><path d="M17 5h.01" /></>,
  reciter: <><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3" /></>,
  refresh: <><path d="M20 6v5h-5" /><path d="M4 18v-5h5" /><path d="M18.5 9a7 7 0 0 0-12-3L4 8M5.5 15a7 7 0 0 0 12 3l2.5-2" /></>,
  save: <><path d="M5 3h12l2 2v16H5z" /><path d="M8 3v6h8V3M8 21v-8h8v8" /></>,
  settings: <><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="9" cy="6" r="2" fill="var(--ink)" /><circle cx="15" cy="12" r="2" fill="var(--ink)" /><circle cx="11" cy="18" r="2" fill="var(--ink)" /></>,
  sparkles: <><path d="M12 3l1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2z" /><path d="M5 14l.8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8zM19 13l.6 1.4L21 15l-1.4.6L19 17l-.6-1.4L17 15l1.4-.6z" /></>,
  trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6" /></>,
  type: <><path d="M4 7V4h16v3M12 4v16M8 20h8" /></>,
};

export function TemplateIcon({ name, ...props }: { name: TemplateIconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {paths[name]}
    </svg>
  );
}
