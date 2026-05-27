"use client";

import { SAFE_ZONES } from "@/lib/canvas-utils";

export type FrameMode = "studio" | "phone" | "tiktok" | "reels";

export const FRAME_MODES: { id: FrameMode; label: string }[] = [
  { id: "studio", label: "Studio" },
  { id: "phone", label: "Phone" },
  { id: "tiktok", label: "TikTok" },
  { id: "reels", label: "Reels" },
];

/* Icons sized in cqw (1cqw = 1% of the screen's width) so chrome scales with the frame. */
function RailItem({
  icon,
  count,
}: {
  icon: React.ReactNode;
  count?: string;
}) {
  return (
    <div className="flex flex-col items-center" style={{ gap: "0.8cqw" }}>
      <span style={{ width: "9cqw", height: "9cqw" }} className="text-white drop-shadow">
        {icon}
      </span>
      {count && (
        <span style={{ fontSize: "2.8cqw" }} className="font-medium text-white drop-shadow">
          {count}
        </span>
      )}
    </div>
  );
}

const Heart = (
  <svg viewBox="0 0 24 24" className="h-full w-full" fill="currentColor">
    <path d="M12 21s-7.5-4.6-10-9C.5 9 2 5.5 5.3 5.5c1.9 0 3.2 1 3.7 2.2h6c.5-1.2 1.8-2.2 3.7-2.2C22 5.5 23.5 9 22 12c-2.5 4.4-10 9-10 9z" />
  </svg>
);
const Comment = (
  <svg viewBox="0 0 24 24" className="h-full w-full" fill="currentColor">
    <path d="M12 3C6.5 3 2 6.7 2 11.2c0 2.5 1.4 4.8 3.6 6.2L5 21l4.2-2.3c.9.2 1.8.3 2.8.3 5.5 0 10-3.7 10-8.2S17.5 3 12 3z" />
  </svg>
);
const Bookmark = (
  <svg viewBox="0 0 24 24" className="h-full w-full" fill="currentColor">
    <path d="M6 3h12a1 1 0 011 1v17l-7-4-7 4V4a1 1 0 011-1z" />
  </svg>
);
const ShareArrow = (
  <svg viewBox="0 0 24 24" className="h-full w-full" fill="currentColor">
    <path d="M3 11l18-8-8 18-2.5-7.5L3 11z" />
  </svg>
);
const PaperPlane = (
  <svg viewBox="0 0 24 24" className="h-full w-full" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
  </svg>
);
const Dots = (
  <svg viewBox="0 0 24 24" className="h-full w-full" fill="currentColor">
    <circle cx="5" cy="12" r="2" />
    <circle cx="12" cy="12" r="2" />
    <circle cx="19" cy="12" r="2" />
  </svg>
);

/** Non-interactive social-platform UI overlay, scaled to the frame via container queries. */
export function PlatformChrome({ mode }: { mode: FrameMode }) {
  if (mode !== "tiktok" && mode !== "reels") return null;
  const isTikTok = mode === "tiktok";

  return (
    <div className="pointer-events-none absolute inset-0 text-white" style={{ containerType: "inline-size" }}>
      {/* Top */}
      {isTikTok ? (
        <div
          className="absolute inset-x-0 flex items-center justify-center font-semibold drop-shadow"
          style={{ top: "2.5cqw", gap: "4cqw", fontSize: "3.4cqw" }}
        >
          <span className="opacity-60">Following</span>
          <span className="border-b-2 border-white pb-0.5">For You</span>
        </div>
      ) : (
        <div
          className="absolute flex items-center justify-between font-semibold drop-shadow"
          style={{ top: "3cqw", left: "4cqw", right: "4cqw", fontSize: "4cqw" }}
        >
          <span>Reels</span>
          <span style={{ width: "6cqw", height: "6cqw" }}>
            <svg viewBox="0 0 24 24" className="h-full w-full" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="3" y="4" width="18" height="16" rx="3" />
              <circle cx="12" cy="12" r="3.5" />
            </svg>
          </span>
        </div>
      )}

      {/* Right action rail */}
      <div
        className="absolute flex flex-col items-center"
        style={{ right: "3cqw", bottom: isTikTok ? "22cqw" : "20cqw", gap: "5cqw" }}
      >
        {isTikTok && (
          <div className="relative flex flex-col items-center" style={{ marginBottom: "1cqw" }}>
            <span
              className="flex items-center justify-center overflow-hidden rounded-full border-2 border-white bg-gradient-to-br from-[#1f6f5c] to-[#0b1020]"
              style={{ width: "11cqw", height: "11cqw", fontSize: "3.2cqw" }}
            >
              ﷽
            </span>
            <span
              className="absolute flex items-center justify-center rounded-full bg-[#fe2c55] text-white"
              style={{ width: "4.5cqw", height: "4.5cqw", bottom: "-2cqw", fontSize: "3.5cqw", lineHeight: 1 }}
            >
              +
            </span>
          </div>
        )}
        <RailItem icon={Heart} count="12.4K" />
        <RailItem icon={Comment} count="340" />
        {isTikTok && <RailItem icon={Bookmark} count="1.2K" />}
        <RailItem icon={isTikTok ? ShareArrow : PaperPlane} count="Share" />
        {!isTikTok && <RailItem icon={Dots} />}
        {/* Reels: rotating audio cover at the very bottom (TikTok's is omitted per preference) */}
        {!isTikTok && (
          <span
            className="flex items-center justify-center rounded-md bg-black/50"
            style={{ width: "9cqw", height: "9cqw", marginTop: "1cqw" }}
          >
            <span
              className="rounded bg-gradient-to-br from-[#666] to-black"
              style={{ width: "6cqw", height: "6cqw" }}
            />
          </span>
        )}
      </div>

      {/* Bottom caption */}
      <div
        className="absolute"
        style={{ left: "3.5cqw", bottom: "4cqw", right: "20cqw" }}
      >
        <p className="font-semibold drop-shadow" style={{ fontSize: "3.6cqw" }}>
          @ayahclip
        </p>
        <p className="line-clamp-2 leading-snug opacity-90 drop-shadow" style={{ fontSize: "3.2cqw", marginTop: "0.6cqw" }}>
          The most beautiful recitation 🤍 #quran #recitation
        </p>
        <p className="flex items-center opacity-90 drop-shadow" style={{ fontSize: "3cqw", gap: "1cqw", marginTop: "1cqw" }}>
          <span style={{ width: "3cqw", height: "3cqw" }}>
            <svg viewBox="0 0 24 24" className="h-full w-full" fill="currentColor">
              <path d="M9 18V6l10-2v12" stroke="currentColor" strokeWidth="2" fill="none" />
              <circle cx="6.5" cy="18" r="2.5" />
              <circle cx="16.5" cy="16" r="2.5" />
            </svg>
          </span>
          original sound — AyahClip
        </p>
      </div>

      {/* Reels progress bar */}
      {!isTikTok && (
        <div className="absolute inset-x-0 bottom-0" style={{ height: "0.8cqw" }}>
          <div className="h-full bg-white/30">
            <div className="h-full w-1/3 bg-white" />
          </div>
        </div>
      )}
    </div>
  );
}

/** Red safe-zone guides + shaded void regions. `padding` (fraction) shrinks the dashed text box. */
export function SafeZoneOverlay({
  mode,
  padding = 0,
}: {
  mode: "tiktok" | "reels";
  padding?: number;
}) {
  const z = SAFE_ZONES[mode];
  const pct = (n: number) => `${n * 100}%`;
  const p = Math.max(0, padding);

  return (
    <div className="pointer-events-none absolute inset-0">
      {/* Shaded platform void zones */}
      <div className="absolute inset-x-0 top-0 bg-red-500/15" style={{ height: pct(z.top) }} />
      <div className="absolute inset-x-0 bottom-0 bg-red-500/15" style={{ height: pct(z.bottom) }} />
      <div className="absolute inset-y-0 left-0 bg-red-500/15" style={{ width: pct(z.left) }} />
      <div className="absolute inset-y-0 right-0 bg-red-500/15" style={{ width: pct(z.right) }} />

      {/* Text-safe rectangle (platform margin + extra padding) */}
      <div
        className="absolute rounded-sm border-2 border-dashed border-red-400/80"
        style={{
          top: pct(z.top + p),
          bottom: pct(z.bottom + p),
          left: pct(z.left + p),
          right: pct(z.right + p),
        }}
      />
      <span
        className="absolute rounded bg-red-500/80 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-white"
        style={{ top: `calc(${pct(z.top + p)} + 4px)`, left: `calc(${pct(z.left + p)} + 4px)` }}
      >
        Safe area
      </span>
    </div>
  );
}
