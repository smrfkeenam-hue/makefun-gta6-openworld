// Traffic and pedestrians: the city alive. Traffic cars drive the road grid,
// turning at intersections and keeping a lane offset; pedestrians stroll the
// sidewalks, cross at corners, and scatter when a car or a gunshot comes close.
//
// Taxis (Sol Taxis stop at the kerb to pick up a waiting pedestrian, then pull
// away), rush-hour density that follows the in-game clock (busy at 08:00 and
// 17:30, quiet after midnight), intersection yielding (a car holds when cross
// traffic is close), and honking — a car stuck behind a slow one leans on the
// horn, which is a sound event the world can hear. Pedestrians now have kinds:
// strollers, joggers (faster), and dog walkers (slower, with a dog dot beside them).

import { CAR_MODELS, PED_COLORS, ROADS_X, ROADS_Y, WORLD } from './config.js';
import { clamp, dist, pick, range } from './random.js';

const ROAD_HALF = WORLD.roadWidth / 2;

export function createTraffic(random, city) {
  const cars = [];
  const peds = [];

  function randomRoadPoint() {
    if (random() < 0.5) return { x: pick(random, ROADS_X), y: range(random, 60, WORLD.height - 60), vertical: true };
    return { x: range(random, 380, WORLD.width - 60), y: pick(random, ROADS_Y), vertical: false };
  }

  function spawnCar(nearX, nearY) {
    const model = pick(random, CAR_MODELS);
    const spot = nearX !== undefined ? { x: nearX, y: nearY, vertical: random() < 0.5 } : randomRoadPoint();
    const vertical = spot.vertical;
    const dir = random() < 0.5 ? 1 : -1;
    const lane = (ROAD_HALF / 2) * (vertical ? 1 : -1);
    const angle = vertical ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : dir > 0 ? 0 : Math.PI;
    const car = {
      id: cars.length + 1,
      model,
      x: vertical ? spot.x + lane : spot.x,
      y: vertical ? spot.y : spot.y + lane,
      angle,
      speed: range(random, 120, 200),
      cruise: range(random, 140, 210),
      vertical,
      dir,
      color: model.color,
      driver: true, // a traffic car with a driver can be stolen
      parked: false,
      brake: 0,
      braking: false, // set while decelerating, for the brake lights
      wobble: random() * Math.PI * 2,
      taxi: model.name === 'Sol Taxi' && random() < 0.6,
      pickupTimer: 0, // a taxi waits at the kerb this long for its fare
      honkTimer: 0,   // cooldown between horn blasts
    };
    cars.push(car);
    return car;
  }

  function spawnParkedCar() {
    // A parking spot holds one car: never stack two cars on the same spot, or
    // Mara presses E next to a Vesper S and drives off in the Comet GT parked
    // underneath it. (Two stacked cars were found at one spot in testing.)
    const open = city.parkingSpots.filter(
      (s) => s.taken && !cars.some((c) => dist(c.x, c.y, s.x, s.y) < 60),
    );
    const spot = open.length ? pick(random, open) : null;
    const model = pick(random, CAR_MODELS);
    const car = {
      id: cars.length + 1,
      model,
      x: spot ? spot.x : range(random, 500, WORLD.width - 200),
      y: spot ? spot.y : pick(random, ROADS_Y),
      angle: spot ? spot.angle : 0,
      speed: 0,
      cruise: 0,
      vertical: false,
      dir: 1,
      color: model.color,
      driver: false,
      parked: true,
      brake: 0,
      wobble: 0,
      taxi: false,
      pickupTimer: 0,
      honkTimer: 0,
    };
    cars.push(car);
    return car;
  }

  function spawnPed(nearX, nearY) {
    const px = nearX !== undefined ? nearX + range(random, -120, 120) : range(random, 380, WORLD.width - 60);
    const py = nearY !== undefined ? nearY + range(random, -120, 120) : range(random, 60, WORLD.height - 60);
    // Kinds: most stroll, some jog, a few walk a dog (slower, with a dot).
    const kind = random() < 0.18 ? 'jogger' : random() < 0.12 ? 'dog' : 'stroller';
    const ped = {
      x: px,
      y: py,
      angle: random() * Math.PI * 2,
      speed: kind === 'jogger' ? range(random, 95, 130) : kind === 'dog' ? range(random, 25, 45) : range(random, 35, 70),
      color: pick(random, PED_COLORS),
      walkPhase: random() * Math.PI * 2,
      targetX: px,
      targetY: py,
      panic: 0,
      retarget: 0,
      kind,
    };
    peds.push(ped);
    return ped;
  }

  function spawnModel(modelName, x, y) {
    const model = CAR_MODELS.find((m) => m.name === modelName) || pick(random, CAR_MODELS);
    const spot = city.freeSpot(x, y);
    const car = {
      id: cars.length + 1,
      model,
      x: spot.x,
      y: spot.y,
      angle: random() * Math.PI * 2,
      speed: 0,
      cruise: 0,
      vertical: false,
      dir: 1,
      color: model.color,
      driver: false,
      parked: true,
      brake: 0,
      wobble: 0,
      taxi: false,
      pickupTimer: 0,
      honkTimer: 0,
    };
    cars.push(car);
    return car;
  }

  function seedWorld() {
    for (let i = 0; i < 26; i += 1) spawnCar();
    for (let i = 0; i < 10; i += 1) spawnParkedCar();
    for (let i = 0; i < 46; i += 1) spawnPed();
  }

  function carAhead(car, look) {
    const ax = Math.cos(car.angle);
    const ay = Math.sin(car.angle);
    for (const other of cars) {
      if (other === car || other.parked) continue;
      const dx = other.x - car.x;
      const dy = other.y - car.y;
      const along = dx * ax + dy * ay;
      const side = Math.abs(dx * ay - dy * ax);
      if (along > 0 && along < look && side < 34) return other;
    }
    return null;
  }

  /** True when cross traffic is close to the intersection ahead. */
  function crossTrafficNear(car) {
    const ax = Math.cos(car.angle);
    const ay = Math.sin(car.angle);
    for (const other of cars) {
      if (other === car || other.parked) continue;
      const dx = other.x - car.x;
      const dy = other.y - car.y;
      const along = dx * ax + dy * ay;
      const side = dx * ay - dy * ax;
      // Crossing from the side, about to enter the intersection.
      if (along > -40 && along < 130 && Math.abs(side) > 40 && Math.abs(side) < 170) return true;
    }
    return false;
  }

  function stepCar(car, dt, playerCar) {
    if (car.parked) return;
    // Mara's own car is hers to drive: the traffic brain never touches it.
    // Before this guard, stepCar steered the player's car toward its cruise
    // speed, turned it at intersections and wrapped it to the far edge —
    // a fast run to the Marina drop-off ended with the car teleported to the
    // south of the map and the save recording the wrong position.
    if (playerCar && car === playerCar) return;
    // A taxi at a pickup waits at the kerb, then pulls away with its fare.
    if (car.taxi && car.pickupTimer > 0) {
      car.pickupTimer -= dt;
      car.speed = Math.max(0, car.speed - 300 * dt);
      if (car.pickupTimer <= 0) car.cruise = range(random, 150, 210);
      return;
    }
    // Slow for the car ahead, and for the player's car when it blocks the lane.
    let target = car.cruise;
    const ahead = carAhead(car, 110);
    if (ahead) target = Math.min(target, Math.max(0, ahead.speed - 20));
    if (playerCar) {
      const d = dist(car.x, car.y, playerCar.x, playerCar.y);
      if (d < 90) target = 0;
    }
    if (car.brake > 0) {
      car.brake -= dt;
      target = 0;
    }
    // Yield at an intersection when cross traffic is close.
    const nearX = ROADS_X.find((rx) => Math.abs(car.x - rx) < 26);
    const nearY = ROADS_Y.find((ry) => Math.abs(car.y - ry) < 26);
    if ((nearX !== undefined || nearY !== undefined) && crossTrafficNear(car)) target = 0;
    // Honk when stuck behind a slow car: a horn blast every few seconds.
    if (ahead && car.speed < 30 && car.honkTimer <= 0) {
      car.honkTimer = range(random, 4, 7);
      car.honked = true;
    }
    if (car.honkTimer > 0) car.honkTimer -= dt;
    car.braking = target < car.speed - 30;
    car.speed += clamp(target - car.speed, -260 * dt, 140 * dt);
    // At an intersection, sometimes turn onto the crossing road.
    if (car.vertical && nearY !== undefined && random() < 0.012) {
      car.vertical = false;
      car.dir = random() < 0.5 ? 1 : -1;
      car.angle = car.dir > 0 ? 0 : Math.PI;
      car.y = nearY + (car.dir > 0 ? ROAD_HALF / 2 : -ROAD_HALF / 2);
    } else if (!car.vertical && nearX !== undefined && random() < 0.012) {
      car.vertical = true;
      car.dir = random() < 0.5 ? 1 : -1;
      car.angle = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      car.x = nearX + (car.dir > 0 ? -ROAD_HALF / 2 : ROAD_HALF / 2);
    }
    // A taxi sometimes pulls to the kerb for a fare: park at the sidewalk
    // edge for a few seconds, then rejoin the flow.
    if (car.taxi && car.pickupTimer <= 0 && random() < 0.0006) {
      car.pickupTimer = range(random, 3, 6);
    }
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    // Wrap around the city edges so traffic never runs out.
    if (car.x < 340) { car.x = WORLD.width - 80; }
    if (car.x > WORLD.width - 40) { car.x = 380; }
    if (car.y < 40) { car.y = WORLD.height - 80; }
    if (car.y > WORLD.height - 40) { car.y = 80; }
    car.wobble += dt * 2;
  }

  function stepPed(ped, dt, dangerX, dangerY, dangerR) {
    ped.retarget -= dt;
    const dDanger = dangerX !== undefined ? dist(ped.x, ped.y, dangerX, dangerY) : Infinity;
    if (dDanger < dangerR) {
      ped.panic = 1.2;
      ped.targetX = ped.x + (ped.x - dangerX) * 2;
      ped.targetY = ped.y + (ped.y - dangerY) * 2;
    }
    if (ped.panic > 0) ped.panic -= dt;
    if (ped.retarget <= 0 || dist(ped.x, ped.y, ped.targetX, ped.targetY) < 24) {
      // Wander along sidewalks: pick a nearby road and a point on it.
      if (random() < 0.6) {
        const rx = pick(random, ROADS_X);
        ped.targetX = rx + (random() < 0.5 ? -1 : 1) * (ROAD_HALF + 14);
        ped.targetY = clamp(ped.y + range(random, -260, 260), 60, WORLD.height - 60);
      } else {
        const ry = pick(random, ROADS_Y);
        ped.targetX = clamp(ped.x + range(random, -260, 260), 400, WORLD.width - 60);
        ped.targetY = ry + (random() < 0.5 ? -1 : 1) * (ROAD_HALF + 14);
      }
      ped.retarget = range(random, 4, 10);
    }
    const dx = ped.targetX - ped.x;
    const dy = ped.targetY - ped.y;
    const d = Math.hypot(dx, dy);
    if (d > 4) {
      const speed = ped.speed * (ped.panic > 0 ? 2.6 : 1);
      ped.angle = Math.atan2(dy, dx);
      ped.x += (dx / d) * speed * dt;
      ped.y += (dy / d) * speed * dt;
      ped.walkPhase += dt * speed * 0.06;
    }
    ped.x = clamp(ped.x, WORLD.waterX + 10, WORLD.width - 20);
    ped.y = clamp(ped.y, 20, WORLD.height - 20);
  }

  /** Rush-hour factor from the in-game clock: 1.0 off-peak, up to 1.6 at 08:00/17:30. */
  function rushFactor(timeOfDay) {
    const peaks = [8, 17.5];
    let f = 1;
    for (const peak of peaks) {
      const d = Math.min(Math.abs(timeOfDay - peak), 24 - Math.abs(timeOfDay - peak));
      f = Math.max(f, 1 + 0.6 * Math.max(0, 1 - d / 2.5));
    }
    return f;
  }

  /** Keep the streets busy around (x, y): spawn replacements when the player moves on. */
  function maintain(x, y, timeOfDay) {
    const rush = rushFactor(timeOfDay === undefined ? 17.4 : timeOfDay);
    let near = 0;
    for (const car of cars) if (!car.parked && dist(car.x, car.y, x, y) < 900) near += 1;
    if (near < Math.round(14 * rush) && random() < 0.3) {
      // Never pop a car in right on top of the player: push the spawn point
      // out to at least 350 px so it arrives instead of appearing.
      const angle = random() * Math.PI * 2;
      const sx = x + Math.cos(angle) * 850;
      const sy = y + Math.sin(angle) * 850;
      if (dist(sx, sy, x, y) > 350) spawnCar(sx, sy);
    }
    let nearPeds = 0;
    for (const ped of peds) if (dist(ped.x, ped.y, x, y) < 700) nearPeds += 1;
    if (nearPeds < Math.round(20 * rush) && random() < 0.3) spawnPed(x + range(random, -600, 600), y + range(random, -600, 600));
    // Keep a stealable parked car in reach: the player should never have to
    // walk a mile for a ride after ditching one.
    let nearParked = 0;
    for (const car of cars) if (car.parked && dist(car.x, car.y, x, y) < 700) nearParked += 1;
    if (nearParked < 2 && random() < 0.2) {
      const spot = city.freeSpot(x + range(random, -500, 500), y + range(random, -500, 500));
      const model = pick(random, CAR_MODELS);
      cars.push({
        id: cars.length + 1,
        model,
        x: spot.x,
        y: spot.y,
        angle: random() * Math.PI * 2,
        speed: 0,
        cruise: 0,
        vertical: false,
        dir: 1,
        color: model.color,
        driver: false,
        parked: true,
        brake: 0,
        braking: false,
        wobble: 0,
        taxi: false,
        pickupTimer: 0,
        honkTimer: 0,
      });
    }
    // Prune far-away traffic so the arrays stay small.
    for (let i = cars.length - 1; i >= 0; i -= 1) {
      if (!cars[i].parked && dist(cars[i].x, cars[i].y, x, y) > 1600) cars.splice(i, 1);
    }
    for (let i = peds.length - 1; i >= 0; i -= 1) {
      if (dist(peds[i].x, peds[i].y, x, y) > 1400) peds.splice(i, 1);
    }
  }

  seedWorld();
  return { cars, peds, spawnCar, spawnParkedCar, spawnModel, spawnPed, stepCar, stepPed, maintain, rushFactor };
}

// A traffic car's bounding circle, for collision checks.
export function carRadius(car) {
  return car.model.len / 2;
}

export function carOverlapsPoint(car, x, y, pad) {
  const dx = x - car.x;
  const dy = y - car.y;
  const ca = Math.cos(-car.angle);
  const sa = Math.sin(-car.angle);
  const lx = dx * ca - dy * sa;
  const ly = dx * sa + dy * ca;
  return Math.abs(lx) < car.model.len / 2 + (pad || 0) && Math.abs(ly) < car.model.wid / 2 + (pad || 0);
}
