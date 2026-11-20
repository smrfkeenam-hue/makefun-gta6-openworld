// Boot and the one loop for Solmar Bay: builds the city, its traffic, police,
// combat and missions, wires them into one state, and steps the world in fixed
// 1/60 s slices. Screens: title, play, paused, busted, down, win (then free
// roam). ?shot=cover|chase|city|mission stages a screenshot scene instead of
// running the loop, paints it twice and sets window.__shotReady.
//
// Run statistics (miles driven, near misses, time played, busts) that the save
// carries and the pause screen shows; player settings (mute, music volume)
// loaded from localStorage at boot; the music's chase layer follows the wanted
// level, and the ambient bed follows the district (waves by the beach, hum
// downtown). The loop, the screens and the save format are unchanged — a v2
// save still loads.

import { CLOCK_RATE, DAY_CYCLE, STEP, STORY } from './config.js';
import { createRandom } from './random.js';
import { dist } from './random.js';
import { createAudio } from './audio.js';
import { createCity } from './city.js';
import { createTraffic, carOverlapsPoint } from './traffic.js';
import { createPolice } from './police.js';
import { createCombat } from './combat.js';
import { createMissions } from './missions.js';
import { createPlayer } from './player.js';
import { ACTION_CONFIRM, ACTION_ENTER, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART, createInput } from './input.js';
import { createRenderer, SCREEN_BUSTED, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';
import { createHud } from './hud.js';
import { clearSave, loadGame, loadSettings, saveGame, saveSettings, saveStatsSummary, saveSummary } from './save.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;
const AUTOSAVE_EVERY = 25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const random = createRandom(seed);

const audio = createAudio();
const city = createCity(random);
const traffic = createTraffic(random, city);
const police = createPolice(random, city);
const combat = createCombat(random, city);
const missions = createMissions();
const playerApi = createPlayer(random, city);
const player = playerApi.player;

const settings = loadSettings();
if (settings.muted) audio.toggleMute();
audio.setMusicVolume(settings.musicVolume);

const state = {
  player,
  city,
  traffic,
  police,
  combat,
  missions,
  time: 0,
  timeOfDay: DAY_CYCLE.startHour, // late afternoon: the sun is low over the bay
  screen: SCREEN_TITLE,
  prompt: '',
  shotZoom: 1,
  saveSummary: '',
  hasSave: false,
  // Run statistics: carried by the save, shown on the pause screen.
  stats: { distanceDriven: 0, nearMisses: 0, timePlayed: 0, busts: 0 },
};

const renderer = createRenderer(canvas);
const hud = createHud();
const input = createInput(canvas);

const ctx = {
  city, traffic, police, combat, missions, audio,
  onNearMiss: () => { state.stats.nearMisses += 1; },
};

let screen = SCREEN_TITLE;
let saveData = loadGame();
let winShown = false;
let autosaveTimer = AUTOSAVE_EVERY;
let maintainTimer = 0;
let last = performance.now();
let accumulator = 0;
let lastPlayerX = player.x;
let lastPlayerY = player.y;

if (saveData) {
  state.hasSave = true;
  state.saveSummary = saveSummary(saveData);
  if (saveData.stats) state.stats = { ...state.stats, ...saveData.stats };
}

function announce(message) {
  status.textContent = message;
}

function aimAngle() {
  const mouse = input.mouse();
  const zoom = renderer.camera.zoom;
  const worldX = renderer.camera.x + (mouse.x - canvas.width / 2) / zoom;
  const worldY = renderer.camera.y + (mouse.y - canvas.height / 2) / zoom;
  return Math.atan2(worldY - player.y, worldX - player.x);
}

function applySave(data) {
  player.cash = data.cash;
  player.health = data.health;
  player.x = data.x;
  player.y = data.y;
  state.timeOfDay = data.timeOfDay || DAY_CYCLE.startHour;
  if (data.stats) state.stats = { ...state.stats, ...data.stats };
  // Restore the chain's progress, not just its position: a save from after
  // the last job resumes in free roam instead of replaying job five.
  missions.restore(data.missionIndex, data.completed || 0);
}

function startGame(fromSave) {
  winShown = false;
  if (fromSave && saveData) {
    applySave(saveData);
    // A completed save has already celebrated: resuming drops straight into
    // free roam instead of replaying the win screen on the first tick.
    if (missions.done) winShown = true;
  } else {
    playerApi.reset(700, 900);
    missions.jumpTo(0, 0);
    police.clear();
    combat.clearEnemies();
  }
  screen = SCREEN_PLAY;
  state.screen = screen;
  missions.start();
  audio.unlock();
  audio.startMusic();
  announce(`Solmar Bay. ${missions.objectiveText()}`);
}

function respawn() {
  // Back on her feet near the current job, heat gone, rivals gone.
  player.health = 100;
  player.dead = false;
  player.inCar = null;
  player.speed = 0;
  winShown = false;
  police.clear();
  combat.clearEnemies();
  const marker = missions.marker();
  const spot = marker ? city.freeSpot(marker.x, marker.y) : city.freeSpot(700, 900);
  player.x = spot.x;
  player.y = spot.y;
  screen = SCREEN_PLAY;
  state.screen = screen;
  announce('Back on your feet, Mara.');
}

function restartJob() {
  respawn();
  missions.say('Job restarted — fresh attempt, same target.', 3);
}

function endRun(kind) {
  screen = kind === 'busted' ? SCREEN_BUSTED : SCREEN_OVER;
  state.screen = screen;
  if (kind === 'busted') state.stats.busts += 1;
  audio.stopMusic();
  audio.engine(0, false);
  audio.siren(false);
  saveGame(state);
  announce(kind === 'busted' ? 'Busted by the Solmar Bay PD.' : 'Mara is down.');
}

/** One fixed world step, driven by the live input or a scripted one (shots). */
function tick(dt, inputOverride) {
  state.time += dt;
  state.timeOfDay = (DAY_CYCLE.startHour + state.time * CLOCK_RATE) % 24;
  const live = inputOverride || input;
  if (screen === SCREEN_TITLE) {
    // The city stays alive behind the title panel.
    for (const car of traffic.cars) traffic.stepCar(car, dt, null);
    for (const ped of traffic.peds) traffic.stepPed(ped, dt);
    return;
  }
  if (screen !== SCREEN_PLAY) return;

  const actions = live.takeActions();
  if (actions & ACTION_PAUSE) {
    screen = SCREEN_PAUSED;
    state.screen = screen;
    announce(`Paused. ${saveStatsSummary({ stats: state.stats }) || ''}`);
    return;
  }
  if (actions & ACTION_MUTE) {
    const muted = audio.toggleMute();
    saveSettings({ muted, musicVolume: settings.musicVolume });
    missions.say(muted ? 'Sound off.' : 'Sound on.', 2);
  }
  if (actions & ACTION_RESTART) restartJob();
  if (actions & ACTION_ENTER && !player.inCar) {
    playerApi.tryEnterCar(ctx);
  } else if (actions & ACTION_ENTER && player.inCar) {
    playerApi.exitCar(ctx);
    audio.engine(0, false);
  }
  if (actions & ACTION_CONFIRM && !player.inCar) audio.unlock();

  // The "Press E" prompt when a car is in reach on foot.
  if (!player.inCar) {
    const near = playerApi.nearestCar(traffic.cars, 110);
    state.prompt = near ? `Press E — take the ${near.model.name}` : '';
  } else {
    state.prompt = '';
  }

  const died = playerApi.step(dt, live, ctx, aimAngle());
  if (died) {
    endRun('down');
    return;
  }

  // Run statistics: miles driven and time on the streets.
  state.stats.distanceDriven += dist(player.x, player.y, lastPlayerX, lastPlayerY);
  state.stats.timePlayed += dt;
  lastPlayerX = player.x;
  lastPlayerY = player.y;

  // Traffic and pedestrians near the player.
  for (const car of traffic.cars) {
    if (Math.abs(car.x - player.x) < 1500 && Math.abs(car.y - player.y) < 1500) {
      traffic.stepCar(car, dt, player.inCar);
    }
  }
  for (const ped of traffic.peds) {
    if (Math.abs(ped.x - player.x) < 1300 && Math.abs(ped.y - player.y) < 1300) {
      const dangerR = player.inCar ? 260 : 200;
      traffic.stepPed(ped, dt, player.x, player.y, dangerR);
    }
  }
  maintainTimer -= dt;
  if (maintainTimer <= 0) {
    maintainTimer = 1;
    traffic.maintain(player.x, player.y, state.timeOfDay);
  }

  // A traffic car that clips Mara on foot hurts her.
  if (!player.inCar) {
    for (const car of traffic.cars) {
      if (!car.parked && car.speed > 60 && carOverlapsPoint(car, player.x, player.y, 2)) {
        playerApi.hurt(18, ctx);
        player.x += (player.x - car.x) * 0.2;
        player.y += (player.y - car.y) * 0.2;
        break;
      }
    }
  }

  const busted = police.step(dt, { x: player.x, y: player.y, inCar: !!player.inCar, speed: Math.abs(player.speed), angle: player.angle }, state.time);
  if (busted) {
    endRun('busted');
    return;
  }
  audio.siren(police.stars > 0);
  if (police.stars > 0) audio.sirenWail(state.time);
  if (!player.inCar) audio.engine(0, false);
  // The chase layer follows the heat; the ambient bed follows the district.
  audio.setIntensity(police.stars / 5);
  audio.ambient(player.x < 500 ? 1 : player.x > 1800 && player.x < 3600 ? 0.5 : 0.3);

  combat.step(dt, player, {
    onPlayerHit: (dmg) => playerApi.hurt(dmg, ctx),
    onEnemyDown: () => {
      missions.onEnemyDown();
      audio.cash();
    },
    onEnemyShot: () => audio.enemyShoot(),
    onPickup: (pickup) => {
      if (pickup.type === 'cash') {
        player.cash += pickup.value;
        audio.cash();
      } else {
        playerApi.heal(pickup.value);
        audio.pickup();
      }
    },
  });

  missions.update(dt, {
    player,
    policeStars: police.stars,
    setWanted: (level) => police.setStars(level),
    spawnRivals: (count) => combat.spawnEnemies(player.x, player.y, count),
  });
  // A job that needs a specific car always has one in reach: park one nearby.
  const cur = missions.step();
  if (cur && cur.type === 'stealModel') {
    const near = traffic.cars.some((c) => c.model.name === cur.model && dist(c.x, c.y, player.x, player.y) < 800);
    if (!near) traffic.spawnModel(cur.model, player.x + 260, player.y);
  }
  const reward = missions.takeReward();
  if (reward > 0) {
    player.cash += reward;
    audio.mission();
    missions.say(`Job complete — +$${reward}.`, 5);
    saveGame(state);
  }
  if (missions.done && !winShown) {
    winShown = true;
    screen = SCREEN_WIN;
    state.screen = screen;
    audio.mission();
    saveGame(state);
    announce('All five jobs done. The Tide is free.');
  }

  autosaveTimer -= dt;
  if (autosaveTimer <= 0) {
    autosaveTimer = AUTOSAVE_EVERY;
    saveGame(state);
  }
}

function handleScreenActions() {
  const actions = input.takeActions();
  if (screen === SCREEN_TITLE) {
    if (actions & ACTION_CONFIRM) {
      audio.unlock();
      startGame(state.hasSave);
    }
    return;
  }
  if (screen === SCREEN_PAUSED) {
    if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
      screen = SCREEN_PLAY;
      state.screen = screen;
      announce('Playing.');
    }
    return;
  }
  if (screen === SCREEN_OVER || screen === SCREEN_BUSTED) {
    if (actions & ACTION_CONFIRM) respawn();
    return;
  }
  if (screen === SCREEN_WIN) {
    if (actions & ACTION_CONFIRM) {
      screen = SCREEN_PLAY;
      state.screen = screen;
      announce('Free roam — Solmar Bay is yours.');
    }
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  accumulator += Math.min((now - last) / 1000, MAX_FRAME);
  last = now;
  if (screen === SCREEN_PLAY) {
    // Gameplay actions (pause, mute, enter car) are read inside tick().
    while (accumulator >= STEP) {
      tick(STEP);
      accumulator -= STEP;
      if (screen !== SCREEN_PLAY) {
        accumulator = 0;
        break;
      }
    }
  } else {
    handleScreenActions();
    while (accumulator >= STEP) {
      tick(STEP);
      accumulator -= STEP;
    }
  }
  renderer.draw(state, screen);
  hud.update(state);
}

function runShot(name) {
  screen = SCREEN_PLAY;
  state.screen = screen;
  stageShot(name, { state, player, traffic, police, combat, missions, city, tick });
  let painted = 0;
  function paint() {
    renderer.draw(state, screen);
    hud.update(state);
    painted += 1;
    if (painted === 3) window.__shotReady = true;
    // Keep painting: the staged state is frozen, so every frame is the same
    // picture — but a late canvas resize (headless windows settle their size
    // after load) clears the canvas, and a stopped loop would leave it blank.
    requestAnimationFrame(paint);
  }
  requestAnimationFrame(paint);
}

// Leaving the tab pauses a running game rather than letting the city run unseen.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && screen === SCREEN_PLAY) {
    screen = SCREEN_PAUSED;
    state.screen = screen;
    announce('Paused.');
  }
});

announce(`Solmar Bay — ${STORY.hero} owes ${STORY.boss} one last run. Press Enter to start.`);

// A read-only handle for automated playtests and the finalist review: the
// live world, nothing more. It never drives the game — tests send real keys.
window.__solmar = {
  state,
  player,
  missions,
  police,
  traffic,
  combat,
  city,
  camera: renderer.camera,
  get screen() {
    return screen;
  },
  version: 'solmar-bay-recovery-1',
};

if (shot) runShot(shot);
else requestAnimationFrame(frame);

// Fresh starts clear an old save only when the player asks from the title:
// pressing N on the title starts a new story.
window.addEventListener('keydown', (event) => {
  if (event.code === 'KeyN' && screen === SCREEN_TITLE && state.hasSave) {
    clearSave();
    saveData = null;
    state.hasSave = false;
    state.saveSummary = '';
    announce('New story — the old save is cleared.');
  }
});
