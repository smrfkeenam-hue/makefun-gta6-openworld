// Sound, all synthesized with WebAudio — no audio files, no network. Short blips
// for shots, pickups and UI, a two-tone siren that follows police cars, an engine
// hum whose pitch follows speed, and a light bass-and-hats groove that loops
// while driving. Everything is guarded so the game plays silently (never throws)
// when audio is unavailable or still locked behind the first user gesture.
//
// The groove has two layers: a calm verse for free roam and a tenser chorus
// (faster hats, a higher lead line) that fades in as the wanted level climbs,
// so the heat is audible before it is visible. Ambient beds — waves near the
// beach, a low city hum downtown — sit under the music and follow the player.

const MUSIC_BPM = 98;
const BASS_LINE = [0, 0, 7, 0, 10, 0, 7, 5]; // semitone steps over A minor
const LEAD_LINE = [12, 15, 19, 15, 12, 15, 19, 24];
const CHORUS_LEAD = [24, 22, 19, 22, 24, 27, 24, 19]; // higher, busier, for the chase

export function createAudio() {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let chorusGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let engineOsc = null;
  let engineGain = null;
  let ambientGain = null;
  let ambientOsc = null;
  let muted = false;
  let musicTimer = null;
  let musicStep = 0;
  let nextNoteTime = 0;
  let lastSkid = 0; // a screech at most twice a second, not once a frame
  let intensity = 0; // 0 calm .. 1 full chase, from the wanted level
  let musicVolume = 0.16;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = musicVolume;
      musicGain.connect(master);
      chorusGain = ctx.createGain();
      chorusGain.gain.value = 0;
      chorusGain.connect(master);
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenGain.connect(master);
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 700;
      sirenOsc.connect(sirenGain);
      sirenOsc.start();
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineGain.connect(master);
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 60;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineOsc.start();
      // Ambient bed: a slow filtered-noise wash (waves / city hum).
      ambientGain = ctx.createGain();
      ambientGain.gain.value = 0;
      ambientGain.connect(master);
      ambientOsc = ctx.createOscillator();
      ambientOsc.type = 'sine';
      ambientOsc.frequency.value = 55;
      const ambientFilter = ctx.createBiquadFilter();
      ambientFilter.type = 'lowpass';
      ambientFilter.frequency.value = 220;
      ambientOsc.connect(ambientFilter);
      ambientFilter.connect(ambientGain);
      ambientOsc.start();
    } catch {
      ctx = null;
      return false;
    }
    return true;
  }

  /** Call from any user gesture: unlocks audio on browsers that need one. */
  function unlock() {
    if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!ensure() || muted) return;
    try {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    } catch {
      // Sound is decoration: never let it break the game.
    }
  }

  function noise(dur, vol, filterFreq) {
    if (!ensure() || muted) return;
    try {
      const t = ctx.currentTime;
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start(t);
    } catch {
      // Sound is decoration: never let it break the game.
    }
  }

  function note(freq, when, dur, type, vol, bus) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(vol, when + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, when + dur);
    osc.connect(gain);
    gain.connect(bus || musicGain);
    osc.start(when);
    osc.stop(when + dur + 0.05);
  }

  function scheduleMusic() {
    if (!ctx || muted) return;
    const stepDur = 60 / MUSIC_BPM / 2;
    while (nextNoteTime < ctx.currentTime + 0.25) {
      const step = musicStep % 8;
      const bassFreq = 110 * Math.pow(2, BASS_LINE[step] / 12);
      note(bassFreq, nextNoteTime, stepDur * 1.8, 'triangle', 0.5);
      if (step % 2 === 0) {
        const leadFreq = 220 * Math.pow(2, LEAD_LINE[step] / 12);
        note(leadFreq, nextNoteTime, stepDur * 0.9, 'square', 0.10);
      }
      // Hat tick on every off-beat.
      if (step % 2 === 1) {
        const t = nextNoteTime;
        const len = Math.floor(ctx.sampleRate * 0.03);
        const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        const gain = ctx.createGain();
        gain.gain.value = 0.12;
        src.connect(gain);
        gain.connect(musicGain);
        src.start(t);
      }
      // Chase layer: a higher lead line and a doubled hat, crossfaded in
      // with the wanted level — the chorus only exists when the heat is on.
      if (intensity > 0.05) {
        const chorusFreq = 440 * Math.pow(2, CHORUS_LEAD[step] / 12);
        note(chorusFreq, nextNoteTime, stepDur * 0.7, 'sawtooth', 0.07 * intensity, chorusGain);
        if (step % 2 === 1) {
          const t = nextNoteTime + stepDur / 2;
          const len = Math.floor(ctx.sampleRate * 0.02);
          const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
          const data = buffer.getChannelData(0);
          for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
          const src = ctx.createBufferSource();
          src.buffer = buffer;
          const gain = ctx.createGain();
          gain.gain.value = 0.10 * intensity;
          src.connect(gain);
          gain.connect(chorusGain);
          src.start(t);
        }
      }
      musicStep += 1;
      nextNoteTime += stepDur;
    }
  }

  return {
    unlock,
    get muted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    setMusicVolume(v) {
      musicVolume = Math.max(0, Math.min(1, v));
      if (musicGain) musicGain.gain.value = musicVolume;
    },
    /** 0..1 chase intensity, from the wanted level: crossfades the chorus. */
    setIntensity(v) {
      intensity = Math.max(0, Math.min(1, v));
      if (chorusGain) chorusGain.gain.setTargetAtTime(0.16 * intensity, ctx ? ctx.currentTime : 0, 0.4);
    },
    /** Ambient bed level (waves near the beach, hum downtown): 0..1. */
    ambient(level) {
      if (!ensure()) return;
      try {
        ambientGain.gain.setTargetAtTime(muted ? 0 : 0.03 * level, ctx.currentTime, 0.5);
      } catch {
        // Ignore.
      }
    },
    startMusic() {
      if (!ensure()) return;
      if (musicTimer) return;
      nextNoteTime = ctx.currentTime + 0.1;
      musicTimer = window.setInterval(scheduleMusic, 90);
    },
    stopMusic() {
      if (musicTimer) {
        window.clearInterval(musicTimer);
        musicTimer = null;
      }
    },
    shoot() {
      noise(0.09, 0.5, 2400);
      blip(220, 0.07, 'square', 0.18, 60);
    },
    enemyShoot() {
      noise(0.08, 0.25, 1600);
    },
    hit() {
      blip(180, 0.12, 'sawtooth', 0.3, 70);
    },
    pickup() {
      blip(660, 0.09, 'sine', 0.35);
      window.setTimeout(() => blip(990, 0.12, 'sine', 0.35), 70);
    },
    cash() {
      blip(880, 0.08, 'sine', 0.3);
      window.setTimeout(() => blip(1320, 0.14, 'sine', 0.3), 60);
    },
    mission() {
      [523, 659, 784, 1046].forEach((f, i) => window.setTimeout(() => blip(f, 0.16, 'triangle', 0.32), i * 90));
    },
    fail() {
      [392, 330, 262].forEach((f, i) => window.setTimeout(() => blip(f, 0.2, 'triangle', 0.3), i * 120));
    },
    enterCar() {
      blip(140, 0.12, 'square', 0.25, 260);
    },
    doorSlam() {
      noise(0.12, 0.4, 500);
      blip(90, 0.1, 'square', 0.2, 50);
    },
    crash() {
      noise(0.25, 0.5, 700);
    },
    skid() {
      const now = Date.now();
      if (now - lastSkid < 500) return;
      lastSkid = now;
      noise(0.18, 0.22, 1400);
    },
    siren(on) {
      if (!ensure()) return;
      try {
        sirenGain.gain.setTargetAtTime(on && !muted ? 0.05 : 0, ctx.currentTime, 0.2);
        if (on) sirenOsc.frequency.setTargetAtTime(880, ctx.currentTime, 0.4);
      } catch {
        // Ignore.
      }
    },
    sirenWail(time) {
      if (!ensure() || !sirenOsc) return;
      try {
        sirenOsc.frequency.value = 700 + 260 * Math.sin(time * 2.4);
      } catch {
        // Ignore.
      }
    },
    engine(speedRatio, driving) {
      if (!ensure()) return;
      try {
        engineGain.gain.setTargetAtTime(driving && !muted ? 0.05 + 0.05 * speedRatio : 0, ctx.currentTime, 0.1);
        engineOsc.frequency.setTargetAtTime(55 + 140 * speedRatio, ctx.currentTime, 0.08);
      } catch {
        // Ignore.
      }
    },
  };
}
