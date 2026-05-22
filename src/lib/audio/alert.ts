'use client';
// Web Audio chimes for red alerts + doctor updates + handover proposals.
// Browser autoplay policy: AudioContext must be created/resumed after a user gesture.
// Dashboard renders an "Enable audio alerts" toggle on first load to unlock the context.

export type AlertTone = 'red' | 'doctor' | 'handover';

const TONES: Record<AlertTone, { freq: number; pattern: number[]; gain: number }> = {
  // Two short rising beeps. Used for red SLA misses.
  red: { freq: 880, pattern: [120, 80, 120], gain: 0.18 },
  // Single mid chime. Used for doctor order updates pushed to a nurse.
  doctor: { freq: 660, pattern: [240], gain: 0.14 },
  // Two-tone arpeggio. Used for new handover proposals.
  handover: { freq: 520, pattern: [140, 60, 220], gain: 0.16 },
};

const STORAGE_KEY = 'wf_audio_alerts_enabled';
let ctx: AudioContext | null = null;

export function audioAlertsEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(STORAGE_KEY) === '1';
}

export function setAudioAlertsEnabled(v: boolean): void {
  if (typeof window === 'undefined') return;
  if (v) window.localStorage.setItem(STORAGE_KEY, '1');
  else window.localStorage.removeItem(STORAGE_KEY);
}

export async function enableAudioAlerts(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  if (ctx.state === 'suspended') await ctx.resume();
  setAudioAlertsEnabled(true);
  // Brief unlock tone so the user gets feedback that audio is live.
  playAlertTone('doctor');
}

export function playAlertTone(kind: AlertTone): void {
  if (!audioAlertsEnabled() || !ctx) return;
  const spec = TONES[kind];
  let t = ctx.currentTime;
  // pattern is alternating beep/silence durations in ms, starting with beep.
  let onBeep = true;
  let toneIdx = 0;
  for (const ms of spec.pattern) {
    const dur = ms / 1000;
    if (onBeep) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      // Step pitch up slightly for each beep so it doesn't sound monotonous.
      osc.frequency.value = spec.freq + toneIdx * 60;
      g.gain.value = spec.gain;
      osc.connect(g).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur);
      toneIdx += 1;
    }
    t += dur;
    onBeep = !onBeep;
  }
}
