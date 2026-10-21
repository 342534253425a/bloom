/**
 * The sound that goes with a shared screen in the Windows app: the computer's sound without Bloom's own
 * (so the partner never hears their own voice come back) and, if wanted, Bloom's sound too.
 * Both can be switched while sharing; the same screen is captured again with the new sound, without the picker.
 */
import { desktop, type ScreenSound } from "@/shared/lib/native";

let chosen: ScreenSound = { pc: true, bloom: false };

/** Only the newer Windows app can leave Bloom out of the computer's sound and switch sounds live. */
export function canSwitchScreenSound(): boolean {
  return Boolean(desktop?.setScreenSound);
}

export function lastScreenSound(): ScreenSound {
  return chosen;
}

/** What was picked in the screen chooser. */
export function rememberScreenSound(sound: ScreenSound) {
  chosen = sound;
}

/** The shared screen's sound with other settings; null means silence. */
export async function captureScreenSound(sound: ScreenSound): Promise<MediaStreamTrack | null> {
  chosen = sound;
  if (!sound.pc && !sound.bloom) return null;
  if (!desktop?.setScreenSound || !(await desktop.setScreenSound(sound))) return null;
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    systemAudio: "include",
  } as DisplayMediaStreamOptions);
  // Only the sound is needed: the picture keeps coming from the first capture.
  for (const track of stream.getVideoTracks()) track.stop();
  return stream.getAudioTracks()[0] ?? null;
}
