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
    if (!bytes) return json(res, 413, { error: "The recording is larger than 25 MB." });
    try {
      const { text } = await sttProvider(deps.config().stt).transcribe({ bytes, mime });
      return json(res, 200, { text });
    } catch (error) {
      if (error instanceof SttUnavailable) return json(res, 409, { error: error.message });
      return json(res, 502, { error: error instanceof Error ? error.message : String(error) });
    }
  };
}

/** Keeps draining past the limit so the 413 still reaches the client; returns null when the body is too large. */
async function readAudio(req: IncomingMessage, limit: number): Promise<Uint8Array | null> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes <= limit) chunks.push(chunk);
  }
  return bytes <= limit ? Buffer.concat(chunks) : null;
}
