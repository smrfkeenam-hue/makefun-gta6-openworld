// Missions and story: a five-job chain for Mara Quinn and the Tide crew, each job
// a short list of steps (drive somewhere, steal a car, survive the heat, drive
// off rivals). The state machine only watches the world and advances steps;
// the world owns the player, cars and police it reads.
//
// Each mission also carries its giver's voice: an opening line when the job
// starts, a mid-job nudge, and a sign-off when it completes, plus a driving
// tip the HUD shows while the job is active. The log of finished jobs (jobLog)
// is what the pause screen and the save summary read back.

import { MISSIONS } from './config.js';
import { dist } from './random.js';

// Giver voice per mission: [opening, mid-job nudge, sign-off].
const MISSION_VOICE = {
  m1: [
    'Lena: "Package, Marina, before the tide turns. Clean and quick, Mara."',
    'Lena: "The drop-off is on the Marina road — don\'t keep them waiting."',
    'Lena: "Smooth. The Tide notices clean work."',
  ],
  m2: [
    'Lena: "A Vesper S, Sunset Strip, tonight. Bring it to the garage — and don\'t bring the law."',
    'Lena: "Strip\'s crawling with chrome. Take the Vesper, not a tour."',
    'Lena: "She purrs. Voss will like this one."',
  ],
  m3: [
    'Voss: "The Salt Dogs want my pier. They get the pier over my dead body — and yours, if you let them."',
    'Voss: "Hold the pier. Make them regret the boat ride."',
    'Voss: "The harbor is mine. You\'re square with me, Quinn — for now."',
  ],
  m4: [
    'Lena: "Pickup went loud, Mara. Three stars. Get to Palm Heights before they box you in."',
    'Lena: "They\'re coming up behind you — keep moving, don\'t stop for anything."',
    'Lena: "You shook them. Breathe. The safehouse is yours tonight."',
  ],
  m5: [
    'Voss: "One last run. The vault car leaves at dusk. Take it, and the Tide is square forever."',
    'Voss: "Every cop in the bay is coming. Drive like you mean it."',
    'Voss: "It\'s done. The Tide is free, Mara — and so are you."',
  ],
};

const MISSION_TIPS = {
  m1: 'Tip: parked cars are free — occupied ones earn you a star.',
  m2: 'Tip: lose the heat before the handover counts, or the garage stays shut.',
  m3: 'Tip: fight on foot — your car is no cover on the pier.',
  m4: 'Tip: cops spawn behind you. Keep speed up and don\'t stop in a dead end.',
  m5: 'Tip: the Comet GT is the fastest car in the bay. Use it.',
};

export function createMissions() {
  let index = 0;          // which mission is active
  let stepIndex = 0;      // which step of it
  let stepTimer = 0;
  let defeated = 0;       // rivals downed in the current defeat step
  let completed = 0;      // missions finished this run
  let done = false;       // the whole chain is finished
  let message = '';
  let messageTimer = 0;
  let justCompleted = null; // mission object, consumed by the world for the reward
  let stepKey = '';       // "mission:step" of the last step we entered
  const jobLog = [];      // finished jobs, in order: {id, title, reward}
  let nudged = false;     // the mid-job line fired once per mission

  function current() {
    return done ? null : MISSIONS[index];
  }

  function step() {
    const m = current();
    return m ? m.steps[stepIndex] : null;
  }

  function say(text, seconds) {
    message = text;
    messageTimer = seconds || 4;
  }

  function voice(id, slot) {
    const lines = MISSION_VOICE[id];
    return lines ? lines[slot] || '' : '';
  }

  function start() {
    const m = current();
    if (m) {
      say(`${m.title} — ${m.giver}: ${m.brief}`, 6);
      window.setTimeout(() => say(voice(m.id, 0), 6), 120);
    }
  }

  /** Restore a saved run: mission index and completed count together. */
  function restore(missionIndex, completedCount) {
    jumpTo(missionIndex, 0);
    completed = Math.max(0, Math.min(MISSIONS.length, completedCount || 0));
    if (index >= MISSIONS.length) {
      completed = MISSIONS.length;
      done = true;
    }
    // Rebuild the log from the count: a continued run still shows its history.
    jobLog.length = 0;
    for (let i = 0; i < completed; i += 1) {
      jobLog.push({ id: MISSIONS[i].id, title: MISSIONS[i].title, reward: MISSIONS[i].reward });
    }
  }

  /** Jump straight to a mission/step (used by the screenshot stager and saves). */
  function jumpTo(missionIndex, stepIndexValue) {
    index = Math.max(0, Math.min(MISSIONS.length, missionIndex));
    if (index >= MISSIONS.length) {
      // A save from after the last job: the chain is done, free roam.
      done = true;
      stepIndex = 0;
      stepKey = 'done';
      return;
    }
    done = false;
    stepIndex = Math.max(0, Math.min(MISSIONS[index].steps.length - 1, stepIndexValue));
    stepTimer = 0;
    defeated = 0;
    stepKey = '';
    nudged = false;
  }

  function advance() {
    const m = current();
    if (!m) return;
    stepIndex += 1;
    stepTimer = 0;
    defeated = 0;
    if (stepIndex >= m.steps.length) {
      justCompleted = m;
      completed += 1;
      jobLog.push({ id: m.id, title: m.title, reward: m.reward });
      index += 1;
      stepIndex = 0;
      nudged = false;
      if (index >= MISSIONS.length) {
        done = true;
        say('The Tide is free. Solmar Bay is yours — free roam, Mara.', 8);
      } else {
        say(`Job done: ${m.title}. Next up: ${MISSIONS[index].title}.`, 5);
        // The giver's sign-off follows the job-done line, so both get heard.
        const signOff = voice(m.id, 2);
        if (signOff) window.setTimeout(() => say(signOff, 5), 2600);
      }
    }
  }

  /** The reward the world owes the player for the mission that just finished. */
  function takeReward() {
    const m = justCompleted;
    justCompleted = null;
    return m ? m.reward : 0;
  }

  /** Called when the player gets in a car (any car). */
  function onEnterCar() {
    const s = step();
    if (s && s.type === 'enterCar') advance();
  }

  /** Called when the player steals a car of a given model name. */
  function onSteal(modelName) {
    const s = step();
    if (s && s.type === 'stealModel' && s.model === modelName) advance();
  }

  /** Called when a rival goes down. */
  function onEnemyDown() {
    const s = step();
    if (s && s.type === 'defeat') {
      defeated += 1;
      if (defeated >= s.count) advance();
    }
  }

  /**
   * Per-frame progress. `view` exposes: player {x,y,inCar}, police.stars,
   * `setWanted(level)`, and `spawnRivals(count)` for fight steps.
   */
  function update(dt, view) {
    if (messageTimer > 0) messageTimer -= dt;
    const s = step();
    if (!s) return;
    // Entering a step for the first time: a fight step needs its rivals in
    // the world, or the job can never finish — spawn them here, once.
    const key = `${index}:${stepIndex}`;
    if (key !== stepKey) {
      stepKey = key;
      if (s.type === 'defeat' && view.spawnRivals) {
        view.spawnRivals(s.count);
        say('The Salt Dogs are here — hold the pier, Mara. Get out and fight on foot.', 5);
      }
    }
    // Halfway through a job, the giver checks in once — a nudge, not a nag.
    if (!nudged && stepIndex >= Math.floor((current().steps.length || 1) / 2)) {
      nudged = true;
      say(voice(current().id, 1), 5);
    }
    if (s.type === 'goto') {
      if (dist(view.player.x, view.player.y, s.x, s.y) < s.r) advance();
    } else if (s.type === 'wait') {
      stepTimer += dt;
      if (stepTimer >= s.t) advance();
    } else if (s.type === 'wanted') {
      view.setWanted(s.level);
      advance();
    } else if (s.type === 'loseCops') {
      if (view.policeStars === 0) advance();
    } else if (s.type === 'defeat') {
      // Progress arrives through onEnemyDown(); nothing to poll here.
    }
  }

  /** The active objective marker, if the current step has a place to go. */
  function marker() {
    const s = step();
    if (s && (s.type === 'goto') && s.x !== undefined) return { x: s.x, y: s.y, r: s.r };
    return null;
  }

  /** Short text for the HUD objective line, with live counts. */
  function objectiveText() {
    const m = current();
    if (!m) return 'Free roam — Solmar Bay is yours. Earn cash, dodge the law.';
    const s = step();
    const job = `Job ${index + 1}/5 — ${m.title}`;
    if (!s) return job;
    if (s.type === 'defeat') return `${job}: ${s.text.replace(/\(\d+ left\)/, `(${Math.max(0, s.count - defeated)} left)`)}`;
    return `${job}: ${s.text}`;
  }

  /** Driving tip for the active job, shown under the objective. */
  function tipText() {
    const m = current();
    return m ? MISSION_TIPS[m.id] || '' : '';
  }

  return {
    get index() { return index; },
    get completed() { return completed; },
    get done() { return done; },
    get message() { return messageTimer > 0 ? message : ''; },
    get jobLog() { return jobLog; },
    current,
    step,
    start,
    jumpTo,
    restore,
    advance,
    takeReward,
    onEnterCar,
    onSteal,
    onEnemyDown,
    update,
    marker,
    objectiveText,
    tipText,
    say,
  };
}
