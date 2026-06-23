// Generate a synthetic "recitation" WAV for QA-testing the import flow without a
// real audio file. It's tone bursts separated by short silences (7 by default),
// so the import page's pause-based autoSegment has something to split on.
//
// Usage:  node scripts/make-test-audio.mjs [seconds] [outPath]
// Then on /import: upload it, set the surah + verse range, "Open in studio".
import { writeFileSync } from "fs";

const secs = Number(process.argv[2]) || 14;
const out = process.argv[3] || "test-recitation.wav";

const SR = 44100;
const n = SR * secs;
const buf = Buffer.alloc(44 + n * 2);
let o = 0;
const str = (s) => { buf.write(s, o); o += 4; };
const u32 = (v) => { buf.writeUInt32LE(v, o); o += 4; };
const u16 = (v) => { buf.writeUInt16LE(v, o); o += 2; };

str("RIFF"); u32(buf.length - 8); str("WAVE");
str("fmt "); u32(16); u16(1); u16(1); u32(SR); u32(SR * 2); u16(2); u16(16);
str("data"); u32(n * 2);

for (let i = 0; i < n; i++) {
  const t = i / SR;
  const inBurst = (t % 2.0) < 1.6; // 1.6s tone, 0.4s silence — a pseudo "verse"
  const v = inBurst ? Math.sin(2 * Math.PI * 180 * t) * 0.35 : 0;
  buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32767))), o);
  o += 2;
}

writeFileSync(out, buf);
console.log(`Wrote ${out} (${secs}s, ${buf.length} bytes)`);
