import type { AppConfig } from "../config.ts";
import { decodeConfig } from "./config.ts";
import { openAiCompatibleStt } from "./openai-compatible.ts";
import { SttUnavailable, type SttProvider } from "./provider.ts";

type SttSettings = AppConfig["stt"];

export function sttProvider(settings: SttSettings): SttProvider {
  let config;
  try {
    config = decodeConfig(settings);
  } catch (error) {
    throw new SttUnavailable(`The speech settings are invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (config.engine === "apple") {
    throw new SttUnavailable("Dictation uses the Apple engine here. Choose an OpenAI-compatible speech server in Settings → Voice.");
  }
  if (!config.url) throw new SttUnavailable("Add the address of your speech server in Settings → Voice.");
  return openAiCompatibleStt(config);
}

/** Never includes the key. */
export function describeStt(settings: SttSettings) {
  const engine = settings?.engine ?? "apple";
  const url = settings?.url ?? "";
  return {
    engine,
    url,
    model: settings?.model ?? "",
    language: settings?.language ?? "",
    keyConfigured: Boolean(settings?.key),
    ready: engine === "openai-compatible" && Boolean(url),
  };
}
