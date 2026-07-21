import { ImageResponse } from "next/og";

export const alt = "AyahClip — make beautiful Quran clips";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        position: "relative",
        display: "flex",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: "#08090d",
        color: "#f1ede3",
        fontFamily: "serif",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          backgroundImage:
            "radial-gradient(circle at 78% 40%, rgba(32,55,90,.58), transparent 34%), radial-gradient(circle at 18% 96%, rgba(122,84,31,.18), transparent 31%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: 9,
          height: "100%",
          display: "flex",
          background: "#c9a24b",
        }}
      />

      <div
        style={{
          width: "68%",
          padding: "68px 30px 68px 78px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 34, height: 1, display: "flex", background: "#c9a24b" }} />
          <div
            style={{
              display: "flex",
              color: "#d9bd78",
              fontFamily: "sans-serif",
              fontSize: 22,
              letterSpacing: 5,
              textTransform: "uppercase",
            }}
          >
            AyahClip
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div
            style={{
              display: "flex",
              maxWidth: 720,
              fontSize: 68,
              lineHeight: 1.02,
              letterSpacing: -2,
            }}
          >
            Make beautiful Quran clips.
          </div>
          <div
            style={{
              display: "flex",
              maxWidth: 650,
              color: "#a9a69f",
              fontFamily: "sans-serif",
              fontSize: 25,
              lineHeight: 1.42,
            }}
          >
            Quran-first typography, cinematic B-roll, and social-ready exports—shaped in your browser.
          </div>
        </div>
      </div>

      <div
        style={{
          width: "32%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: 238,
            height: 438,
            padding: 2,
            display: "flex",
            borderRadius: 30,
            background: "linear-gradient(145deg, #d3ad58, #403520 45%, #151820)",
            boxShadow: "0 28px 80px rgba(0,0,0,.55)",
          }}
        >
          <div
            style={{
              width: "100%",
              height: "100%",
              overflow: "hidden",
              borderRadius: 28,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              background:
                "radial-gradient(circle at 72% 32%, #263b5b 0, #111725 27%, #090b10 68%)",
            }}
          >
            <div
              style={{
                display: "flex",
                width: 112,
                height: 1,
                marginBottom: 24,
                background: "rgba(201,162,75,.68)",
              }}
            />
            <div
              style={{
                display: "flex",
                padding: "0 24px",
                color: "#f5f2ea",
                fontSize: 28,
                textAlign: "center",
                lineHeight: 1.35,
              }}
            >
              Quran, beautifully framed.
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 18,
                color: "#a8a49a",
                fontFamily: "sans-serif",
                fontSize: 13,
                letterSpacing: 1,
              }}
            >
              TIKTOK · REELS · SHORTS
            </div>
          </div>
        </div>
      </div>
    </div>,
    size,
  );
}
