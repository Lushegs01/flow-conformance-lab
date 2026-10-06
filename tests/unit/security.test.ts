import { afterEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import {
  Transport,
  isPublicAddress,
  redact,
  validateTarget,
} from "../../src/transport.js";
import { readFile } from "node:fs/promises";
import { canonical, hash, eventHash, EventSchema } from "../../src/protocol.js";
const servers: Server[] = [];
async function target(handler: Parameters<typeof createServer>[0]) {
  const s = createServer(handler);
  servers.push(s);
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  const a = s.address();
  if (!a || typeof a === "string") throw Error();
  return `http://127.0.0.1:${a.port}`;
}
afterEach(async () => {
  for (const s of servers.splice(0)) {
    s.closeAllConnections();
    await new Promise<void>((r) => s.close(() => r()));
  }
});
describe("hostile transport and safe persistence", () => {
  it("allows exact loopback, refuses URL credentials/query/metadata and private address families", () => {
    expect(validateTarget("http://127.0.0.1:4000").hostname).toBe("127.0.0.1");
    for (const url of [
      "http://localhost:4000",
      "http://169.254.169.254",
      "https://user:secret@example.com",
      "https://example.com/?secret=x",
      "file:///etc/passwd",
    ])
      expect(() => validateTarget(url)).toThrow();
    for (const ip of [
      "127.0.0.1",
      "10.0.0.1",
      "172.16.0.1",
      "192.168.1.1",
      "169.254.169.254",
      "::ffff:127.0.0.1",
      "::1",
      "100.64.0.1",
      "198.18.1.2",
      "203.0.113.1",
    ])
      expect(isPublicAddress(ip)).toBe(false);
    expect(isPublicAddress("8.8.8.8")).toBe(true);
  });
  it("never retries mutations, forwards redirects or stores response cookies", async () => {
    let calls = 0;
    const url = await target((_req, res) => {
      calls++;
      res.writeHead(302, {
        Location: "http://169.254.169.254",
        "Set-Cookie": "secret=abc",
      });
      res.end();
    });
    const t = new Transport(url, "Bearer example", { timeout: 500 });
    await expect(t.call("POST", "/work-sessions", {}, {})).rejects.toThrow(
      "redirect_refused",
    );
    expect(calls).toBe(1);
    expect(JSON.stringify(t.exchanges)).not.toContain("secret=abc");
  });
  it("bounds slow headers, streamed bodies, invalid JSON and deeply nested JSON", async () => {
    const slow = await target(() => {});
    await expect(
      new Transport(slow, "Bearer test", { timeout: 100 }).call(
        "GET",
        "/work-sessions/x",
        {},
      ),
    ).rejects.toThrow("request_timeout");
    const big = await target((_req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ huge: "x".repeat(20000) }));
    });
    await expect(
      new Transport(big, "Bearer test", { timeout: 500, maxBytes: 1000 }).call(
        "GET",
        "/work-sessions/x",
        {},
      ),
    ).rejects.toThrow("response_too_large");
    for (const body of [
      "not-json-secret",
      "[".repeat(30) + "0" + "]".repeat(30),
    ]) {
      const url = await target((_req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.end(body);
      });
      const t = new Transport(url, "Bearer test", { timeout: 500 });
      await expect(t.call("GET", "/work-sessions/x", {})).rejects.toThrow(
        "malformed_or_complex_json",
      );
      expect(JSON.stringify(t.exchanges)).not.toContain(body);
    }
  });
  it("redacts sensitive keys, arbitrary credential echoes in values and keys, bearer strings and control characters", () => {
    const clean = JSON.stringify(
      redact(
        {
          password: "p",
          nested: { authorization: "a" },
          message: "other Bearer abc! TOPSECRET \u001b[31m",
          TOPSECRET: "TOPSECRET",
        },
        ["topsecret"],
      ),
    );
    expect(clean).not.toContain("TOPSECRET");
    expect(clean).not.toContain("abc!");
    expect(clean).not.toContain("\\u001b");
    expect(clean).toContain("[REDACTED]");
  });
  it("hashes stable ASCII canonical event inputs independently of insertion order", () => {
    expect(canonical({ z: 1, a: { d: 2, b: 3 } })).toBe(
      '{"a":{"b":3,"d":2},"z":1}',
    );
    expect(hash({ b: 2, a: 1 })).toBe(
      "hash:43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777",
    );
  });
  it("matches a fixed event digest generated independently by the pinned upstream SDK", async () => {
    const vector = JSON.parse(
      await readFile("fixtures/upstream-event.json", "utf8"),
    );
    expect(eventHash(EventSchema.parse(vector.event))).toBe(
      vector.event.event_hash,
    );
  });
});
