// The wanted system: stars that rise with crimes, police cars that spawn at the
// edge of view and chase the player, ram them, and give up when the player stays
// out of sight long enough. A bust ends the run when a cop touches the player
// on foot at 3+ stars, or when the player's car is boxed in at low speed.
//
// The pursuit is no longer one behaviour: each cruiser takes a role. Chasers
// hunt the player's current position; interceptors cut ahead to the point the
// player is heading for, so a straight-line getaway runs into a cruiser
// instead of outrunning one; and at four stars and up, a roadblock cruiser
// parks across the road ahead, leaving a gap to thread — pressure, not a wall.
// Roles rotate as cruisers spawn, so the chase keeps changing shape.

import { WANTED } from './config.js';
import { nearestRoadPoint } from './city.js';
import { angleDiff, clamp, dist, range } from './random.js';

const POLICE_MODEL = { name: 'Interceptor', color: '#2b4fd8', len: 54, wid: 26, accel: 460, top: 590, grip: 3.6, price: 0 };

// Roles cycle as cruisers spawn: chase, intercept, chase, roadblock at 4+.
const ROLE_CYCLE = ['chase', 'intercept', 'chase', 'roadblock'];

export function createPolice(random, city) {
  const cops = [];
  let stars = 0;
  let starFloat = 0;
  let unseenTimer = 0;
  let spawnTimer = 0;
  let bustedTimer = 0;
  let spawnCount = 0;

  function addStars(n, reason) {
    starFloat = clamp(starFloat + n, 0, WANTED.max);
    stars = Math.floor(starFloat);
    // A new crime raises the heat, but it does not reset the unseen clock:
    // that clock is about whether a cop can SEE Mara, and a hit nobody saw
    // should not restart it. The old reset meant every ped clipped during
    // a getaway restarted the whole decay, so the heat could never fall.
    return reason;
  }

  function setStars(n) {
    starFloat = clamp(n, 0, WANTED.max);
    stars = Math.floor(starFloat);
    // Scripted heat is a fresh chase: the unseen clock restarts here. Without
    // this, the clock has been running since the last 0-star stretch, so the
    // decay delay is already spent and the new stars start falling the very
    // frame they are set — a 3-star wanted level would read as 2 stars
    // before the HUD could even show it.
    unseenTimer = 0;
  }

  function spawnCop(px, py, heading) {
    // Pursuit cars join the chase from behind Mara, never in her path: a
    // cruiser appearing 600px ahead of a car doing 600px/s is inside the
    // sight range before she can react, and at five stars the spawn stream
    // alone made the heat impossible to lose.
    const behind = heading === undefined ? random() * Math.PI * 2 : heading + Math.PI + range(random, -0.7, 0.7);
    const d = range(random, 720, 920);
    const sx = px + Math.cos(behind) * d;
    const sy = py + Math.sin(behind) * d;
    // Land on the nearest street: a pursuit car spawning inside a building or
    // the ocean looks broken and can never reach the player.
    const road = nearestRoadPoint(clamp(sx, 380, 4740), clamp(sy, 60, 3540));
    // Roles cycle: a roadblock only joins at four stars and up, so early
    // chases stay a straight hunt and the endgame gets its wall.
    let role = ROLE_CYCLE[spawnCount % ROLE_CYCLE.length];
    if (role === 'roadblock' && stars < 4) role = 'intercept';
    spawnCount += 1;
    cops.push({
      model: POLICE_MODEL,
      x: road.x,
      y: road.y,
      angle: Math.atan2(py - road.y, px - road.x),
      speed: 200,
      siren: random() * Math.PI * 2,
      ramCooldown: 0,
      role,
      blockTimer: 0, // roadblock cruisers hold their post for a while, then join the chase
    });
  }

  function nearestCop(px, py) {
    let best = Infinity;
    for (const cop of cops) best = Math.min(best, dist(cop.x, cop.y, px, py));
    return best;
  }

  /**
   * One step. Returns 'busted' when the player is caught, else null.
   * `player` is {x, y, inCar, speed}; `onCrime` fires when a cop sees a crime.
   */
  function step(dt, player, time) {
    stars = Math.floor(starFloat);
    const maxCops = WANTED.maxCops[stars];
    // Spawn pursuit cars up to the cap for the current wanted level.
    if (stars > 0 && cops.length < maxCops) {
      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        spawnCop(player.x, player.y, player.angle);
        spawnTimer = WANTED.spawnInterval;
      }
    }
    // Wanted decays only while no cop can see the player.
    const nearest = nearestCop(player.x, player.y);
    const seen = stars > 0 && nearest < WANTED.sightRange;
    if (seen) unseenTimer = 0;
    else unseenTimer += dt;
    if (stars > 0 && unseenTimer > WANTED.decayDelay) {
      starFloat = Math.max(0, starFloat - WANTED.decayRate * dt);
      stars = Math.floor(starFloat);
      if (stars === 0) cops.length = 0;
    }

    // Chase: steer toward the player's predicted position, ram on contact.
    let busted = false;
    for (let i = cops.length - 1; i >= 0; i -= 1) {
      const cop = cops[i];
      const d = dist(cop.x, cop.y, player.x, player.y);
      if (d > 1500) {
        cops.splice(i, 1);
        continue;
      }
      // Where this cruiser is heading: chasers take the player now,
      // interceptors take where the player will be in two seconds, and a
      // roadblock cruiser takes a point on the road ahead and parks there.
      let targetX = player.x;
      let targetY = player.y;
      let holdingPost = false;
      if (cop.role === 'intercept' && player.inCar) {
        const lead = 2.0;
        targetX = player.x + Math.cos(player.angle) * Math.abs(player.speed) * lead;
        targetY = player.y + Math.sin(player.angle) * Math.abs(player.speed) * lead;
      } else if (cop.role === 'roadblock') {
        cop.blockTimer += dt;
        // Hold the post for up to 12 seconds, then join the chase — a wall
        // that never moves would be a dead end, not a pursuit.
        if (cop.blockTimer < 12) {
          const ahead = nearestRoadPoint(
            player.x + Math.cos(player.angle) * 520,
            player.y + Math.sin(player.angle) * 520,
          );
          targetX = ahead.x;
          targetY = ahead.y;
          if (dist(cop.x, cop.y, targetX, targetY) < 60) holdingPost = true;
        } else {
          cop.role = 'chase';
        }
      }
      const targetAngle = Math.atan2(targetY - cop.y, targetX - cop.x);
      const turn = clamp(angleDiff(cop.angle, targetAngle), -2.6 * dt, 2.6 * dt);
      cop.angle += turn;
      // The pursuit is faster with more heat, but never faster than a proper
      // getaway car: at 3 stars the old formula outran the Bay Cruiser and
      // the Coast Pickup outright, so a slow car was a guaranteed bust no
      // matter how well Mara drove. Difficulty at high heat comes from the
      // number of cruisers, not from a speed no car can match.
      const wantSpeed = holdingPost ? 0 : Math.min(WANTED.chaseSpeed + stars * 12, 460);
      cop.speed += clamp(wantSpeed - cop.speed, -300 * dt, 240 * dt);
      // Pursuit cars respect the city: they slide along building walls
      // instead of driving through them. A cop that cuts straight through a
      // block corners Mara on roads she must follow, and no getaway is
      // possible against a shortcut no driver can take.
      const nx = cop.x + Math.cos(cop.angle) * cop.speed * dt;
      const ny = cop.y + Math.sin(cop.angle) * cop.speed * dt;
      if (city && !city.blocked(nx, ny, 12)) {
        cop.x = nx;
        cop.y = ny;
      } else if (city && !city.blocked(nx, cop.y, 12)) {
        cop.x = nx;
      } else if (city && !city.blocked(cop.x, ny, 12)) {
        cop.y = ny;
      } else if (!city) {
        cop.x = nx;
        cop.y = ny;
      }
      cop.siren += dt * 6;
      if (cop.ramCooldown > 0) cop.ramCooldown -= dt;
      // Touching the player on foot at 3+ stars, or pinning a slow car, busts them.
      // The pin timer is about being pinned RIGHT NOW: it resets the moment
      // Mara pulls away or the cop loses contact, so a slowdown during the
      // chase does not carry a bust debt into the next stop.
      if (d < 46) {
        if (!player.inCar && stars >= 3) {
          bustedTimer += dt;
          if (bustedTimer > 0.9) busted = true;
        } else if (player.inCar && player.speed < 40 && stars >= 2) {
          bustedTimer += dt;
          if (bustedTimer > 3.5) busted = true;
        } else {
          bustedTimer = 0;
        }
      } else {
        bustedTimer = 0;
      }
    }
    if (busted) return 'busted';
    return null;
  }

  function clear() {
    cops.length = 0;
    starFloat = 0;
    stars = 0;
    unseenTimer = 0;
    bustedTimer = 0;
    spawnCount = 0;
  }

  return {
    cops,
    get stars() {
      return stars;
    },
    get starFloat() {
      return starFloat;
    },
    addStars,
    setStars,
    step,
    clear,
    nearestCop,
  };
}
