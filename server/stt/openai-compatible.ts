import { z } from "zod";
import type { SttConfig } from "./config.ts";
import type { SttAudio, SttProvider } from "./provider.ts";

const transcription = z.object({ text: z.string() });

export function openAiCompatibleStt(config: SttConfig): SttProvider {
  return {
    async transcribe(audio: SttAudio) {
      const form = new FormData();
      form.append("file", new Blob([new Uint8Array(audio.bytes)], { type: audio.mime }), `speech.${fileExtension(audio.mime)}`);
      form.append("model", config.model);
      if (config.language) form.append("language", config.language);
      const response = await fetch(`${config.url}/audio/transcriptions`, {
        method: "POST",
        headers: config.key ? { authorization: `Bearer ${config.key}` } : undefined,
        body: form,
        redirect: "error",
        signal: AbortSignal.timeout(120_000),
      });
      if (!response.ok) throw new Error(`The speech server answered ${response.status}.`);
      // A non-JSON 200 (an HTML login page, a proxy error) must not reach the caller: its SyntaxError can echo the body.
      const answer = transcription.safeParse(await response.json().catch(() => null));
      if (!answer.success) throw new Error("The speech server answered with something other than a transcript.");
      return { text: answer.data.text.trim() };
    },
  };
}

function fileExtension(mime: string): string {
  const subtype = mime.split(";")[0]?.split("/")[1] ?? "";
  return subtype.replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
}
