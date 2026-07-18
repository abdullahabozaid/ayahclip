const INITIAL_HEADER_BYTES = 64 * 1024;
const FRAME_GUARD_BYTES = 16 * 1024;
const CLIP_PADDING_SECONDS = 3;
const audioSizeCache = new Map<string, Promise<number>>();

interface Mp3FrameInfo {
  offset: number;
  bitrate: number;
  sampleRate: number;
}

export interface Mp3RangePlan {
  byteStart: number;
  byteEnd: number;
  audioStartByte: number;
  bytesPerSecond: number;
}

export interface Mp3ClipBytes {
  bytes: ArrayBuffer;
  mediaStartSeconds: number;
  requestedBytes: number;
  totalBytes: number;
}

function synchsafe(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] & 0x7f) << 21) |
    ((bytes[offset + 1] & 0x7f) << 14) |
    ((bytes[offset + 2] & 0x7f) << 7) |
    (bytes[offset + 3] & 0x7f)
  );
}

export function id3EndOffset(bytes: Uint8Array): number {
  if (
    bytes.length < 10 ||
    bytes[0] !== 0x49 ||
    bytes[1] !== 0x44 ||
    bytes[2] !== 0x33
  ) {
    return 0;
  }
  const footer = (bytes[5] & 0x10) !== 0 ? 10 : 0;
  return 10 + synchsafe(bytes, 6) + footer;
}

export function findMp3Frame(bytes: Uint8Array, from = 0): Mp3FrameInfo | null {
  const mpeg1Layer3Bitrates = [
    0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320,
  ];
  const mpeg2Layer3Bitrates = [
    0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160,
  ];
  const baseSampleRates = [44_100, 48_000, 32_000];

  for (let offset = Math.max(0, from); offset + 3 < bytes.length; offset++) {
    if (bytes[offset] !== 0xff || (bytes[offset + 1] & 0xe0) !== 0xe0) continue;
    const versionBits = (bytes[offset + 1] >> 3) & 0x03;
    const layerBits = (bytes[offset + 1] >> 1) & 0x03;
    if (versionBits === 1 || layerBits !== 1) continue;
    const bitrateIndex = (bytes[offset + 2] >> 4) & 0x0f;
    const sampleRateIndex = (bytes[offset + 2] >> 2) & 0x03;
    if (bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3) continue;
    const bitrateKbps =
      versionBits === 3
        ? mpeg1Layer3Bitrates[bitrateIndex]
        : mpeg2Layer3Bitrates[bitrateIndex];
    const divisor = versionBits === 3 ? 1 : versionBits === 2 ? 2 : 4;
    return {
      offset,
      bitrate: bitrateKbps * 1000,
      sampleRate: baseSampleRates[sampleRateIndex] / divisor,
    };
  }
  return null;
}

export function planMp3Range(input: {
  totalBytes: number;
  audioStartByte: number;
  bitrate: number;
  startSeconds: number;
  endSeconds: number;
  chapterEndSeconds: number;
}): Mp3RangePlan {
  const bytesPerSecond = input.bitrate / 8;
  const paddedStart = Math.max(0, input.startSeconds - CLIP_PADDING_SECONDS);
  const paddedEnd = Math.min(input.chapterEndSeconds, input.endSeconds + CLIP_PADDING_SECONDS);
  const byteStart = Math.max(
    0,
    Math.floor(input.audioStartByte + paddedStart * bytesPerSecond) - FRAME_GUARD_BYTES
  );
  const byteEnd = Math.min(
    input.totalBytes - 1,
    Math.ceil(input.audioStartByte + paddedEnd * bytesPerSecond) + FRAME_GUARD_BYTES
  );
  return { byteStart, byteEnd, audioStartByte: input.audioStartByte, bytesPerSecond };
}

async function rangeFetch(url: string, start: number, end: number): Promise<Response> {
  const response = await fetch(url, { headers: { Range: `bytes=${start}-${end}` } });
  if (response.status !== 206) {
    await response.body?.cancel();
    throw new Error(`Audio server did not honour byte range (${response.status})`);
  }
  return response;
}

function totalFromContentRange(response: Response): number | null {
  const value = response.headers.get("content-range");
  const total = Number(value?.split("/")[1]);
  return Number.isFinite(total) && total > 0 ? total : null;
}

async function fetchAudioSize(url: string): Promise<number> {
  let pending = audioSizeCache.get(url);
  if (!pending) {
    pending = fetch(url, { method: "HEAD" }).then(async (response) => {
      await response.body?.cancel();
      const total = Number(response.headers.get("content-length"));
      if (!response.ok || !Number.isFinite(total) || total <= 0) {
        throw new Error("Audio server omitted the total byte size");
      }
      return total;
    });
    audioSizeCache.set(url, pending);
    pending.catch(() => audioSizeCache.delete(url));
  }
  return pending;
}

export async function fetchMp3Clip(input: {
  url: string;
  startSeconds: number;
  endSeconds: number;
  chapterEndSeconds: number;
}): Promise<Mp3ClipBytes> {
  let headerResponse = await rangeFetch(input.url, 0, INITIAL_HEADER_BYTES - 1);
  // Content-Range is visible in DevTools but is not a CORS-safelisted response
  // header. MP3Quran does not expose it to browser JavaScript, so use the
  // safelisted Content-Length from a HEAD request as the browser fallback.
  const totalBytes = totalFromContentRange(headerResponse) ?? await fetchAudioSize(input.url);
  let header = new Uint8Array(await headerResponse.arrayBuffer());
  const declaredId3End = id3EndOffset(header);
  if (declaredId3End + 4096 > header.length) {
    headerResponse = await rangeFetch(
      input.url,
      0,
      Math.min(totalBytes - 1, declaredId3End + 4096)
    );
    header = new Uint8Array(await headerResponse.arrayBuffer());
  }
  const firstFrame = findMp3Frame(header, declaredId3End);
  if (!firstFrame) throw new Error("Could not locate the MP3 audio stream");

  const plan = planMp3Range({
    totalBytes,
    audioStartByte: firstFrame.offset,
    bitrate: firstFrame.bitrate,
    startSeconds: input.startSeconds,
    endSeconds: input.endSeconds,
    chapterEndSeconds: input.chapterEndSeconds,
  });
  const clipResponse = await rangeFetch(input.url, plan.byteStart, plan.byteEnd);
  const bytes = await clipResponse.arrayBuffer();
  const clipFirstFrame = findMp3Frame(new Uint8Array(bytes));
  if (!clipFirstFrame) throw new Error("The selected MP3 byte range contains no audio frames");
  if (
    clipFirstFrame.bitrate !== firstFrame.bitrate ||
    clipFirstFrame.sampleRate !== firstFrame.sampleRate
  ) {
    throw new Error("Variable-rate MP3 chapters are not safe for cue-based byte seeking");
  }
  const mediaStartSeconds = Math.max(
    0,
    (plan.byteStart + clipFirstFrame.offset - plan.audioStartByte) / plan.bytesPerSecond
  );
  return {
    bytes,
    mediaStartSeconds,
    requestedBytes: bytes.byteLength,
    totalBytes,
  };
}
