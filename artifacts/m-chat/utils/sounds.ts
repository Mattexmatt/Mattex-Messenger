import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type SoundType = "default" | "soft" | "pop" | "ping";

let soundEnabled = true;
let soundType: SoundType = "default";

export async function initSoundSettings() {
  try {
    const raw = await AsyncStorage.getItem("mchat_settings");
    if (raw) {
      const s = JSON.parse(raw);
      soundEnabled = s.soundEnabled ?? true;
      soundType = s.soundType ?? "default";
    }
  } catch {}
}

export function updateSoundEnabled(val: boolean) { soundEnabled = val; }
export function updateSoundType(val: SoundType) { soundType = val; }

function getCtx(): AudioContext | null {
  if (Platform.OS !== "web") return null;
  try {
    return new (window.AudioContext || (window as any).webkitAudioContext)();
  } catch { return null; }
}

function tone(ctx: AudioContext, freq: number, start: number, dur: number, vol: number, type: OscillatorType = "sine") {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
  gain.gain.setValueAtTime(vol, ctx.currentTime + start);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
  osc.start(ctx.currentTime + start);
  osc.stop(ctx.currentTime + start + dur + 0.01);
}

const SOUNDS: Record<SoundType, { send: () => void; receive: () => void }> = {
  default: {
    send: () => {
      const ctx = getCtx(); if (!ctx) return;
      tone(ctx, 880, 0, 0.07, 0.25);
      tone(ctx, 1200, 0.06, 0.1, 0.2);
    },
    receive: () => {
      const ctx = getCtx(); if (!ctx) return;
      tone(ctx, 600, 0, 0.12, 0.28);
      tone(ctx, 800, 0.08, 0.15, 0.22);
    },
  },
  soft: {
    send: () => {
      const ctx = getCtx(); if (!ctx) return;
      tone(ctx, 660, 0, 0.15, 0.18);
      tone(ctx, 990, 0.1, 0.15, 0.14);
    },
    receive: () => {
      const ctx = getCtx(); if (!ctx) return;
      tone(ctx, 440, 0, 0.2, 0.2);
      tone(ctx, 550, 0.12, 0.2, 0.16);
    },
  },
  pop: {
    send: () => {
      const ctx = getCtx(); if (!ctx) return;
      tone(ctx, 1000, 0, 0.05, 0.35, "triangle");
    },
    receive: () => {
      const ctx = getCtx(); if (!ctx) return;
      tone(ctx, 700, 0, 0.05, 0.3, "triangle");
      tone(ctx, 900, 0.04, 0.06, 0.22, "triangle");
    },
  },
  ping: {
    send: () => {
      const ctx = getCtx(); if (!ctx) return;
      tone(ctx, 1400, 0, 0.04, 0.3, "sine");
      tone(ctx, 1800, 0.03, 0.12, 0.2, "sine");
    },
    receive: () => {
      const ctx = getCtx(); if (!ctx) return;
      tone(ctx, 1200, 0, 0.04, 0.28, "sine");
      tone(ctx, 1600, 0.03, 0.12, 0.2, "sine");
    },
  },
};

export function playSendSound() {
  if (!soundEnabled) return;
  try { SOUNDS[soundType].send(); } catch {}
}

export function playReceiveSound() {
  if (!soundEnabled) return;
  try { SOUNDS[soundType].receive(); } catch {}
}

export function previewSound(type: SoundType) {
  try { SOUNDS[type].receive(); } catch {}
}
