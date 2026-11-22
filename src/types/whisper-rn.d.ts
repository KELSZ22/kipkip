declare module 'whisper.rn' {
  type TranscribeOptions = {
    language?: string;
    temperature?: number;
    temperatureInc?: number;
    beamSize?: number;
    bestOf?: number;
    maxContext?: number;
    maxThreads?: number;
    prompt?: string;
  };

  type TranscribeTask = {
    stop: () => Promise<void>;
    promise: Promise<{ result: string; isAborted: boolean }>;
  };

  export function initWhisper(options: {
    filePath: string;
    useGpu?: boolean;
    useCoreMLIos?: boolean;
  }): Promise<{
    transcribe: (filePath: string, options?: TranscribeOptions) => TranscribeTask;
    /** Takes 16 kHz mono 16-bit PCM. */
    transcribeData: (data: ArrayBuffer, options?: TranscribeOptions) => TranscribeTask;
    release: () => Promise<void>;
  }>;
}
