"use client";

import ReactDOM from "react-dom";

export function PreloadResources() {
  ReactDOM.preload("/fonts/UthmanicHafs1Ver18.woff2", {
    as: "font",
    type: "font/woff2",
    crossOrigin: "anonymous",
  });
  return null;
}
