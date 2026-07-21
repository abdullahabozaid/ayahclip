import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pages — before and after · AyahClip",
  description: "Every page in AyahClip: how it looks now and what to change.",
};

const A = (name: string) => `/design-audit/${name}`;

const CANVAS =
  "https://superdesign.dev/teams/d361617d-95b6-4070-b9a0-69f1a8cb9a71/projects/10597451-2228-4945-9a69-12376995f613";

type Status = "shipped" | "todo" | "fine";

interface Screen {
  id: string;
  name: string;
  role: string;
  before: string;
  after?: string;
  status: Status;
  notes: string[];
}

const SCREENS: Screen[] = [
  {
    id: "home",
    name: "Home",
    role: "First page you land on",
    before: A("audit-home.png"),
    status: "shipped",
    notes: [
      "Done: hero reads 'Make beautiful Quran clips' in plain words (no 'craft' or 'luminous').",
      "Done: the empty area is now a two-part card — a phone preview on the left, a short line and two buttons on the right.",
      "Done: a plain row (Clear text · Stays private · Ready-made looks) fills the space so the page no longer trails off into black.",
    ],
  },
  {
    id: "library",
    name: "Library",
    role: "Your saved clips",
    before: A("audit-library.png"),
    after: A("after-library.png"),
    status: "todo",
    notes: [
      "When it is empty, show a plain message and buttons (Browse, Import, Bulk) instead of a blank space. This is now added.",
      "While clips load, show a small spinner instead of nothing. Also added.",
      "Move the counts (clips, storage) to the right so the top is less crowded.",
    ],
  },
  {
    id: "bulk",
    name: "Bulk Create",
    role: "One recording into many clips",
    before: A("audit-bulk.png"),
    status: "shipped",
    notes: [
      "Done: results used to show one clip at a time. Now every clip shows in a grid, each with a thumbnail, a tick to keep it, its status, and buttons.",
      "Done: a bar at the top lets you keep all, render, and download in one place.",
      "Done: works on phone in two columns. The long timeline is now tucked away until you open it.",
    ],
  },
  {
    id: "templates",
    name: "Templates",
    role: "Ready-made looks",
    before: A("audit-templates.png"),
    status: "shipped",
    notes: [
      "Done: added text-only presets that change just the words and keep your video.",
      "Done: added more looks, including ones where the text sits at the top or bottom so a video stays visible.",
      "Done: you can save your own by copying one and editing it.",
    ],
  },
  {
    id: "studio",
    name: "Studio",
    role: "The editor",
    before: A("audit-template-studio.png"),
    status: "shipped",
    notes: [
      "Done: the preview was tiny and lost in black. Now it is a clear framed screen that fills the space.",
      "Next: tidy the right panel and turn the three stacked buttons into one clear Export.",
      "(The Template Studio editor is shown here — the main Studio now uses the same framed preview.)",
    ],
  },
  {
    id: "browse",
    name: "Browse",
    role: "Pick a surah",
    before: A("audit-browse.png"),
    status: "shipped",
    notes: [
      "Done: full switch. Instead of opening a Juz to find surahs, all 114 surahs now show as cards you can scan and tap.",
      "Done: each card shows the number, name, Arabic name, meaning, ayah count and Meccan/Medinan — so no two cards look the same.",
      "Done: search filters instantly, a Popular row gives quick taps, and the top row is balanced with a count on the right.",
    ],
  },
  {
    id: "import",
    name: "Import",
    role: "Use your own recording",
    before: A("audit-import.png"),
    status: "todo",
    notes: [
      "There are boxes inside boxes. Flatten each step so it is one clear panel.",
      "Make the choice clear: keep the video, or keep only the audio.",
      "The 1-2-3 steps at the top are good.",
    ],
  },
  {
    id: "support",
    name: "Support",
    role: "About the free app",
    before: A("audit-support.png"),
    status: "fine",
    notes: [
      "Already clean and simple.",
      "This is the plain style to keep on the other pages.",
    ],
  },
  {
    id: "diagnostics",
    name: "Diagnostics",
    role: "Troubleshooting report",
    before: A("audit-diagnostics.png"),
    status: "todo",
    notes: [
      "Fine, but there is a lot of empty space under the card.",
      "Pull the content up, or add the next step so the bottom is not blank.",
    ],
  },
  {
    id: "privacy",
    name: "Privacy",
    role: "How your data is handled",
    before: A("audit-privacy.png"),
    status: "fine",
    notes: [
      "Good layout: the list on the left, the text on the right.",
      "Nothing to change.",
    ],
  },
  {
    id: "terms",
    name: "Terms",
    role: "Terms of use",
    before: A("audit-terms.png"),
    status: "fine",
    notes: ["Same clean layout as Privacy. Fine as is."],
  },
  {
    id: "thanks",
    name: "Thank you",
    role: "After supporting",
    before: A("audit-thanks.png"),
    status: "fine",
    notes: ["Simple and clear. Fine as is."],
  },
];

function StatusBadge({ status }: { status: Status }) {
  const map: Record<Status, { label: string; className: string }> = {
    shipped: { label: "Done", className: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" },
    todo: { label: "To change", className: "border-[var(--gold)]/30 bg-[rgba(201,162,75,0.1)] text-gold-soft" },
    fine: { label: "Fine as is", className: "border-[var(--hairline)] bg-white/[0.03] text-[var(--muted)]" },
  };
  const { label, className } = map[status];
  return (
    <span className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] ${className}`}>
      {label}
    </span>
  );
}

function Shot({ src, label }: { src: string; label: string }) {
  return (
    <figure className="min-w-0">
      <figcaption className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--muted-deep)]">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--gold)]/70" />
        {label}
      </figcaption>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={label} loading="lazy" className="w-full rounded-xl border border-[var(--hairline-soft)] bg-black" />
    </figure>
  );
}

export default function DesignShowcasePage() {
  const done = SCREENS.filter((s) => s.status === "shipped").length;
  const todo = SCREENS.filter((s) => s.status === "todo").length;
  return (
    <main className="bg-mihrab min-h-screen px-5 pb-28 pt-16 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="max-w-3xl">
          <p className="text-xs font-medium uppercase tracking-[0.24em] text-gold-soft/75">AyahClip</p>
          <h1 className="font-display mt-4 text-4xl leading-tight text-parchment sm:text-6xl">Every page, before and after</h1>
          <p className="mt-5 text-sm leading-7 text-[var(--muted)] sm:text-base">
            A look at every page in the app: how it looks now, and what to change to make it cleaner. Same dark and gold
            look, just less clutter. Five pages are already done.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <a href={CANVAS} target="_blank" rel="noreferrer" className="btn-gold inline-flex min-h-11 items-center rounded-full px-5 text-sm">
              Open the design drafts ↗
            </a>
            <span className="text-xs text-[var(--muted-deep)]">
              {SCREENS.length} pages · {done} done · {todo} to change
            </span>
          </div>
        </header>

        <div className="gold-rule my-12" />

        <div className="space-y-20">
          {SCREENS.map((screen, index) => (
            <section key={screen.id} aria-labelledby={`${screen.id}-title`} className="scroll-mt-8">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div className="flex items-baseline gap-4">
                  <span className="font-display text-2xl text-[var(--muted-deep)] tabular-nums">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <h2 id={`${screen.id}-title`} className="text-xl font-medium text-parchment">{screen.name}</h2>
                    <p className="mt-0.5 text-xs text-[var(--muted)]">{screen.role}</p>
                  </div>
                </div>
                <StatusBadge status={screen.status} />
              </div>

              <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
                <div className={`grid gap-5 ${screen.after ? "sm:grid-cols-2" : "grid-cols-1"}`}>
                  <Shot src={screen.before} label="Now" />
                  {screen.after && <Shot src={screen.after} label="Cleaner version" />}
                </div>
                <div className="lg:pt-7">
                  <h3 className="text-[11px] font-medium uppercase tracking-[0.16em] text-gold-soft/70">Notes</h3>
                  <ul className="mt-3 space-y-3">
                    {screen.notes.map((point, i) => (
                      <li key={i} className="flex gap-2.5 text-[13px] leading-6 text-[var(--muted)]">
                        <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--gold)]" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
