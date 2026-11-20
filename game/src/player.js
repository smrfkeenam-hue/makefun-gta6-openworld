// Mara Quinn, on foot and behind the wheel. On foot she walks, runs and shoots
// where the mouse points; in a car she drives arcade physics — accelerate,
// steer, handbrake turns — and E gets her in and out. Stealing an occupied car
// takes a moment and earns a star; a parked car is just hers.
//
// A drifting state kicks dust and skid particles off the rear wheels during a
// handbrake turn, a near-miss detector (threading a traffic car at speed without
// touching it) feeds the run statistics, and a damage model makes a car that
// has scraped one too many walls smoke — and a smoking car is slower. The
// numbers that decide a chase (speeds, ram cooldowns, star costs) are unchanged:
// a getaway that worked before still works.

import { COMBAT, PLAYER, WORLD } from './config.js';
import { angleDiff, clamp, dist } from './random.js';
import { carOverlapsPoint } from './traffic.js';

const NEAR_MISS_DIST = 75;   // a pass inside this, without touching, counts
const SMOKE_AT_DAMAGE = 40;  // damage past this makes the car smoke and slow

export function createPlayer(random, city) {
  const player = {
    x: 700,
    y: 900,
    angle: 0,
    health: PLAYER.maxHealth,
    cash: 250,
    inCar: null,       // the car object she is driving, or null
    speed: 0,          // driving speed, px/s
    walkPhase: 0,
    fireTimer: 0,
    stealTarget: null, // car being stolen right now
    stealProgress: 0,
    hurtTimer: 0,
    dead: false,
    drifting: false,   // handbrake turn at speed, for particles and sound
    damage: 0,         // scrapes accumulate; past SMOKE_AT_DAMAGE the car smokes
    nearMissTimer: 0,  // cooldown so one pass counts once
  };

  function reset(x, y) {
    player.x = x;
    player.y = y;
    player.angle = -Math.PI / 2;
    player.health = PLAYER.maxHealth;
    player.cash = 250;
    player.inCar = null;
    player.speed = 0;
    player.fireTimer = 0;
    player.stealTarget = null;
    player.stealProgress = 0;
    player.hurtTimer = 0;
    player.dead = false;
    player.drifting = false;
    player.damage = 0;
    player.nearMissTimer = 0;
  }

  function nearestCar(cars, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const car of cars) {
      const d = dist(player.x, player.y, car.x, car.y);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  function tryEnterCar(ctx) {
    const car = nearestCar(ctx.traffic.cars, PLAYER.enterRadius + 40);
    if (!car) return;
    if (car.driver) {
      // Occupied: a steal in progress. The driver brakes to a stop while Mara
      // pulls them out — a moving car cannot be stolen from.
      car.brake = 2.5;
      car.speed = 0;
      player.stealTarget = car;
      player.stealProgress = 0;
    } else {
      enterCar(ctx, car, false);
    }
  }

  function enterCar(ctx, car, stolen) {
    player.inCar = car;
    car.parked = false;
    car.driver = true;
    player.speed = 0;
    player.angle = car.angle;
    player.stealTarget = null;
    player.damage = 0;
    ctx.audio.enterCar();
    ctx.audio.doorSlam();
    if (stolen) {
      ctx.police.addStars(1, 'stolen car');
      ctx.missions.say('That one\'s yours now — and the law saw you take it.', 3);
    }
    ctx.missions.onEnterCar();
    ctx.missions.onSteal(car.model.name);
  }

  function exitCar(ctx) {
    const car = player.inCar;
    if (!car) return;
    player.inCar = null;
    player.speed = 0;
    player.drifting = false;
    // Park it where it stands: a car left driving itself away after Mara got
    // out was a bug, not a feature — it keeps its place until she returns.
    car.parked = true;
    car.driver = false;
    car.speed = 0;
    car.cruise = 0;
    ctx.audio.doorSlam();
    // Step out to the car's left side, clear of walls.
    const side = car.angle + Math.PI / 2;
    let px = car.x + Math.cos(side) * 34;
    let py = car.y + Math.sin(side) * 34;
    if (city.blocked(px, py, 16)) {
      px = car.x - Math.cos(side) * 34;
      py = car.y - Math.sin(side) * 34;
    }
    player.x = px;
    player.y = py;
  }

  function stepOnFoot(dt, input, ctx, aimAngle) {
    const move = input.move();
    const sprint = input.sprint();
    const speed = sprint ? PLAYER.runSpeed : PLAYER.walkSpeed;
    const nx = player.x + move.x * speed * dt;
    const ny = player.y + move.y * speed * dt;
    if (!city.blocked(nx, player.y, PLAYER.radius)) player.x = nx;
    if (!city.blocked(player.x, ny, PLAYER.radius)) player.y = ny;
    player.x = clamp(player.x, WORLD.waterX + 16, WORLD.width - 16);
    player.y = clamp(player.y, 16, WORLD.height - 16);
    if (move.x !== 0 || move.y !== 0) {
      player.walkPhase += dt * speed * 0.05;
      // Sprinting kicks up dust on the sidewalk.
      if (sprint && random() < 0.12) ctx.combat.dust(player.x, player.y + 8);
    }
    player.angle = aimAngle;

    // Firing: mouse held, on the fire-rate clock.
    player.fireTimer -= dt;
    const mouse = input.mouse();
    if (mouse.down && player.fireTimer <= 0) {
      player.fireTimer = COMBAT.fireRate;
      ctx.combat.fireBullet(player.x, player.y, player.angle, true);
      ctx.combat.muzzle(player.x, player.y, player.angle);
      ctx.audio.shoot();
    }
    // Steal in progress: hold still near the car, then take it.
    if (player.stealTarget) {
      const car = player.stealTarget;
      if (dist(player.x, player.y, car.x, car.y) > PLAYER.enterRadius + 60 || !car.driver) {
        player.stealTarget = null;
      } else {
        player.stealProgress += dt / PLAYER.stealTime;
        if (player.stealProgress >= 1) enterCar(ctx, car, true);
      }
    }
    if (player.hurtTimer > 0) player.hurtTimer -= dt;
  }

  function stepDriving(dt, input, ctx) {
    const car = player.inCar;
    const throttle = input.throttle();
    const steer = input.steer();
    const handbrake = input.handbrake();
    const model = car.model;
    const accel = throttle > 0 ? model.accel : throttle < 0 ? model.accel * 0.7 : 0;
    player.speed += accel * throttle * dt;
    // Drag and rolling resistance; handbrake cuts grip and speed fast.
    player.speed -= player.speed * (handbrake ? 1.6 : 0.55) * dt;
    if (throttle === 0 && Math.abs(player.speed) < 12) player.speed = 0;
    // A battered car loses its top end: damage past the smoke line costs
    // 15% of top speed, so scrapes have a price without ending a run.
    const topSpeed = model.top * (player.damage >= SMOKE_AT_DAMAGE ? 0.85 : 1);
    player.speed = clamp(player.speed, -topSpeed * 0.45, topSpeed);
    const speedRatio = Math.abs(player.speed) / model.top;
    const turnRate = model.grip * (0.35 + 0.65 * Math.min(1, speedRatio + 0.25)) * (player.speed < 0 ? -1 : 1);
    car.angle += steer * turnRate * dt * (handbrake ? 1.5 : 1);
    // Drifting: a hard handbrake turn at speed. It screeches, kicks dust
    // off the rear wheels, and leaves the car sliding — the feel of it.
    player.drifting = handbrake && Math.abs(player.speed) > 260 && Math.abs(steer) > 0;
    if (player.drifting) {
      ctx.audio.skid();
      if (random() < 0.5) {
        const back = car.angle + Math.PI;
        ctx.combat.dust(car.x + Math.cos(back) * 20, car.y + Math.sin(back) * 20);
      }
    }
    const nx = car.x + Math.cos(car.angle) * player.speed * dt;
    const ny = car.y + Math.sin(car.angle) * player.speed * dt;
    // Buildings stop the car hard; traffic bumps it and slows both. The car
    // SLIDES along a wall instead of bouncing back off it: the old bounce
    // reversed the speed, and a reversing car steers inverted, so a car
    // that clipped a building at a corner wedged itself there and the
    // pursuit pinned it. Now it scrapes along and stays drivable.
    if (city.blocked(nx, ny, 16)) {
      if (Math.abs(player.speed) > 240) {
        ctx.audio.crash();
        ctx.combat.sparks(car.x, car.y);
        ctx.police.addStars(0, 'crash');
        player.damage += 12;
      }
      if (!city.blocked(nx, car.y, 16)) {
        car.x = nx;
      } else if (!city.blocked(car.x, ny, 16)) {
        car.y = ny;
      } else {
        player.speed *= 0.3;
      }
    } else {
      car.x = nx;
      car.y = ny;
    }
    for (const other of ctx.traffic.cars) {
      if (other === car || other.parked) continue;
      if (carOverlapsPoint(other, car.x, car.y, 4)) {
        const push = 0.5;
        car.x -= Math.cos(car.angle) * player.speed * dt * push;
        car.y -= Math.sin(car.angle) * player.speed * dt * push;
        other.speed = Math.max(0, other.speed - 60);
        player.speed *= 0.55;
        player.damage += 6;
        if (Math.abs(player.speed) > 200) ctx.audio.crash();
        break;
      }
    }
    // A near miss: threading a traffic car at speed, close but untouched.
    // It feeds the run statistics (and the pause screen), never the cash.
    if (player.nearMissTimer > 0) player.nearMissTimer -= dt;
    else if (Math.abs(player.speed) > 300) {
      for (const other of ctx.traffic.cars) {
        if (other === car || other.parked) continue;
        const d = dist(car.x, car.y, other.x, other.y);
        if (d < NEAR_MISS_DIST && !carOverlapsPoint(other, car.x, car.y, 4)) {
          player.nearMissTimer = 2;
          if (ctx.onNearMiss) ctx.onNearMiss();
          break;
        }
      }
    }
    // Running down a pedestrian is a crime the whole street sees — but one
    // clipped jaywalker is half a star, not a full one: at full speed on a
    // getaway the car cannot avoid every ped, and a full star per hit meant
    // the heat climbed faster than it could ever decay, so a flee was
    // unwinnable by driving alone.
    for (const ped of ctx.traffic.peds) {
      if (carOverlapsPoint(car, ped.x, ped.y, 6)) {
        ped.panic = 2;
        ped.targetX = ped.x + (ped.x - car.x) * 3;
        ped.targetY = ped.y + (ped.y - car.y) * 3;
        if (Math.abs(player.speed) > 120) {
          ctx.police.addStars(0.5, 'hit pedestrian');
          ctx.audio.crash();
          player.speed *= 0.7;
        }
      }
    }
    // Police cars ram the player's car — but a ram is one hit, not a glue:
    // without a cooldown a cop touching the rear bumper cut the speed by 14%
    // every frame and the car could never pull away, so the bust timer fired
    // while Mara was already flooring it. With eight cruisers at five stars
    // the rams still pinned her: a longer cooldown and a softer hit.
    for (const cop of ctx.police.cops) {
      if (carOverlapsPoint(cop, car.x, car.y, 2) && cop.ramCooldown <= 0) {
        player.speed *= 0.92;
        cop.ramCooldown = 1.2;
        player.damage += 4;
        if (Math.abs(player.speed) > 200) ctx.audio.crash();
      }
    }
    player.x = car.x;
    player.y = car.y;
    player.angle = car.angle;
    ctx.audio.engine(speedRatio, true);
  }

  /**
   * One step. `ctx` carries city, traffic, police, combat, missions, audio.
   * `aimAngle` is the world-space angle the mouse points at (on foot only).
   * Returns 'dead' when health hits zero, else null.
   */
  function step(dt, input, ctx, aimAngle) {
    if (player.dead) return 'dead';
    if (player.inCar) stepDriving(dt, input, ctx);
    else stepOnFoot(dt, input, ctx, aimAngle);
    if (player.health <= 0) {
      player.dead = true;
      ctx.audio.fail();
      return 'dead';
    }
    return null;
  }

  function hurt(amount, ctx) {
    if (player.hurtTimer > 0) return;
    player.health = Math.max(0, player.health - amount);
    player.hurtTimer = 0.4;
    ctx.audio.hit();
  }

  function heal(amount) {
    player.health = Math.min(PLAYER.maxHealth, player.health + amount);
  }

  return { player, reset, step, tryEnterCar, enterCar, exitCar, nearestCar, hurt, heal };
}
