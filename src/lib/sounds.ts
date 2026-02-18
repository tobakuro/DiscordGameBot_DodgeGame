// Web Audio API sound utilities
// Call initAudio() once after first user interaction (autoplay policy)

let ctx: AudioContext | null = null;

export function initAudio(): void {
  if (ctx) return;
  if (typeof window === 'undefined') return;
  ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
}

function getCtx(): AudioContext | null {
  if (!ctx) return null;
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

function playTone(
  frequency: number,
  type: OscillatorType,
  startVolume: number,
  duration: number,
  frequencyEnd?: number,
): void {
  const c = getCtx();
  if (!c) return;

  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.connect(gain);
  gain.connect(c.destination);

  osc.type = type;
  osc.frequency.setValueAtTime(frequency, c.currentTime);
  if (frequencyEnd !== undefined) {
    osc.frequency.linearRampToValueAtTime(frequencyEnd, c.currentTime + duration);
  }

  gain.gain.setValueAtTime(startVolume, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);

  osc.start(c.currentTime);
  osc.stop(c.currentTime + duration);
}

/** 被弾音 — 低めの鈍い衝撃音 */
export function playHitSound(): void {
  playTone(120, 'sine', 0.4, 0.15, 60);
  playTone(200, 'square', 0.15, 0.08);
}

/** 死亡音 — 下降していく音 */
export function playDeathSound(): void {
  playTone(440, 'sawtooth', 0.3, 0.5, 110);
  playTone(220, 'sine', 0.2, 0.4, 55);
}

/** カウントダウンビープ — 高めのクリック音 */
export function playCountdownBeep(): void {
  playTone(660, 'sine', 0.25, 0.12);
}

/** GO！音 — 明るい上昇音 */
export function playGoSound(): void {
  playTone(440, 'sine', 0.3, 0.08);
  setTimeout(() => playTone(660, 'sine', 0.3, 0.08), 80);
  setTimeout(() => playTone(880, 'sine', 0.35, 0.2), 160);
}
