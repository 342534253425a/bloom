/**
 * Screen sharing in the Android app. The WebView can't capture the screen, so the app does it natively
 * (plugin "BloomScreen") and passes the picture in over a WebRTC connection inside the phone.
 * The result is an ordinary video track, used in calls and the cinema like a computer's screen.
 */
import { shell } from "@/shared/lib/native";
import { withStartBitrate } from "./share";

type BloomScreen = {
  start(options: { maxSize: number; fps: number }): Promise<{ sdp: string }>;
  answer(options: { sdp: string }): Promise<void>;
  stop(): Promise<void>;
  addListener(event: "ended", listener: () => void): Promise<{ remove: () => Promise<void> }>;
};

/** Only in an Android app new enough to have the plugin (older installs simply don't show the button). */
export const canShareAndroidScreen = () =>
  shell === "android" && Boolean((window as unknown as { Capacitor?: { isPluginAvailable?: (name: string) => boolean } }).Capacitor?.isPluginAvailable?.("BloomScreen"));

function gathered(pc: RTCPeerConnection, ms: number) {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise<void>((resolve) => {
    const done = () => pc.iceGatheringState === "complete" && resolve();
    pc.addEventListener("icegatheringstatechange", done);
    window.setTimeout(resolve, ms);
  });
}

/** Asks Android for the screen (the system shows its own "Start now" prompt) and returns it as a stream. */
export async function captureAndroidScreen(): Promise<MediaStream> {
  const { registerPlugin } = await import("@capacitor/core");
  const plugin = registerPlugin<BloomScreen>("BloomScreen");
  const { sdp } = await plugin.start({ maxSize: 1280, fps: 30 });
  const pc = new RTCPeerConnection({ iceServers: [] });
  const arrived = new Promise<MediaStreamTrack>((resolve) => {
    pc.ontrack = (event) => resolve(event.track);
  });
  try {
    await pc.setRemoteDescription({ type: "offer", sdp });
    await pc.setLocalDescription(await pc.createAnswer());
    await gathered(pc, 2000);
    // Inside the phone there is plenty of bandwidth: start sharp instead of ramping up from a blur.
    await plugin.answer({ sdp: withStartBitrate(pc.localDescription?.sdp ?? "", 4000) });
    const track = await Promise.race([arrived, new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("no picture")), 8000))]);
    track.contentHint = "detail";

    let finished = false;
    const listener = plugin.addListener("ended", () => {
      finish();
      // Stopped from Android itself: tell Bloom the same way a browser does.
      track.dispatchEvent(new Event("ended"));
    });
    const finish = () => {
      if (finished) return;
      finished = true;
      pc.close();
      void plugin.stop().catch(() => undefined);
      void listener.then((handle) => handle.remove());
    };
    const stopTrack = track.stop.bind(track);
    track.stop = () => {
      stopTrack();
      finish();
    };
    return new MediaStream([track]);
  } catch (error) {
    pc.close();
    void plugin.stop().catch(() => undefined);
    throw error;
  }
}
