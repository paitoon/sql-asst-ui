import { useCallback, useRef, useState } from "react";
import { pickAudioMimeType } from "../media/pickAudioMime";

export function useAudioRecorder() {
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);

  const [status, setStatus] = useState("idle"); // idle | recording | stopped | error
  const [blob, setBlob] = useState(null);
  const [mimeType, setMimeType] = useState(null);
  const [error, setError] = useState("");

  const start = useCallback(async () => {
    setError("");
    setBlob(null);
    chunksRef.current = [];

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("error");
      setError("getUserMedia not supported.");
      return;
    }
    if (typeof window.MediaRecorder === "undefined") {
      setStatus("error");
      setError("MediaRecorder not supported in this browser.");
      return;
    }

    try {
      // audio-only
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
        video: false,
      });

      streamRef.current = stream;

      const mt = pickAudioMimeType() || "";
      setMimeType(mt || null);

      const mr = new MediaRecorder(stream, mt ? { mimeType: mt } : undefined);
      recorderRef.current = mr;

      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.onerror = () => {
        setStatus("error");
        setError("MediaRecorder error.");
      };

      mr.onstop = () => {
        const outType = mr.mimeType || mt || "audio/webm";
        const out = new Blob(chunksRef.current, { type: outType });
        setBlob(out);
        setStatus("stopped");
      };

      // Important for iOS: start must be called from a user gesture (button click)
      mr.start();
      setStatus("recording");
    } catch (err) {
      setStatus("error");
      setError(err?.message || "Failed to start recording (permission?).");
    }
  }, []);

  const stop = useCallback(() => {
    const mr = recorderRef.current;
    if (mr && mr.state !== "inactive") mr.stop();

    const stream = streamRef.current;
    if (stream) stream.getTracks().forEach((t) => t.stop());

    recorderRef.current = null;
    streamRef.current = null;
  }, []);

  const reset = useCallback(() => {
    setBlob(null);
    setError("");
    setStatus("idle");
    setMimeType(null);
    chunksRef.current = [];
  }, []);

  return { status, blob, mimeType, error, start, stop, reset };
}
