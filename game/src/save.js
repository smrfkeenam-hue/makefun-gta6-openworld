// Saving: the run's progress (cash, missions done, health, position, time of day)
// lives in localStorage so a closed tab resumes where Mara left off. A save is
// written on mission completion and every 20 seconds of play; loading never
// throws — a corrupt or missing save just starts a new story. Saves carry a
// version so an old format migrates instead of being dropped.
//
// v3 adds two things without changing the v2 shape: run statistics (distance
// driven, near misses, time played) for the pause screen, and player settings
// (mute, music volume) stored beside the save so a returning player keeps
// their preferences. v1 and v2 saves migrate up on load.

import { SAVE_KEY } from './config.js';

export const SAVE_VERSION = 3;
export const SETTINGS_KEY = 'solmar-bay.settings.v1';

const DEFAULT_SETTINGS = { muted: false, musicVolume: 0.18 };

export function saveGame(state) {
  try {
    const data = {
      version: SAVE_VERSION,
      cash: Math.round(state.player.cash),
      health: Math.round(state.player.health),
      missionIndex: state.missions.index,
      completed: state.missions.completed,
      x: Math.round(state.player.x),
      y: Math.round(state.player.y),
      timeOfDay: state.timeOfDay,
      savedAt: Date.now(),
      // Run statistics, when the world tracks them (main.js keeps `stats`).
      stats: state.stats ? { ...state.stats } : undefined,
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    if (typeof data.cash !== 'number' || typeof data.missionIndex !== 'number') return null;
    // A v1 save has no version and no completed count: it still loads, with
    // completed derived from the mission it was on.
    if (typeof data.version !== 'number') data.version = 1;
    if (typeof data.completed !== 'number') data.completed = Math.max(0, data.missionIndex);
    // v2 saves have no stats block: start one from zero instead of dropping
    // the save.
    if (typeof data.stats !== 'object' || data.stats === null) {
      data.stats = { distanceDriven: 0, nearMisses: 0, timePlayed: 0, busts: 0 };
    }
    return data;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Storage off: nothing to clear.
  }
}

/** Player settings (mute, music volume), kept across stories and sessions. */
export function loadSettings() {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return { ...DEFAULT_SETTINGS };
    return {
      muted: data.muted === true,
      musicVolume: typeof data.musicVolume === 'number'
        ? Math.max(0, Math.min(1, data.musicVolume)) : DEFAULT_SETTINGS.musicVolume,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      muted: !!settings.muted,
      musicVolume: typeof settings.musicVolume === 'number' ? settings.musicVolume : DEFAULT_SETTINGS.musicVolume,
    }));
    return true;
  } catch {
    return false;
  }
}

/** A one-line summary for the title screen ("Continue — Job 3, $1,250"). */
export function saveSummary(data) {
  if (!data) return null;
  const when = new Date(data.savedAt || 0);
  const date = Number.isNaN(when.getTime()) ? '' : ` · ${when.toLocaleDateString()}`;
  const job = data.missionIndex >= 5 ? 'all jobs done' : `Job ${data.missionIndex + 1} of 5`;
  return `Continue — ${job} · $${data.cash}${date}`;
}

/** A second line for the title screen: the run's totals so far. */
export function saveStatsSummary(data) {
  if (!data || !data.stats) return null;
  const s = data.stats;
  const miles = Math.round((s.distanceDriven || 0) / 100) / 10;
  const minutes = Math.round((s.timePlayed || 0) / 60);
  return `${miles} miles driven · ${s.nearMisses || 0} near misses · ${minutes} min on the streets`;
}
