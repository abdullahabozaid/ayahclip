"use client";

import { DeviceSpec } from "@/lib/devices";
import { PlatformChrome, SafeZoneOverlay } from "./PlatformChrome";

interface DeviceFrameProps {
  device: DeviceSpec;
  width: number;
  chromeMode?: "tiktok" | "reels";
  showSafeZones?: boolean;
  safePadding?: number;
  children: React.ReactNode;
}

export function DeviceFrame({
  device,
  width,
  chromeMode,
  showSafeZones,
  safePadding = 0,
  children,
}: DeviceFrameProps) {
  const isSE = device.cutout === "home-button";
  const isApple = device.brand === "apple";
  const isSamsung = device.brand === "samsung";

  const sideBezel = isSE ? width * 0.035 : width * 0.022;
  const topBezel = isSE ? width * 0.135 : sideBezel;
  const bottomBezel = isSE ? width * 0.165 : sideBezel;

  const screenR = isSE
    ? width * 0.032
    : isApple
      ? width * 0.105
      : isSamsung
        ? width * 0.06
        : width * 0.065;
  const frameR = isSE ? width * 0.06 : screenR + sideBezel;

  const screenW = width - sideBezel * 2;

  const islandW = width * 0.29;
  const islandH = width * 0.078;
  const notchW = width * 0.40;
  const notchH = width * 0.072;
  const holeSize = isSamsung ? width * 0.028 : width * 0.026;
  const homeBtnSize = width * 0.14;

  const frameStyle = buildFrameStyle(device, width, frameR);

  const screen = (
    <div
      className="relative overflow-hidden bg-black"
      style={{
        width: screenW,
        aspectRatio: `${device.screenW} / ${device.screenH}`,
        borderRadius: screenR,
      }}
    >
      {children}

      {device.cutout === "dynamic-island" && (
        <div
          className="absolute left-1/2 z-30 -translate-x-1/2"
          style={{
            top: "2.5%",
            width: islandW,
            height: islandH,
            borderRadius: islandH,
            background: "#010101",
          }}
        >
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
      )}

      {device.cutout === "notch" && (
        <div
          className="absolute left-1/2 z-30 -translate-x-1/2"
          style={{
            top: 0,
            width: notchW,
            height: notchH,
            background: "#010101",
            borderRadius: `0 0 ${width * 0.04}px ${width * 0.04}px`,
          }}
        >
          <div
            className="absolute left-1/2 -translate-x-1/2 rounded-full"
            style={{
              bottom: "22%",
              width: notchW * 0.18,
              height: notchH * 0.14,
              background: "#1a1a1e",
              boxShadow: "inset 0 1px 1px rgba(0,0,0,0.4)",
            }}
          />
          <div
            className="absolute rounded-full"
            style={{
              bottom: "20%",
              left: "18%",
              width: notchH * 0.32,
              height: notchH * 0.32,
              background:
                "radial-gradient(circle at 30% 30%, #2a3a5a, #0a0a12)",
              boxShadow: "0 0 0 1px #1a1a1e",
            }}
          />
        </div>
      )}

      {device.cutout === "punch-hole" && (
        <div
          className="absolute left-1/2 z-30 -translate-x-1/2 rounded-full"
          style={{
            top: "1.2%",
            width: holeSize,
            height: holeSize,
            background: "#010101",
            boxShadow: "0 0 0 1.5px rgba(50,50,55,0.7), inset 0 0 2px rgba(0,0,0,0.6)",
          }}
        >
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              width: "55%",
              height: "55%",
              background:
                "radial-gradient(circle at 35% 35%, #3a4a7a 0, transparent 50%), radial-gradient(circle at 70% 60%, #2a3a55 0, #0a0a14 80%)",
            }}
          />
        </div>
      )}

      {chromeMode && <PlatformChrome mode={chromeMode} />}
      {showSafeZones && chromeMode && (
        <SafeZoneOverlay mode={chromeMode} padding={safePadding} />
      )}

      <div
        className="pointer-events-none absolute inset-0 z-20"
        style={{
          borderRadius: screenR,
          background:
            "linear-gradient(135deg, rgba(255,255,255,0.055) 0%, transparent 28%)",
        }}
      />
    </div>
  );

  if (isSE) {
    return (
      <div className="relative" style={frameStyle}>
        <div
          className="relative"
          style={{ height: topBezel, padding: `0 ${sideBezel}px` }}
        >
          <div
            className="absolute left-1/2 -translate-x-1/2 rounded-full"
            style={{
              width: width * 0.12,
              height: width * 0.014,
              top: "52%",
              background: "#1a1a1e",
              boxShadow: "inset 0 1px 2px rgba(0,0,0,0.5)",
            }}
          />
          <div
            className="absolute rounded-full"
            style={{
              width: width * 0.024,
              height: width * 0.024,
              top: "52%",
              left: "35%",
              transform: "translateY(-50%)",
              background:
                "radial-gradient(circle at 30% 30%, #2a3a5a, #0a0a12)",
              boxShadow: "0 0 0 1.5px #222, 0 0 3px rgba(0,0,0,0.5)",
            }}
          />
        </div>

        <div style={{ padding: `0 ${sideBezel}px` }}>{screen}</div>

        <div
          className="relative flex items-center justify-center"
          style={{ height: bottomBezel }}
        >
          <div
            className="rounded-full"
            style={{
              width: homeBtnSize,
              height: homeBtnSize,
              border: "2.5px solid #555",
              boxShadow: "inset 0 0 0 1px rgba(60,60,60,0.4), 0 0 4px rgba(0,0,0,0.3)",
            }}
          />
        </div>

        <HwButton side="right" top="28%" h={width * 0.17} />
        <HwButton side="left" top="20%" h={width * 0.055} muted />
        <HwButton side="left" top="30%" h={width * 0.11} />
        <HwButton side="left" top="43%" h={width * 0.11} />
      </div>
    );
  }

  return (
    <div className="relative" style={frameStyle}>
      <div style={{ padding: sideBezel }}>{screen}</div>

      {isApple && (
        <>
          <HwButton side="left" top="13%" h={width * 0.055} muted />
          <HwButton side="left" top="21%" h={width * 0.12} />
          <HwButton side="left" top="37%" h={width * 0.12} />
          <HwButton side="right" top="25%" h={width * 0.18} />
        </>
      )}
      {isSamsung && (
        <>
          <HwButton side="right" top="20%" h={width * 0.06} />
          <HwButton side="right" top="30%" h={width * 0.12} />
        </>
      )}
      {device.brand === "google" && (
        <HwButton side="right" top="24%" h={width * 0.17} />
      )}
    </div>
  );
}

function HwButton({
  side,
  top,
  h,
  muted,
}: {
  side: "left" | "right";
  top: string;
  h: number;
  muted?: boolean;
}) {
  return (
    <span
      className="absolute"
      style={{
        [side]: -2.5,
        top,
        width: 3,
        height: h,
        borderRadius: 2,
        background: muted ? "#1e1e22" : "#26262b",
        boxShadow: muted ? "none" : "0 0 2px rgba(0,0,0,0.4)",
      }}
    />
  );
}

function buildFrameStyle(
  device: DeviceSpec,
  width: number,
  frameR: number,
): React.CSSProperties {
  const hl = +(width * 0.01).toFixed(1);
  const hlSpread = +(width * 0.005).toFixed(1);
  const rail = +(width * 0.014).toFixed(1);
  const shadow = +(width * 0.12).toFixed(0);
  const blur = +(width * 0.26).toFixed(0);
  const neg = +(width * 0.08).toFixed(0);

  if (device.brand === "apple") {
    const isPro =
      device.id.includes("p") && device.id !== "ip16+" && device.cutout !== "home-button";
    const edge = isPro ? "#8e8e98" : "#7a7a84";
    return {
      background: "#050506",
      border: "1px solid #2b2b31",
      borderRadius: frameR,
      boxShadow: `inset 0 0 ${hl}px ${hlSpread}px ${edge}, inset 0 0 0 ${rail}px #2b2b31, 0 ${shadow}px ${blur}px -${neg}px rgba(0,0,0,0.92)`,
    };
  }

  if (device.brand === "samsung") {
    const isUltra = device.id.includes("u");
    const edge = isUltra ? "#6a6a72" : "#58585e";
    return {
      background: isUltra ? "#08080a" : "#060608",
      border: `1px solid ${isUltra ? "#28282e" : "#222228"}`,
      borderRadius: frameR,
      boxShadow: `inset 0 0 ${hl}px ${hlSpread}px ${edge}, inset 0 0 0 ${rail}px #1a1a20, 0 ${shadow}px ${blur}px -${neg}px rgba(0,0,0,0.9)`,
    };
  }

  return {
    background: "#070709",
    border: "1px solid #26262e",
    borderRadius: frameR,
    boxShadow: `inset 0 0 ${hl}px ${hlSpread}px #6e6e78, inset 0 0 0 ${rail}px #1e1e26, 0 ${shadow}px ${blur}px -${neg}px rgba(0,0,0,0.9)`,
  };
}
