// @vitest-environment happy-dom
import { createElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { api } from "@/state/api";
import { t } from "./i18n";
import { useRecordedDictation } from "./use-recorded-dictation";

vi.mock("@/state/api", () => ({ api: vi.fn() }));

type Dictation = ReturnType<typeof useRecordedDictation>;

let latest: Dictation;
function Probe(props: Parameters<typeof useRecordedDictation>[0]) {
  latest = useRecordedDictation(props);
  return null;
}

class FakeRecorder {
  static last: FakeRecorder | null = null;
  state: "inactive" | "recording" = "inactive";
  mimeType = "audio/webm;codecs=opus";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(readonly stream: MediaStream) {
    FakeRecorder.last = this;
  }
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["clip"], { type: this.mimeType }) });
    this.onstop?.();
  }
}

describe("recorded dictation for the OpenAI-compatible engine", () => {
  let root: Root;
  let container: HTMLDivElement;
  let onText: Mock<(text: string) => void>;
  let track: { stop: ReturnType<typeof vi.fn> };
  let getUserMedia: ReturnType<typeof vi.fn>;

  const render = (text: string, draftId = "draft-1") =>
    act(() => root.render(createElement(Probe, { draftId, text, onText, available: true })));

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    onText = vi.fn<(text: string) => void>();
    track = { stop: vi.fn() };
    getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [track] });
    Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia }, configurable: true });
    vi.stubGlobal("MediaRecorder", FakeRecorder);
    vi.mocked(api).mockReset();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    FakeRecorder.last = null;
  });

  it("records the clip, sends it to the harness and appends the transcript", async () => {
    vi.mocked(api).mockResolvedValue({ text: " ola mundo " });
    render("oi");

    await act(async () => latest.toggle());
    expect(latest.recording).toBe(true);
    await act(async () => latest.toggle());

    expect(latest.recording).toBe(false);
    expect(track.stop).toHaveBeenCalled();
    await vi.waitFor(() => expect(onText).toHaveBeenCalledWith("oi ola mundo"));
    const [path, init] = vi.mocked(api).mock.calls[0]!;
    expect(path).toBe("/api/stt/transcribe");
    expect(init).toMatchObject({ method: "POST", headers: { "content-type": "audio/webm;codecs=opus" } });
    expect(init!.body).toBeInstanceOf(Blob);
  });

  it("discards the clip when stopped by Escape instead of sending it", async () => {
    render("");
    await act(async () => latest.toggle());
    act(() => latest.stop());

    expect(latest.recording).toBe(false);
    expect(api).not.toHaveBeenCalled();
    expect(onText).not.toHaveBeenCalled();
  });

  it("shows the microphone message when access is refused", async () => {
    getUserMedia.mockRejectedValueOnce(new Error("NotAllowedError"));
    render("");
    await act(async () => latest.toggle());

    expect(latest.recording).toBe(false);
    expect(latest.speechError).toBe(t("composer.dictation.microphone"));
  });

  it("reports a failed transcription and leaves the draft untouched", async () => {
    vi.mocked(api).mockRejectedValue(new Error("The speech server answered 401."));
    render("oi");
    await act(async () => latest.toggle());
    await act(async () => latest.toggle());

    await vi.waitFor(() => expect(latest.speechError).toBe(t("composer.dictation.remoteFailed")));
    expect(onText).not.toHaveBeenCalled();
  });
});
