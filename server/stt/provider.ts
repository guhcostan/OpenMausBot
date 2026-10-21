export interface SttAudio {
  bytes: Uint8Array;
  mime: string;
}

export interface SttProvider {
  transcribe(audio: SttAudio): Promise<{ text: string }>;
}

/** The chosen engine cannot serve a transcription yet: the route answers 409. */
export class SttUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SttUnavailable";
  }
}
