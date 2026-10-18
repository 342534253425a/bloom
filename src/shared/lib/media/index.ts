import { supabase } from "@/shared/api/supabase";
import { createId } from "@/shared/lib/id";

/** Voice recording, photo compression and the couple's private file storage. */

const BUCKET = "couple";

/** Prefer AAC in MP4: it plays everywhere, including iPhone. Fall back to Opus/WebM. */
export function recordingMime(): string {
  const candidates = ["audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
  if (typeof MediaRecorder === "undefined") return "";
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

export function canRecord(): boolean {
  return typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
}

export type Recording = { blob: Blob; duration: number; mime: string };

export type Recorder = {
  stop: () => Promise<Recording | null>;
  cancel: () => void;
  level: () => number;
  startedAt: number;
};

/** Starts recording from the microphone. Throws if the person blocks the mic. */
export async function startRecording(): Promise<Recorder> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  const mime = recordingMime();
  const recorder = mime ? new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 48_000 }) : new MediaRecorder(stream);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };
  const audio = new AudioContext();
  const analyser = audio.createAnalyser();
  analyser.fftSize = 256;
  audio.createMediaStreamSource(stream).connect(analyser);
  const buffer = new Uint8Array(analyser.frequencyBinCount);
  const startedAt = Date.now();
  recorder.start(250);
  const release = () => {
    stream.getTracks().forEach((track) => track.stop());
    void audio.close().catch(() => undefined);
  };
  return {
    startedAt,
    level: () => {
      analyser.getByteTimeDomainData(buffer);
      let peak = 0;
      for (const value of buffer) peak = Math.max(peak, Math.abs(value - 128));
      return Math.min(1, peak / 64);
    },
    cancel: () => {
      recorder.onstop = null;
      if (recorder.state !== "inactive") recorder.stop();
      release();
    },
    stop: () =>
      new Promise((resolve) => {
        recorder.onstop = () => {
          release();
          const type = (recorder.mimeType || mime || "audio/webm").split(";")[0]!;
          const duration = (Date.now() - startedAt) / 1000;
          resolve(chunks.length && duration > 0.4 ? { blob: new Blob(chunks, { type }), duration, mime: type } : null);
        };
        if (recorder.state !== "inactive") recorder.stop();
        else resolve(null);
      }),
  };
}

function extension(mime: string) {
  if (mime.includes("mp4") || mime.includes("aac") || mime.includes("m4a")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  return "jpg";
}

/** Uploads into <couple_key>/<folder>/<id>.<ext> and returns the storage path. */
export async function uploadCoupleFile(coupleKey: string, folder: string, blob: Blob): Promise<string> {
  const type = blob.type.split(";")[0] || "application/octet-stream";
  const path = `${coupleKey}/${folder}/${createId()}.${extension(type)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: type, upsert: false, cacheControl: "31536000" });
  if (error) throw error;
  return path;
}

export async function removeCoupleFile(path: string) {
  await supabase.storage.from(BUCKET).remove([path]);
}

const urls = new Map<string, { url: string; until: number }>();

/** Short-lived private link to a stored file (cached for the session). */
export async function fileUrl(path: string): Promise<string | null> {
  const cached = urls.get(path);
  if (cached && cached.until > Date.now()) return cached.url;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 6);
  if (error || !data) return null;
  urls.set(path, { url: data.signedUrl, until: Date.now() + 60 * 60 * 5 * 1000 });
  return data.signedUrl;
}

/** Shrinks a photo to at most 1600px on the long side as JPEG. */
export async function compressImage(file: File, max = 1600): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => (value ? resolve(value) : reject(new Error("encode"))), "image/jpeg", 0.85));
  return { blob, width, height };
}

export function formatDuration(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
