import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/state/api";
import { t } from "./i18n";

interface Capture {
  draftId: string;
  recorder: MediaRecorder;
  chunks: Blob[];
  discard: boolean;
}

// For the OpenAI-compatible engine: records the whole clip, then the harness transcribes it. The Apple path in
// use-composer-dictation.ts streams partial text instead and stays as it is.
export function useRecordedDictation({ draftId, text, onText, available }: {
  draftId: string;
  text: string;
  onText: (text: string) => void;
  available: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const draft = useRef({ id: draftId, text });
  draft.current = { id: draftId, text };
  const capture = useRef<Capture | null>(null);
  const starting = useRef(false);
  // Bumped by stop(): a getUserMedia still pending then finds it is stale and releases its stream.
  const generation = useRef(0);

  const stop = useCallback(() => {
    generation.current += 1;
    const current = capture.current;
    if (!current) {
      setRecording(false);
      return;
    }
    current.discard = true;
    if (current.recorder.state !== "inactive") current.recorder.stop();
  }, []);

  useEffect(() => {
    stop();
  }, [draftId, stop]);

  useEffect(() => stop, [stop]);

  const transcribe = async (blob: Blob, forDraft: string) => {
    try {
      const { text: heard } = await api<{ text: string }>("/api/stt/transcribe", {
        method: "POST",
        headers: { "content-type": blob.type },
        body: blob,
        timeoutMs: 180_000,
      });
      // The upload can outlive the draft it was recorded for: never write into another draft.
      if (draft.current.id !== forDraft) return;
      const spoken = heard.trim();
      if (!spoken) return;
      const current = draft.current.text;
      onText(current ? `${current}${/\s$/.test(current) ? "" : " "}${spoken}` : spoken);
    } catch {
      if (draft.current.id === forDraft) setSpeechError(t("composer.dictation.remoteFailed"));
    }
  };

  const start = async () => {
    starting.current = true;
    const attempt = generation.current;
    setSpeechError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      starting.current = false;
      if (attempt === generation.current) setSpeechError(t("composer.dictation.microphone"));
      return;
    }
    starting.current = false;
    if (attempt !== generation.current) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    const recorder = new MediaRecorder(stream);
    const session: Capture = { draftId, recorder, chunks: [], discard: false };
    recorder.ondataavailable = (event) => {
      if (event.data.size) session.chunks.push(event.data);
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      if (capture.current === session) capture.current = null;
      setRecording(false);
      if (session.discard || draft.current.id !== session.draftId) return;
      const blob = new Blob(session.chunks, { type: recorder.mimeType || "audio/webm" });
      if (blob.size) void transcribe(blob, session.draftId);
    };
    capture.current = session;
    recorder.start();
    setRecording(true);
  };

  const toggle = () => {
    if (!available) {
      setSpeechError(t("composer.dictation.unavailable"));
    } else if (capture.current) {
      capture.current.recorder.stop();
    } else if (!starting.current) {
      void start();
    }
  };
  return { recording, speechError, toggle, stop };
}
