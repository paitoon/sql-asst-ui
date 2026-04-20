export function pickAudioMimeType() {
  if (typeof window === "undefined") return undefined;
  const MR = window.MediaRecorder;
  if (!MR || typeof MR.isTypeSupported !== "function") return undefined;

  // Order matters: try best-quality / most common first.
  const candidates = [
    "audio/webm;codecs=opus", // Chrome/Android usually
    "audio/webm",
    "audio/mp4",              // Safari may prefer mp4 container
    "audio/aac",
  ];

  return candidates.find((t) => MR.isTypeSupported(t));
}
