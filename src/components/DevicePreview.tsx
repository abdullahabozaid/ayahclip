"use client";

import { FrameMode, PlatformChrome, SafeZoneOverlay } from "./PlatformChrome";

interface DevicePreviewProps {
  frameMode: FrameMode;
  /** Display width of the screen in px. */
  width: number;
  /** Screen aspect ratio (CSS aspect-ratio value). Framed modes are always 9 / 16. */
  aspect?: string;
  showSafeZones?: boolean;
  /** Extra safe-zone padding (fraction of frame), reflected in the dashed guide. */
  safePadding?: number;
  children: React.ReactNode;
}

function DeviceSideButton({ side, top, h }: { side: "left" | "right"; top: string; h: number }) {
  return (
    <span
      className="absolute bg-[#26262b]"
      style={{ [side]: -2, top, width: 3, height: h, borderRadius: 2 }}
    />
  );
}

export function DevicePreview({
  frameMode,
  width,
  aspect = "9 / 16",
  showSafeZones,
  safePadding = 0,
  children,
}: DevicePreviewProps) {
  const framed = frameMode !== "studio";
  const isPlatform = frameMode === "tiktok" || frameMode === "reels";

  // Proportions tuned to iPhone 14 Pro (devices.css reference), scaled to `width`.
  const bezel = width * 0.045;
  const screenRadius = width * 0.11;
  const frameRadius = screenRadius + bezel;
  // Studio (unframed) mode still needs a defined edge so the canvas reads as a
  // surface, not text floating in the void, even when the clip is near-black.
  const studioRadius = width * 0.03;
  const islandW = width * 0.3;
  const islandH = width * 0.082;

  const screen = (
    <div
      className="relative overflow-hidden bg-black"
      style={{
        width,
        aspectRatio: framed ? "9 / 16" : aspect,
        borderRadius: framed ? screenRadius : studioRadius,
      }}
    >
      {children}
      {isPlatform && <PlatformChrome mode={frameMode} />}
      {showSafeZones && isPlatform && (
        <SafeZoneOverlay mode={frameMode} padding={safePadding} />
      )}

      {framed && (
        <>
          {/* Dynamic Island */}
          <div
            className="absolute left-1/2 z-30 -translate-x-1/2 rounded-full bg-[#010101]"
            style={{ top: "2.6%", width: islandW, height: islandH }}
          >
            {/* faint camera lens */}
            <div
              className="absolute rounded-full"
              style={{
                width: islandH * 0.42,
                height: islandH * 0.42,
                top: "30%",
                right: islandH * 0.5,
                background:
                  "radial-gradient(farthest-corner at 20% 20%, #6074bf 0, transparent 40%), radial-gradient(farthest-corner at 80% 80%, #513785 0, #24555e 20%, transparent 50%)",
                boxShadow: "0 0 1px 1px rgba(255,255,255,0.06)",
              }}
            />
          </div>
          {/* screen gloss */}
          <div
            className="pointer-events-none absolute inset-0 z-20"
            style={{
              borderRadius: screenRadius,
              background:
                "linear-gradient(135deg, rgba(255,255,255,0.07) 0%, transparent 34%)",
            }}
          />
        </>
      )}
    </div>
  );

  if (!framed) {
    return (
      <div
        data-testid="studio-canvas-frame"
        className="overflow-hidden bg-black ring-1 ring-[var(--hairline-soft)] shadow-[0_28px_80px_-44px_rgba(0,0,0,0.95)]"
        style={{ borderRadius: studioRadius }}
      >
        {screen}
      </div>
    );
  }

  // Titanium rail look: bright inset highlight ring + dark inset rail + soft drop shadow.
  const hl = (width * 0.012).toFixed(1);
  const hlSpread = (width * 0.006).toFixed(1);
  const rail = (width * 0.016).toFixed(1);
  const frameShadow = `inset 0 0 ${hl}px ${hlSpread}px #9a9aa3, inset 0 0 0 ${rail}px #2b2b31, 0 ${(width * 0.12).toFixed(0)}px ${(width * 0.26).toFixed(0)}px -${(width * 0.08).toFixed(0)}px rgba(0,0,0,0.92)`;

  return (
    <div
      className="relative"
      style={{
        background: "#050506",
        border: "1px solid #2b2b31",
        borderRadius: frameRadius,
        padding: bezel,
        boxShadow: frameShadow,
      }}
    >
      {/* Side buttons */}
      <DeviceSideButton side="left" top="14%" h={width * 0.07} />
      <DeviceSideButton side="left" top="22%" h={width * 0.14} />
      <DeviceSideButton side="left" top="40%" h={width * 0.14} />
      <DeviceSideButton side="right" top="26%" h={width * 0.22} />
      {screen}
    </div>
  );
}
