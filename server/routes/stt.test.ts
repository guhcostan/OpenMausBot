import { createServer, request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";

import type { AppConfig } from "../config.ts";
import { json, readBody } from "../harness/http.ts";
import { startFakeSttServer, type FakeSttServer } from "../testing/fake-stt-server.ts";
import { dispatchRoutes } from "./table.ts";
import { createSttRoutes } from "./stt.ts";

type SttSettings = NonNullable<AppConfig["stt"]>;

const servers: Server[] = [];
const fakes: FakeSttServer[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((done) => server.close(done))));
  await Promise.all(fakes.splice(0).map((fake) => fake.stop()));
});

async function serve(stt: SttSettings | undefined) {
  const config = { stt } as AppConfig;
  const routes = [createSttRoutes({ config: () => config })];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const handled = await dispatchRoutes(routes, {
      req, res, url, path: url.pathname, method: req.method ?? "GET",
      auth: { kind: "loopback", scopes: ["client"] }, json, readBody,
    });
    if (!handled) json(res, 404, { from: "inline routes" });
  });
  servers.push(server);
  await new Promise<void>((ready) => server.listen(0, "127.0.0.1", ready));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = async (contentType: string, bytes: Uint8Array) => {
    const response = await fetch(`${base}/api/stt/transcribe`, { method: "POST", headers: { "content-type": contentType }, body: bytes });
    return { status: response.status, body: await response.json() as any };
  };
  return Object.assign(post, { base });
}

/** Reads the 413 as soon as it arrives: the server closes after answering, so a fetch still uploading would fail first. */
function postWithoutWaiting(base: string, bytes: Uint8Array) {
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const req = request(`${base}/api/stt/transcribe`, {
      method: "POST",
      headers: { "content-type": "audio/webm", "content-length": String(bytes.length) },
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => resolve({ status: response.statusCode ?? 0, body: JSON.parse(Buffer.concat(chunks).toString()) }));
      response.on("error", reject);
    });
    req.on("error", reject);
    req.end(bytes);
  });
}

const clip = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3]);

describe("POST /api/stt/transcribe", () => {
  it("answers 409 while the engine is still Apple's", async () => {
    const post = await serve({ engine: "apple" });
    const reply = await post("audio/webm", clip);
    expect(reply.status).toBe(409);
    expect(reply.body.error).toMatch(/Apple engine/);
  });

  it("answers 409 when the OpenAI-compatible engine has no address yet", async () => {
    const post = await serve({ engine: "openai-compatible", model: "whisper-1" });
    const reply = await post("audio/webm", clip);
    expect(reply.status).toBe(409);
    expect(reply.body.error).toMatch(/address of your speech server/);
  });

  it("answers 415 when the body is not audio", async () => {
    const post = await serve({ engine: "openai-compatible", url: "http://127.0.0.1:9" });
    const reply = await post("text/plain", clip);
    expect(reply.status).toBe(415);
  });

  it("sends the clip to the speech server and returns its text, never the key", async () => {
    const fake = await startFakeSttServer();
    fakes.push(fake);
    const post = await serve({ engine: "openai-compatible", url: fake.url, model: "whisper-large", language: "pt", key: "sk-secret-123" });
    const reply = await post("audio/webm;codecs=opus", clip);

    expect(reply).toEqual({ status: 200, body: { text: "hola mundo" } });
    expect(JSON.stringify(reply.body)).not.toContain("sk-secret-123");
    expect(fake.requests).toHaveLength(1);
    const [sent] = fake.requests;
    expect(sent!.path).toBe("/v1/audio/transcriptions");
    expect(sent!.authorization).toBe("Bearer sk-secret-123");
    expect(sent!.fields).toEqual({ model: "whisper-large", language: "pt" });
    expect(sent!.file?.type).toBe("audio/webm");
    expect(sent!.file?.name).toBe("speech.webm");
    expect(Buffer.from(clip).equals(sent!.file!.bytes)).toBe(true);
  });

  it("omits the language and the key when they are not configured", async () => {
    const fake = await startFakeSttServer();
    fakes.push(fake);
    const post = await serve({ engine: "openai-compatible", url: fake.url });
    await post("audio/wav", clip);

    const [sent] = fake.requests;
    expect(sent!.authorization).toBeUndefined();
    expect(sent!.fields).toEqual({ model: "whisper-1" });
  });

  it("reports an upstream failure as 502 without echoing the key", async () => {
    const fake = await startFakeSttServer();
    fakes.push(fake);
    fake.answer(401, { error: "bad key sk-secret-123" });
    const post = await serve({ engine: "openai-compatible", url: fake.url, key: "sk-secret-123" });
    const reply = await post("audio/webm", clip);

    expect(reply.status).toBe(502);
    expect(reply.body.error).toBe("The speech server could not transcribe the recording.");
    expect(JSON.stringify(reply.body)).not.toContain("sk-secret-123");
  });

  it("does not echo a 200 HTML page (a login wall, a proxy error) that carries the key", async () => {
    const fake = await startFakeSttServer();
    fakes.push(fake);
    fake.answerRaw(200, "<html>sign in sk-secret-123</html>");
    const post = await serve({ engine: "openai-compatible", url: fake.url, key: "sk-secret-123" });
    const reply = await post("audio/webm", clip);

    expect(reply.status).toBe(502);
    expect(reply.body).toEqual({ error: "The speech server could not transcribe the recording." });
  });

  it("answers 413 past 25 MB and never forwards the clip", async () => {
    const fake = await startFakeSttServer();
    fakes.push(fake);
    const post = await serve({ engine: "openai-compatible", url: fake.url });
    const reply = await postWithoutWaiting(post.base, new Uint8Array(25 * 1024 * 1024 + 1));

    expect(reply.status).toBe(413);
    expect(reply.body.error).toMatch(/25 MB/);
    expect(fake.requests).toHaveLength(0);
  });
});
