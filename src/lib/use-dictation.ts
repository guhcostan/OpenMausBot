import type { ConfigStatus } from "@/state/config-status";
import { useComposerDictation } from "./use-composer-dictation";
import { useRecordedDictation } from "./use-recorded-dictation";

/** The composer's mic: Apple's streaming dictation, or the recorded clip when Settings → Voice names an OpenAI-compatible server. */
export function useDictation({ draftId, text, onText, appleAvailable, stt }: {
  draftId: string;
  text: string;
  onText: (text: string) => void;
  appleAvailable: boolean;
  stt: ConfigStatus["stt"];
}) {
  const remote = stt?.engine === "openai-compatible";
  const remoteReady = remote && stt?.ready === true && typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
  const apple = useComposerDictation({ draftId, text, onText, available: appleAvailable });
  const recorded = useRecordedDictation({ draftId, text, onText, available: remoteReady });
  return remote
    ? { ...recorded, available: remoteReady }
    : { ...apple, available: appleAvailable };
}
