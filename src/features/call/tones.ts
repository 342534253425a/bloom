/** Call sounds made on the fly (no audio files): a soft melody for incoming calls, beeps while calling out. */

let ctx: AudioContext | null = null;
let timer = 0;

function note(freq: number, at: number, length: number, volume = 0.16) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  const start = ctx.currentTime + at;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + length + 0.05);
}

function loop(play: () => void, every: number) {
  stopTones();
  try {
    ctx = new AudioContext();
  } catch {
    return;
  }
  play();
  timer = window.setInterval(play, every);
}

/** Incoming call: a rising four-note phrase, repeated. */
export function ringtone() {
  loop(() => {
    [659.3, 784, 987.8, 1318.5].forEach((freq, index) => note(freq, index * 0.16, 0.38));
    [659.3, 784, 987.8, 1318.5].forEach((freq, index) => note(freq, 0.9 + index * 0.16, 0.38));
  }, 2600);
}

/** Calling out: two gentle beeps every few seconds. */
export function ringback() {
  loop(() => {
    note(440, 0, 0.9, 0.08);
    note(480, 0, 0.9, 0.08);
  }, 3000);
}

export function stopTones() {
  window.clearInterval(timer);
  timer = 0;
  void ctx?.close().catch(() => undefined);
  ctx = null;
}
