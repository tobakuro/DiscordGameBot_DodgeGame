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

/** アイテム取得音 — キラッとした短い上昇音 */
export function playItemPickupSound(): void {
  playTone(800, 'sine', 0.2, 0.06);
  setTimeout(() => playTone(1200, 'sine', 0.25, 0.1), 60);
}

/** アイテム発動音 — 重い衝撃音 */
export function playItemUseSound(): void {
  playTone(80, 'sawtooth', 0.5, 0.25, 40);
  playTone(300, 'square', 0.2, 0.12);
}

// ============================================================
// BGM
// ============================================================
let bgmNodes: { osc: OscillatorNode; gain: GainNode }[] = [];
let bgmRunning = false;
let bgmScheduleTimeout: ReturnType<typeof setTimeout> | null = null;

const BGM_SEQUENCE: readonly [number, number][] = [
  [330, 0.15], [0, 0.05], [392, 0.15], [0, 0.05],
  [440, 0.15], [0, 0.05], [392, 0.15], [0, 0.05],
  [349, 0.15], [0, 0.05], [330, 0.15], [0, 0.05],
  [294, 0.2],  [0, 0.1],
];

const BGM_BEAT_INTERVAL = 0.5; // seconds between bass kicks

function scheduleBgmLoop(): void {
  const c = getCtx();
  if (!c || !bgmRunning) return;

  const loopDuration = BGM_SEQUENCE.reduce((s, [, d]) => s + d, 0);

  // Melody
  let t = c.currentTime + 0.05;
  for (const [freq, dur] of BGM_SEQUENCE) {
    if (freq > 0) {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.connect(gain);
      gain.connect(c.destination);
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.06, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.9);
      osc.start(t);
      osc.stop(t + dur);
      bgmNodes.push({ osc, gain });
    }
    t += dur;
  }

  // Bass kick
  const beatStart = c.currentTime + 0.05;
  for (let b = 0; b < Math.floor(loopDuration / BGM_BEAT_INTERVAL); b++) {
    const bt = beatStart + b * BGM_BEAT_INTERVAL;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.connect(gain);
    gain.connect(c.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(60, bt);
    osc.frequency.exponentialRampToValueAtTime(30, bt + 0.12);
    gain.gain.setValueAtTime(0.18, bt);
    gain.gain.exponentialRampToValueAtTime(0.001, bt + 0.2);
    osc.start(bt);
    osc.stop(bt + 0.2);
    bgmNodes.push({ osc, gain });
  }

  bgmScheduleTimeout = setTimeout(scheduleBgmLoop, loopDuration * 1000 - 50);
}

export function startBgm(): void {
  if (bgmRunning) return;
  bgmRunning = true;
  scheduleBgmLoop();
}

export function stopBgm(): void {
  bgmRunning = false;
  if (bgmScheduleTimeout !== null) {
    clearTimeout(bgmScheduleTimeout);
    bgmScheduleTimeout = null;
  }
  for (const { osc, gain } of bgmNodes) {
    try { osc.stop(); } catch { /* already stopped */ }
    gain.disconnect();
  }
  bgmNodes = [];
}
