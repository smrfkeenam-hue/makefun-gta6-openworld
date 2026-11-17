// The HUD: DOM panels over the canvas (mission, cash, wanted stars, health,
// speed, district, message banner) plus a live minimap canvas that shows the
// roads, the player, the police, rivals and the mission marker. DOM is used
// for text so it stays crisp at any window size; the game canvas keeps the
// world. Updated every frame from the same state the renderer paints.
//
// New in this pass: a job-progress row (five dots, filled as jobs complete), a
// clock showing the in-game time of day, a tip line under the objective, and a
// speedometer that also shows the car's name and a redline flash at top speed.
// The minimap now draws the beach, the pier and pickups, and rings the player
// when the heat is on.

import { DISTRICTS, PALETTE, ROADS_X, ROADS_Y, WORLD } from './config.js';
import { districtAt } from './city.js';
import { dist } from './random.js';

export function createHud() {
  const root = document.getElementById('hud');
  const objectiveEl = document.getElementById('hud-objective-text');
  const jobsEl = document.getElementById('hud-jobs');
  const tipEl = document.getElementById('hud-tip');
  const clockEl = document.getElementById('hud-clock');
  const cashEl = document.getElementById('hud-cash');
  const starsEl = document.getElementById('hud-stars');
  const districtEl = document.getElementById('hud-district');
  const healthFill = document.getElementById('hud-health-fill');
  const healthText = document.getElementById('hud-health-text');
  const speedEl = document.getElementById('hud-speed');
  const messageEl = document.getElementById('hud-message');
  const promptEl = document.getElementById('hud-prompt');
  const mapCanvas = document.getElementById('minimap');
  const mapCtx = mapCanvas.getContext('2d');
  // A true circle: a square canvas, the 4:3 city map centred inside it with
  // the empty bands filled so nothing is cut off at the edges.
  const MAP_W = 220;
  const MAP_H = 220;
  mapCanvas.width = MAP_W;
  mapCanvas.height = MAP_H;
  const mapScale = Math.min(MAP_W / WORLD.width, MAP_H / WORLD.height);
  const mapOffX = (MAP_W - WORLD.width * mapScale) / 2;
  const mapOffY = (MAP_H - WORLD.height * mapScale) / 2;
  const mx = (x) => mapOffX + x * mapScale;
  const my = (y) => mapOffY + y * mapScale;
  const mw = (w) => w * mapScale;
  const mh = (h) => h * mapScale;

  let lastObjective = '';
  let lastJobs = '';
  let lastTip = '';
  let lastClock = '';
  let lastCash = -1;
  let lastStars = -1;
  let lastDistrict = '';
  let lastHealth = -1;
  let lastSpeed = -1;
  let lastMessage = '';
  let lastPrompt = '';

  function setText(el, value, last) {
    if (!el) return last;
    if (value !== last) el.textContent = value;
    return value;
  }

  /** "17:24" from the in-game time of day (hours, 0..24). */
  function clockText(timeOfDay) {
    const h = Math.floor(timeOfDay) % 24;
    const m = Math.floor((timeOfDay - Math.floor(timeOfDay)) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  function drawMinimap(state) {
    const ctx = mapCtx;
    ctx.fillStyle = '#21272f';
    ctx.fillRect(0, 0, MAP_W, MAP_H);
    // Water and beach.
    ctx.fillStyle = '#256b92';
    ctx.fillRect(mx(0), my(0), mx(WORLD.waterX) - mx(0), mh(WORLD.height));
    ctx.fillStyle = '#ecd9a0';
    ctx.fillRect(mx(WORLD.waterX), my(0), mw(WORLD.beachX - WORLD.waterX), mh(WORLD.height));
    // Districts, faint.
    for (const d of DISTRICTS) {
      ctx.fillStyle = d.tint + '22';
      ctx.fillRect(mx(d.x), my(d.y), mw(d.w), mh(d.h));
    }
    // Roads.
    ctx.fillStyle = '#7d838c';
    for (const rx of ROADS_X) ctx.fillRect(mx(rx) - 2, my(0), 4, mh(WORLD.height));
    for (const ry of ROADS_Y) ctx.fillRect(mx(0), my(ry) - 2, mw(WORLD.width), 4);
    // Buildings as dots.
    ctx.fillStyle = 'rgba(244,241,230,0.5)';
    for (const b of state.city.buildings) {
      ctx.fillRect(mx(b.x), my(b.y), Math.max(1.5, mw(b.w)), Math.max(1.5, mh(b.h)));
    }
    // The harbor pier, so the Dockside Deal spot reads on the map.
    ctx.fillStyle = '#8a6a45';
    ctx.fillRect(mx(2740), my(3040), mw(220), mh(120));
    // Pickups: green for cash, white for med kits.
    for (const p of state.combat.pickups) {
      ctx.fillStyle = p.type === 'cash' ? '#2f9e5f' : '#f4f1e6';
      ctx.fillRect(mx(p.x) - 2, my(p.y) - 2, 4, 4);
    }
    // Mission marker.
    const marker = state.missions.marker();
    if (marker) {
      const pulse = 3 + Math.sin(state.time * 5) * 1.5;
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.arc(mx(marker.x), my(marker.y), pulse + 2, 0, Math.PI * 2);
      ctx.fill();
    }
    // Rivals.
    ctx.fillStyle = '#e5484d';
    for (const enemy of state.combat.enemies) {
      if (enemy.alive) ctx.fillRect(mx(enemy.x) - 2, my(enemy.y) - 2, 4, 4);
    }
    // Police.
    ctx.fillStyle = '#4d7dff';
    for (const cop of state.police.cops) {
      ctx.beginPath();
      ctx.arc(mx(cop.x), my(cop.y), 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // The player: a gold arrow pointing where she faces, ringed red in a chase.
    const px = mx(state.player.x);
    const py = my(state.player.y);
    if (state.police.stars > 0) {
      ctx.strokeStyle = 'rgba(255,59,48,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, 11 + Math.sin(state.time * 6) * 1.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(state.player.angle);
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-5, -5);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /** Refresh every HUD element from the live state. Cheap: text only on change. */
  function update(state) {
    const objective = state.missions.objectiveText();
    // Live distance to the objective marker, so the player always knows how
    // far the job is — the same number the world arrow shows.
    const marker = state.missions.marker();
    const objectiveWithDist = marker
      ? `${objective} · ${Math.round(dist(state.player.x, state.player.y, marker.x, marker.y))}m`
      : objective;
    lastObjective = setText(objectiveEl, objectiveWithDist, lastObjective);
    // Job progress: five dots, filled as jobs complete.
    const jobs = '●'.repeat(state.missions.completed) + '○'.repeat(5 - state.missions.completed);
    lastJobs = setText(jobsEl, jobs, lastJobs);
    lastTip = setText(tipEl, state.missions.tipText ? state.missions.tipText() : '', lastTip);
    lastClock = setText(clockEl, clockText(state.timeOfDay), lastClock);
    lastCash = setText(cashEl, `$${Math.round(state.player.cash)}`, lastCash);
    const stars = state.police.stars;
    if (stars !== lastStars) {
      lastStars = stars;
      starsEl.textContent = '★'.repeat(stars) + '☆'.repeat(5 - stars);
      starsEl.classList.toggle('hot', stars >= 3);
    }
    const district = districtAt(state.player.x, state.player.y);
    lastDistrict = setText(districtEl, district, lastDistrict);
    const health = Math.round(state.player.health);
    if (health !== lastHealth) {
      lastHealth = health;
      healthFill.style.width = `${health}%`;
      healthFill.classList.toggle('low', health <= 30);
      healthText.textContent = `${health}`;
    }
    const speed = state.player.inCar ? Math.round(Math.abs(state.player.speed) * 0.18) : 0;
    if (speed !== lastSpeed) {
      lastSpeed = speed;
      if (state.player.inCar) {
        const top = Math.round(state.player.inCar.model.top * 0.18);
        speedEl.textContent = `${speed} mph · ${state.player.inCar.model.name}`;
        speedEl.classList.toggle('redline', speed >= top - 5);
      } else {
        speedEl.textContent = 'On foot';
        speedEl.classList.remove('redline');
      }
    }
    const message = state.missions.message;
    if (message !== lastMessage) {
      lastMessage = message;
      messageEl.textContent = message;
      messageEl.classList.toggle('show', message.length > 0);
    }
    const prompt = state.prompt || '';
    if (prompt !== lastPrompt) {
      lastPrompt = prompt;
      promptEl.textContent = prompt;
      promptEl.classList.toggle('show', prompt.length > 0);
    }
    root.classList.toggle('playing', state.screen === 'play');
    drawMinimap(state);
  }

  return { update };
}
