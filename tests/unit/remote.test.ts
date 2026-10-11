import { EventEmitter } from "node:events";
import type { RequestOptions } from "node:https";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Remote mode is exercised against a stubbed resolver and HTTPS client, so no
// test here opens a socket or depends on live DNS.
const stub = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: stub.lookup }));
vi.mock("node:https", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:https")>();
  return { ...actual, default: { ...actual.default, request: stub.request } };
});

const { Transport, TransportError, isPublicAddress, validateTarget } =
  await import("../../src/transport.js");

const HOST = "conformance.example";
const answers = (...list: [string, number][]) =>
  list.map(([address, family]) => ({ address, family }));
const policy = (url: string, allowRemote: boolean) => {
  try {
    validateTarget(url, allowRemote);
    return "accepted";
  } catch (error) {
    return error instanceof TransportError ? error.code : "unexpected";
  }
};
const outcome = (call: Promise<unknown>) =>
  call.then(
    () => "resolved",
    (error: unknown) =>
      error instanceof TransportError ? error.code : "unexpected",
  );
const remote = (target = `https://${HOST}`, timeout = 1000) =>
  new Transport(target, "Bearer remote-test-credential", {
    timeout,
    allowRemote: true,
  });
const captured: { url: URL; options: RequestOptions }[] = [];
function respond(status: number, body: unknown) {
  stub.request.mockImplementation(
    (
      url: URL,
      options: RequestOptions,
      onResponse: (res: EventEmitter) => void,
    ) => {
      captured.push({ url, options });
      return Object.assign(new EventEmitter(), {
        write: vi.fn(),
        destroy: vi.fn(),
        end() {
          const res = Object.assign(new EventEmitter(), {
            statusCode: status,
            headers: { "content-type": "application/json" },
            destroy: vi.fn(),
          });
          onResponse(res);
          res.emit("data", Buffer.from(JSON.stringify(body)));
          res.emit("end");
        },
      });
    },
  );
}

beforeEach(() => {
  stub.lookup.mockReset();
  stub.request.mockReset();
  captured.length = 0;
  vi.stubEnv("FLOW_CONFORMANCE_LOOPBACK_ONLY", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("remote target policy", () => {
  it("accepts only exact loopback by default and explicit HTTPS remotes", () => {
    const cases: [string, boolean, string][] = [
      ["http://127.0.0.1:4000", false, "accepted"],
      ["http://[::1]:4000", false, "accepted"],
      // WHATWG URL parsing normalizes numeric forms to the exact loopback literal.
      ["http://0x7f000001:4000", false, "accepted"],
      [`https://${HOST}/jarvis`, true, "accepted"],
      [`https://${HOST}`, false, "target_requires_explicit_remote_https"],
      [`http://${HOST}`, true, "target_requires_explicit_remote_https"],
      ["http://localhost:4000", true, "target_requires_explicit_remote_https"],
      [
        "http://127.0.0.1.nip.io",
        true,
        "target_requires_explicit_remote_https",
      ],
      [
        "http://[::ffff:127.0.0.1]:4000",
        true,
        "target_requires_explicit_remote_https",
      ],
      [`https://127.0.0.1@${HOST}`, true, "unsafe_target_url"],
      [`https://${HOST}/?next=1`, true, "unsafe_target_url"],
      [`https://${HOST}/#fragment`, true, "unsafe_target_url"],
      [`wss://${HOST}`, true, "unsafe_target_url"],
      ["javascript:alert(1)", true, "unsafe_target_url"],
      ["not a url", true, "invalid_target_url"],
    ];
    for (const [url, allowRemote, expected] of cases)
      expect([url, policy(url, allowRemote)]).toEqual([url, expected]);
  });

  it("classifies reserved IPv4 boundaries and refuses every IPv6 address", () => {
    for (const ip of [
      "0.0.0.0",
      "10.255.255.255",
      "100.127.255.255",
      "172.31.255.255",
      "192.0.2.1",
      "198.51.100.7",
      "224.0.0.1",
      "255.255.255.255",
      "::",
      "::ffff:8.8.8.8",
      "fd00::1",
      "2606:4700:4700::1111",
    ])
      expect([ip, isPublicAddress(ip)]).toEqual([ip, false]);
    for (const ip of [
      "1.1.1.1",
      "11.0.0.1",
      "100.128.0.1",
      "172.32.0.1",
      "192.169.0.1",
    ])
      expect([ip, isPublicAddress(ip)]).toEqual([ip, true]);
  });

  it.each([
    ["private", answers(["10.0.0.5", 4])],
    ["cloud metadata", answers(["169.254.169.254", 4])],
    ["loopback rebinding", answers(["127.0.0.1", 4])],
    ["mixed, public first", answers(["93.184.216.34", 4], ["10.0.0.5", 4])],
    ["mixed, private first", answers(["10.0.0.5", 4], ["93.184.216.34", 4])],
    ["public IPv6 only", answers(["2606:2800:220:1:248:1893:25c8:1946", 6])],
    ["IPv4-mapped IPv6", answers(["::ffff:10.0.0.5", 6])],
    ["empty", answers()],
  ])(
    "refuses a hostname whose DNS answer is %s before connecting",
    async (_label, resolved) => {
      stub.lookup.mockResolvedValue(resolved);
      const transport = remote();
      expect(
        await outcome(transport.call("GET", "/work-sessions/ws-1", {})),
      ).toBe("non_public_remote_address");
      expect(stub.lookup).toHaveBeenCalledWith(HOST, { all: true });
      expect(stub.request).not.toHaveBeenCalled();
      expect(transport.exchanges[0]?.error).toBe("non_public_remote_address");
    },
  );

  it.each([
    "https://10.0.0.1",
    "https://0x0a000001",
    "https://012.0.0.1",
    "https://169.254.169.254",
    "https://[::ffff:7f00:1]",
    "https://[fd00::1]",
    "https://[2606:4700:4700::1111]",
  ])("refuses IP-literal target %s without a DNS lookup", async (target) => {
    expect(
      await outcome(remote(target).call("GET", "/work-sessions/ws-1", {})),
    ).toBe("non_public_remote_address");
    expect(stub.lookup).not.toHaveBeenCalled();
    expect(stub.request).not.toHaveBeenCalled();
  });

  it("connects only to the validated address while TLS still verifies the hostname", async () => {
    stub.lookup.mockResolvedValue(answers(["93.184.216.34", 4]));
    respond(200, { id: "ws-1" });
    const reply = await remote().call("GET", "/work-sessions/ws-1", {});
    expect(reply.status).toBe(200);
    expect(stub.lookup).toHaveBeenCalledTimes(1);
    expect(captured).toHaveLength(1);
    const { url, options } = captured[0]!;
    expect(url.hostname).toBe(HOST);
    expect(options.family).toBe(4);
    expect(options.agent).toBe(false);
    expect(options.rejectUnauthorized).toBeUndefined();
    const pinned = vi.fn();
    (options.lookup as unknown as (...args: unknown[]) => void)(
      "other.example",
      {},
      pinned,
    );
    expect(pinned).toHaveBeenCalledWith(null, "93.184.216.34", 4);
  });

  it("re-validates DNS on every request so a rebinding answer is refused", async () => {
    stub.lookup
      .mockResolvedValueOnce(answers(["93.184.216.34", 4]))
      .mockResolvedValueOnce(answers(["10.0.0.5", 4]));
    respond(200, { id: "ws-1" });
    const transport = remote();
    expect(
      await outcome(transport.call("GET", "/work-sessions/ws-1", {})),
    ).toBe("resolved");
    expect(
      await outcome(transport.call("GET", "/work-sessions/ws-1", {})),
    ).toBe("non_public_remote_address");
    expect(stub.request).toHaveBeenCalledTimes(1);
  });

  it("never connects when a DNS answer arrives after the deadline", async () => {
    stub.lookup.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve(answers(["93.184.216.34", 4])), 250),
        ),
    );
    respond(200, { id: "ws-1" });
    expect(
      await outcome(
        remote(`https://${HOST}`, 100).call("GET", "/work-sessions", {}),
      ),
    ).toBe("request_timeout");
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(stub.request).not.toHaveBeenCalled();
  });

  it("refuses a remote redirect instead of following it", async () => {
    stub.lookup.mockResolvedValue(answers(["93.184.216.34", 4]));
    respond(302, { location: "http://169.254.169.254/latest/meta-data" });
    expect(await outcome(remote().call("GET", "/work-sessions/ws-1", {}))).toBe(
      "redirect_refused",
    );
    expect(stub.request).toHaveBeenCalledTimes(1);
  });

  it("FLOW_CONFORMANCE_LOOPBACK_ONLY=1 refuses every remote target, even with --allow-remote", () => {
    vi.stubEnv("FLOW_CONFORMANCE_LOOPBACK_ONLY", "1");
    expect(policy(`https://${HOST}`, true)).toBe("remote_targets_disabled");
    expect(policy("https://93.184.216.34", true)).toBe(
      "remote_targets_disabled",
    );
    expect(policy("http://127.0.0.1:4000", false)).toBe("accepted");
    expect(() => remote()).toThrow(TransportError);
    expect(stub.lookup).not.toHaveBeenCalled();
  });
});
