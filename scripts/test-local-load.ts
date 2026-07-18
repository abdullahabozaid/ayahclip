import { spawn, type ChildProcess } from "node:child_process";

const PORT = Number(process.env.LOAD_TEST_PORT ?? 3107);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const STARTUP_TIMEOUT_MS = 30_000;
const REQUEST_TIMEOUT_MS = 10_000;

interface TimingSummary {
  requests: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
}

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return Math.round(sorted[index] * 10) / 10;
}

function timingSummary(values: number[]): TimingSummary {
  return {
    requests: values.length,
    p50Ms: percentile(values, 0.5),
    p95Ms: percentile(values, 0.95),
    maxMs: percentile(values, 1),
  };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function timedFetch(input: string, init?: RequestInit): Promise<{ response: Response; elapsedMs: number }> {
  const started = performance.now();
  const response = await fetch(input, {
    ...init,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  return { response, elapsedMs: performance.now() - started };
}

async function waitForServer(server: ChildProcess): Promise<void> {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Next server exited with code ${server.exitCode}`);
    try {
      const response = await fetch(`${ORIGIN}/`, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return;
    } catch {
      // The production server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Next server did not become ready within ${STARTUP_TIMEOUT_MS}ms`);
}

function telemetryEvent(client: number, sequence: number) {
  return {
    event: "studio_opened",
    journeyId: `load-client-${client.toString().padStart(2, "0")}-${sequence.toString().padStart(4, "0")}`,
    path: "/studio",
    deviceClass: "desktop",
    browserFamily: "chromium",
  };
}

async function publicPageBurst(): Promise<TimingSummary> {
  const routes = ["/", "/browse", "/import", "/surah/1"];
  const results = await Promise.all(
    Array.from({ length: 200 }, (_, index) => timedFetch(`${ORIGIN}${routes[index % routes.length]}`)),
  );
  const statuses = results.map(({ response }) => response.status);
  assert(statuses.every((status) => status === 200), `Public page burst returned ${JSON.stringify(statuses)}`);
  const timings = timingSummary(results.map(({ elapsedMs }) => elapsedMs));
  assert(timings.p95Ms < 2_000, `Public page p95 ${timings.p95Ms}ms exceeded the 2000ms local gate`);
  return timings;
}

async function sameClientRateLimit(): Promise<Record<number, number>> {
  const responses = await Promise.all(
    Array.from({ length: 720 }, (_, index) => fetch(`${ORIGIN}/api/telemetry`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "sec-fetch-site": "same-origin",
        "x-forwarded-for": "198.51.100.71",
      },
      body: JSON.stringify(telemetryEvent(71, index)),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })),
  );
  const counts = responses.reduce<Record<number, number>>((result, response) => {
    result[response.status] = (result[response.status] ?? 0) + 1;
    return result;
  }, {});
  assert(counts[204] === 600, `Expected 600 accepted same-client events, received ${JSON.stringify(counts)}`);
  assert(counts[429] === 120, `Expected 120 throttled same-client events, received ${JSON.stringify(counts)}`);
  assert(responses.every((response) => response.status < 500), "Same-client burst produced a server error");
  const limited = responses.find((response) => response.status === 429);
  assert(limited?.headers.get("retry-after"), "Throttled responses must include Retry-After");
  return counts;
}

async function independentClientBurst(): Promise<number> {
  const responses = await Promise.all(
    Array.from({ length: 200 }, (_, index) => {
      const client = Math.floor(index / 20);
      return fetch(`${ORIGIN}/api/telemetry`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "sec-fetch-site": "same-origin",
          "x-forwarded-for": `203.0.113.${client + 20}`,
        },
        body: JSON.stringify(telemetryEvent(client, index)),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    }),
  );
  assert(responses.every((response) => response.status === 204), "Independent clients shared a rate-limit bucket");
  return responses.length;
}

async function rejectedPaidApiBurst(): Promise<number> {
  const captionBody = JSON.stringify({ platform: "tiktok" });
  const checkoutBody = JSON.stringify({ amount: 5, frequency: "one-time" });
  const requests = Array.from({ length: 60 }, (_, index) => index % 2 === 0
    ? fetch(`${ORIGIN}/api/social-caption`, {
      method: "POST",
      headers: { "content-type": "application/json", "sec-fetch-site": "cross-site" },
      body: captionBody,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    : fetch(`${ORIGIN}/api/support/checkout`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://attacker.example" },
      body: checkoutBody,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    }));
  const responses = await Promise.all(requests);
  assert(responses.every((response) => response.status === 403), "A cross-site paid API request passed its boundary");
  return responses.length;
}

async function main(): Promise<void> {
  const server = spawn("npm", ["run", "start", "--", "--port", String(PORT)], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });
  let serverOutput = "";
  server.stdout?.on("data", (chunk) => { serverOutput += String(chunk); });
  server.stderr?.on("data", (chunk) => { serverOutput += String(chunk); });

  try {
    await waitForServer(server);
    const pages = await publicPageBurst();
    const rateLimit = await sameClientRateLimit();
    const independentClients = await independentClientBurst();
    const rejectedPaidRequests = await rejectedPaidApiBurst();
    console.info(JSON.stringify({
      status: "ok",
      origin: ORIGIN,
      publicPages: pages,
      sameClientRateLimit: rateLimit,
      independentClientEvents: independentClients,
      rejectedPaidRequests,
    }, null, 2));
  } catch (error) {
    console.error(serverOutput.slice(-4_000));
    throw error;
  } finally {
    if (server.pid && server.exitCode === null) {
      if (process.platform === "win32") server.kill("SIGTERM");
      else process.kill(-server.pid, "SIGTERM");
    }
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
