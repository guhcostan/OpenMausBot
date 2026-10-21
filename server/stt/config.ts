import { z } from "zod";

export const STT_ENGINES = ["apple", "openai-compatible"] as const;
export type SttEngine = (typeof STT_ENGINES)[number];

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

export function allowedSttUrl(value: string): boolean {
  if (!value) return true;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol === "https:") return true;
  return url.protocol === "http:" && LOCAL_HOSTS.includes(url.hostname);
}

const sttUrl = z
  .string()
  .trim()
  .max(2048)
  .refine(allowedSttUrl, "the speech server address must be https://, or http:// on localhost")
  .optional();

export const sttSettingsSchema = z.object({
  engine: z.enum(STT_ENGINES).optional(),
  url: sttUrl,
  model: z.string().trim().max(200).optional(),
  language: z.string().trim().max(20).regex(/^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})?$/, "a language is a code such as pt or en-US").optional(),
  key: z.string().max(4096).optional(),
});

export type SttSettings = z.output<typeof sttSettingsSchema>;

export const DEFAULT_STT_MODEL = "whisper-1";

export interface SttConfig {
  engine: SttEngine;
  url: string;
  model: string;
  language: string;
  key: string;
}

/** Throws on an invalid config. */
export function decodeConfig(raw: unknown): SttConfig {
  const parsed = sttSettingsSchema.parse(raw ?? {});
  return {
    engine: parsed.engine ?? "apple",
    url: (parsed.url ?? "").replace(/\/+$/, ""),
    model: parsed.model || DEFAULT_STT_MODEL,
    language: parsed.language ?? "",
    key: parsed.key ?? "",
  };
}
