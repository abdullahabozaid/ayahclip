"use client";

import { useState } from "react";
import { Background } from "@/types";

interface BackgroundThumbProps {
  background: Background;
  className?: string;
}

// A bismillah glyph on the ink background — shown when a saved clip's media
// can't be displayed (e.g. an uploaded blob URL that died after reload).
function ThumbFallback({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex h-full w-full flex-col items-center justify-center bg-[var(--ink-deep)] text-gold-soft/30 ${className}`}
    >
      <span className="font-arabic text-4xl">﷽</span>
    </div>
  );
}

/** Renders any clip Background (image / video / gradient / solid) as a static preview. */
export function BackgroundThumb({ background, className = "" }: BackgroundThumbProps) {
  const [failed, setFailed] = useState(false);

  // Object URLs are session-scoped: a blob: URL stored in a saved project is
  // already revoked by the time the dashboard renders, so loading it only
  // produces a broken image and a console error. Skip straight to the fallback.
  const isDeadBlob =
    (background.type === "image" || background.type === "video") &&
    background.value.startsWith("blob:");

  if (failed || isDeadBlob) {
    return <ThumbFallback className={className} />;
  }

  if (background.type === "image") {
    return (
      // Saved media can be a blob URL, which Next Image cannot optimize.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={background.value}
        alt=""
        className={`h-full w-full object-cover ${className}`}
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  }

  if (background.type === "video") {
    return (
      <video
        src={background.value}
        muted
        playsInline
        preload="metadata"
        className={`h-full w-full object-cover ${className}`}
        onError={() => setFailed(true)}
      />
    );
  }

  // gradient or solid — both are valid CSS background values
  return (
    <div
      className={`h-full w-full ${className}`}
      style={{ background: background.value }}
    />
  );
}
