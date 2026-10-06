import http from "node:http";
import https from "node:https";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { Exchange } from "./model.js";

const sensitiveKey =
  /authorization|cookie|password|secret|token|api.?key|private.?key|credential/i;
export function redact(
  value: unknown,
  secrets: string[] = [],
  depth = 0,
): unknown {
  if (depth > 24) return "[depth limit]";
  if (typeof value === "string") {
    let out = value;
    for (const secret of secrets.filter(Boolean))
      out = out.replace(
        new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"),
        "[REDACTED]",
      );
    return out
      .replace(
        /-----BEGIN [\s\S]*?PRIVATE KEY-----[\s\S]*?-----END [\s\S]*?PRIVATE KEY-----/g,
        "[REDACTED]",
      )
      .replace(/\bBearer\s+[^\s"<>]+/gi, "Bearer [REDACTED]")
      .replace(/\b(?:sk-|ghp_|github_pat_)[A-Za-z0-9_-]{8,}/g, "[REDACTED]")
      .replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, "");
  }
  if (Array.isArray(value))
    return value.map((v) => redact(v, secrets, depth + 1));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => [
        String(redact(key, secrets, depth + 1)),
        sensitiveKey.test(key) ? "[REDACTED]" : redact(v, secrets, depth + 1),
      ]),
    );
  return value;
}
export class TransportError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
export function isPublicAddress(ip: string): boolean {
  // Deliberately conservative: remote mode supports public IPv4 only, avoiding IPv6 mapping/range bypasses.
  if (isIP(ip) !== 4) return false;
  const [a = 0, b = 0, c = 0] = ip.split(".").map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0 || b === 2)) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
}
export function validateTarget(target: string, allowRemote = false): URL {
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    throw new TransportError("invalid_target_url");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new TransportError("unsafe_target_url");
  const loopback = url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (!loopback && (!allowRemote || url.protocol !== "https:"))
    throw new TransportError("target_requires_explicit_remote_https");
  return url;
}
export interface Reply {
  status: number;
  body: unknown;
  headers: Record<string, string>;
}
export class Transport {
  readonly target: URL;
  readonly exchanges: Exchange[] = [];
  private readonly secrets: string[];
  constructor(
    target: string,
    private readonly authorization: string,
    private readonly options: {
      timeout: number;
      allowRemote?: boolean;
      signal?: AbortSignal;
      maxBytes?: number;
    },
  ) {
    this.target = validateTarget(target, options.allowRemote);
    if (!authorization || /[\r\n]/.test(authorization))
      throw new TransportError("invalid_authorization_environment");
    this.secrets = [authorization, authorization.replace(/^\S+\s+/, "")];
  }
  async call(
    method: "GET" | "POST",
    path: string,
    headers: Record<string, string>,
    body?: unknown,
  ): Promise<Reply> {
    const started = performance.now();
    const exchange: Exchange = {
      sequence: this.exchanges.length,
      timestamp: new Date().toISOString(),
      duration_ms: 0,
      request: {
        method,
        path,
        headers: { ...headers, Authorization: "[REDACTED]" },
        ...(body === undefined ? {} : { body }),
      },
    };
    try {
      if (!/^\/work-sessions(?:\/[A-Za-z0-9._:-]+(?:\/events)?)?$/.test(path))
        throw new TransportError("unrecognized_operation_path");
      const url = new URL(this.target.toString());
      url.pathname = this.target.pathname.replace(/\/$/, "") + path;
      const response = await this.request(url, method, headers, body);
      exchange.response = { ...response, normalized: response.body };
      return response;
    } catch (err) {
      exchange.error =
        err instanceof TransportError ? err.code : "transport_failure";
      throw new TransportError(exchange.error);
    } finally {
      exchange.duration_ms = Math.round(performance.now() - started);
      this.exchanges.push(redact(exchange, this.secrets) as Exchange);
    }
  }
  private request(
    url: URL,
    method: string,
    headers: Record<string, string>,
    body: unknown,
  ): Promise<Reply> {
    return new Promise((resolve, reject) => {
      let req: http.ClientRequest | undefined;
      let settled = false;
      const finish = (error?: TransportError, reply?: Reply) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.options.signal?.removeEventListener("abort", abort);
        req?.destroy();
        if (error) reject(error);
        else resolve(reply!);
      };
      const abort = () => finish(new TransportError("cancelled"));
      const timer = setTimeout(
        () => finish(new TransportError("request_timeout")),
        this.options.timeout,
      );
      this.options.signal?.addEventListener("abort", abort, { once: true });
      if (this.options.signal?.aborted) {
        abort();
        return;
      }
      void (async () => {
        const hostname = url.hostname.replace(/^\[|\]$/g, "");
        const local = hostname === "127.0.0.1" || hostname === "::1";
        let address = hostname;
        if (!local) {
          const resolved = isIP(hostname)
            ? [{ address: hostname, family: isIP(hostname) }]
            : await lookup(hostname, { all: true });
          if (
            !resolved.length ||
            resolved.some((r) => !isPublicAddress(r.address))
          )
            throw new TransportError("non_public_remote_address");
          address = resolved[0]!.address;
        }
        if (settled) return;
        const data = body === undefined ? undefined : JSON.stringify(body);
        if (data && Buffer.byteLength(data) > 65536)
          throw new TransportError("request_too_large");
        req = (url.protocol === "https:" ? https : http).request(
          url,
          {
            method,
            agent: false,
            maxHeaderSize: 16384,
            family: isIP(address),
            lookup: (_hostname, _options, callback) =>
              callback(null, address, isIP(address)),
            headers: {
              ...headers,
              Authorization: this.authorization,
              Accept: "application/json",
              "Accept-Encoding": "identity",
              ...(data
                ? {
                    "Content-Type": "application/json",
                    "Content-Length": Buffer.byteLength(data),
                  }
                : {}),
            },
          },
          (res) => {
            const chunks: Buffer[] = [];
            let bytes = 0;
            res.on("error", () =>
              finish(new TransportError("response_stream_error")),
            );
            res.on("aborted", () =>
              finish(new TransportError("response_aborted")),
            );
            res.on("data", (chunk: Buffer) => {
              bytes += chunk.length;
              if (bytes > (this.options.maxBytes ?? 65536)) {
                finish(new TransportError("response_too_large"));
                res.destroy();
              } else chunks.push(chunk);
            });
            res.on("end", () => {
              if (settled) return;
              const status = res.statusCode ?? 0;
              if (status >= 300 && status < 400) {
                finish(new TransportError("redirect_refused"));
                return;
              }
              if (
                !/^application\/(?:[a-z0-9.+-]*\+)?json(?:;|$)/i.test(
                  res.headers["content-type"] ?? "",
                )
              ) {
                finish(new TransportError("non_json_response"));
                return;
              }
              try {
                const parsed: unknown = JSON.parse(
                  Buffer.concat(chunks).toString("utf8"),
                );
                const stack: { v: unknown; d: number }[] = [
                  { v: parsed, d: 0 },
                ];
                let nodes = 0;
                while (stack.length) {
                  const { v, d } = stack.pop()!;
                  if (d > 24 || ++nodes > 30000)
                    throw new Error("bounded JSON");
                  if (v && typeof v === "object")
                    for (const child of Object.values(v))
                      stack.push({ v: child, d: d + 1 });
                }
                const safeHeaders: Record<string, string> = {};
                for (const key of [
                  "content-type",
                  "jarvis-protocol-version",
                  "jarvis-host-capabilities",
                ]) {
                  const value = res.headers[key];
                  if (typeof value === "string") safeHeaders[key] = value;
                }
                finish(undefined, {
                  status,
                  body: parsed,
                  headers: safeHeaders,
                });
              } catch {
                finish(new TransportError("malformed_or_complex_json"));
              }
            });
          },
        );
        req.on("error", () => finish(new TransportError("connection_failure")));
        if (data) req.write(data);
        req.end();
      })().catch((err) =>
        finish(
          err instanceof TransportError
            ? err
            : new TransportError("connection_failure"),
        ),
      );
    });
  }
}
