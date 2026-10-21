// A stand-in for an OpenAI-compatible POST /v1/audio/transcriptions: parses the multipart upload and answers { text }.
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";

export interface FakeSttRequest {
  path: string;
  authorization: string | undefined;
  fields: Record<string, string>;
  file: { name: string; type: string; bytes: Buffer } | null;
}

export interface FakeSttServer {
  url: string;
  requests: FakeSttRequest[];
  answer(status: number, body: unknown): void;
  answerRaw(status: number, text: string): void;
  stop(): Promise<void>;
}

export async function startFakeSttServer(): Promise<FakeSttServer> {
  const requests: FakeSttRequest[] = [];
  let next: { status: number; body: unknown; raw?: string } = { status: 200, body: { text: " hola mundo " } };
  const server: Server = createServer(async (req, res) => {
    const raw = await collect(req);
    const form = await new Response(raw, { headers: { "content-type": req.headers["content-type"] ?? "" } }).formData();
    const fields: Record<string, string> = {};
    let file: FakeSttRequest["file"] = null;
    for (const [name, value] of form.entries()) {
      if (typeof value === "string") fields[name] = value;
      else file = { name: value.name, type: value.type, bytes: Buffer.from(await value.arrayBuffer()) };
    }
    requests.push({ path: req.url ?? "", authorization: req.headers.authorization, fields, file });
    if (next.raw !== undefined) {
      res.writeHead(next.status, { "content-type": "text/html" });
      res.end(next.raw);
      return;
    }
    res.writeHead(next.status, { "content-type": "application/json" });
    res.end(JSON.stringify(next.body));
  });
  await new Promise<void>((ready) => server.listen(0, "127.0.0.1", ready));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}/v1`,
    requests,
    answer(status, body) {
      next = { status, body };
    },
    answerRaw(status, text) {
      next = { status, body: null, raw: text };
    },
    stop: () => new Promise<void>((done) => server.close(() => done())),
  };
}

async function collect(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}
