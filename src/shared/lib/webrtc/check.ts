import { supabase } from "@/shared/api/supabase";

/** Quick network check for watching together across countries (e.g. Russia ↔ China). */

export type CheckResult = { id: string; ok: boolean; ms: number | null; note?: string };

async function timed<T>(run: () => Promise<T>, timeout = 6000): Promise<{ ok: boolean; ms: number | null; value?: T }> {
  const started = performance.now();
  try {
    const value = await Promise.race([run(), new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("timeout")), timeout))]);
    return { ok: true, ms: Math.round(performance.now() - started), value };
  } catch {
    return { ok: false, ms: null };
  }
}

/** Does this STUN server answer? (A server-reflexive candidate means UDP gets out.) */
function stunWorks(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: url }] });
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      pc.close();
      resolve(ok);
    };
    pc.onicecandidate = (event) => {
      if (event.candidate?.type === "srflx" || event.candidate?.candidate.includes(" srflx ")) finish(true);
      if (!event.candidate) finish(false);
    };
    pc.createDataChannel("probe");
    void pc.createOffer().then((offer) => pc.setLocalDescription(offer));
    window.setTimeout(() => finish(false), 5000);
  });
}

export async function runNetworkCheck(turnUrls: string[] = []): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const api = await timed(async () => {
    const { error } = await supabase.from("profiles").select("id", { head: true, count: "exact" }).limit(1);
    if (error && !error.message.includes("permission")) throw error;
  });
  results.push({ id: "api", ok: api.ok, ms: api.ms });

  const realtime = await timed(
    () =>
      new Promise<void>((resolve, reject) => {
        const channel = supabase.channel(`probe-${Math.random().toString(36).slice(2)}`);
        channel.subscribe((status) => {
          if (status === "SUBSCRIBED") {
            void supabase.removeChannel(channel);
            resolve();
          }
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            void supabase.removeChannel(channel);
            reject(new Error(status));
          }
        });
      }),
    8000,
  );
  results.push({ id: "realtime", ok: realtime.ok, ms: realtime.ms });

  const stuns = ["stun:stun.cloudflare.com:3478", "stun:stun.qq.com:3478", "stun:stun.miwifi.com:3478", "stun:stun.l.google.com:19302"];
  const checks = await Promise.all(stuns.map((url) => stunWorks(url)));
  stuns.forEach((url, index) => results.push({ id: "stun", ok: checks[index]!, ms: null, note: url.replace("stun:", "") }));
  results.push({ id: "turn", ok: turnUrls.length > 0, ms: null });
  return results;
}
