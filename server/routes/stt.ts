import type { IncomingMessage } from "node:http";
import type { AppConfig } from "../config.ts";
import { sttProvider } from "../stt/index.ts";
import { SttUnavailable } from "../stt/provider.ts";
import { PASS, type RouteHandler } from "./table.ts";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export function createSttRoutes(deps: { config: () => AppConfig }): RouteHandler {
  return async ({ req, res, path, method, json }) => {
    if (method !== "POST" || path !== "/api/stt/transcribe") return PASS;
    const mime = String(req.headers["content-type"] ?? "").split(";")[0]!.trim().toLowerCase();
    if (!mime.startsWith("audio/")) return json(res, 415, { error: "Send the recording as audio/* in the content-type header." });
    const bytes = await readAudio(req, MAX_AUDIO_BYTES);
    if (!bytes) {
      discardRest(req);
      return json(res, 413, { error: "The recording is larger than 25 MB." });
    }
    try {
      const { text } = await sttProvider(deps.config().stt).transcribe({ bytes, mime });
      return json(res, 200, { text });
    } catch (error) {
      if (error instanceof SttUnavailable) return json(res, 409, { error: error.message });
      // Any other message could carry the server's body or the URL; the renderer shows its own text anyway.
      return json(res, 502, { error: "The speech server could not transcribe the recording." });
    }
  };
}

/** Closing a socket with unread upload bytes resets it, and the client loses the 413. So the rest is read and dropped, in constant memory, for at most 10 s. */
function discardRest(req: IncomingMessage): void {
  req.resume();
  const timer = setTimeout(() => req.destroy(), 10_000);
  req.once("close", () => clearTimeout(timer));
}

/**
 * Buffers the body up to the limit. Past it, or if the client leaves, it resolves null and pauses the request
 * (no `for await`: breaking out of that loop destroys the socket before the 413 can be written).
 */
function readAudio(req: IncomingMessage, limit: number): Promise<Uint8Array | null> {
  const declared = Number(req.headers["content-length"] ?? 0);
  if (declared > limit) return Promise.resolve(null);
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    const stop = (value: Uint8Array | null) => {
      req.removeListener("data", onData);
      if (!value) req.pause();
      resolve(value);
    };
    const onData = (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > limit) return stop(null);
      chunks.push(chunk);
    };
    req.on("data", onData);
    req.once("end", () => stop(Buffer.concat(chunks)));
    req.once("close", () => stop(null));
  });
}
