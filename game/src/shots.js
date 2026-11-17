// The screenshot scenes behind ?shot=cover|chase|city|mission. Each one arranges
// the real game — real cars, real cops, real missions — at a moment that shows
// several systems at once, then lets the simulation run a couple of seconds so
// traffic, pedestrians and pursuit settle into natural poses. The same seed
// always gives the same frame.
//
// The scenes are busier than the first pass: the cover adds a third cruiser
// and a near-miss taxi threading past, the chase adds a brawler closing in
// and a second burst of gunfire, the city view adds taxis at the kerb, and
// the mission scene adds a second getaway car and a dog walker on the Strip.

import { CAR_MODELS } from './config.js';

function scriptedInput(throttle, steer) {
  return {
    move: () => ({ x: 0, y: 0 }),
    throttle: () => throttle,
    steer: () => steer,
    sprint: () => false,
    handbrake: () => false,
    mouse: () => ({ x: 900, y: 300, down: false }),
    takeClick: () => false,
    takeActions: () => 0,
  };
}

function findModel(name) {
  return CAR_MODELS.find((m) => m.name === name);
}

function placeCar(G, modelName, x, y, angle, speed, parked) {
  const car = {
    id: G.traffic.cars.length + 100,
    model: findModel(modelName),
    x, y, angle,
    speed: speed || 0,
    cruise: 185,
    vertical: false,
    dir: 1,
    color: findModel(modelName).color,
    driver: !parked,
    parked: !!parked,
    brake: 0,
    wobble: 0,
    taxi: false,
    pickupTimer: 0,
    honkTimer: 0,
  };
  G.traffic.cars.push(car);
  return car;
}

function placeCop(G, x, y, angle) {
  const cop = {
    model: { name: 'Interceptor', color: '#2b4fd8', len: 54, wid: 26, accel: 460, top: 590, grip: 3.6, price: 0 },
    x, y, angle,
    speed: 320,
    siren: 1,
    ramCooldown: 0,
    role: 'chase',
    blockTimer: 0,
  };
  G.police.cops.push(cop);
  return cop;
}

function settle(G, seconds, input) {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i += 1) G.tick(1 / 60, input || scriptedInput(0, 0));
}

/**
 * Arrange the named scene on the game G (built by main.js) and return the
 * zoom for it. Any other name is the cover.
 */
export function stageShot(name, G) {
  const P = G.player;
  const S = G.state;
  S.screen = 'play';
  if (name === 'chase') {
    // On foot at the Harbor pier, Salt Dogs closing in, two stars on Mara.
    G.missions.jumpTo(2, 1);
    P.x = 2960;
    P.y = 3100;
    P.angle = 0.6;
    P.health = 85;
    P.cash = 1850;
    G.police.setStars(2);
    G.combat.spawnEnemies(2960, 3100, 5);
    placeCar(G, 'Bay Cruiser', 2960, 3180, 0.2, 0, true);
    placeCar(G, 'Harbor Van', 3120, 3040, -0.4, 0, true);
    for (let i = 0; i < 6; i += 1) G.traffic.spawnPed(2960 + (i - 3) * 90, 3100 + ((i % 2) * 160 - 80));
    G.missions.say('The Salt Dogs are on the pier — hold it, Mara.', 6);
    settle(G, 1.2, scriptedInput(0, 0));
    // Fresh gunfire in the frame: a rival's tracer past Mara, and her return shot.
    const shooter = G.combat.enemies.find((e) => e.alive);
    if (shooter) {
      G.combat.fireBullet(shooter.x, shooter.y, Math.atan2(P.y - shooter.y, P.x - shooter.x), false);
      G.combat.muzzle(shooter.x, shooter.y, Math.atan2(P.y - shooter.y, P.x - shooter.x));
      G.combat.fireBullet(P.x, P.y, Math.atan2(shooter.y - P.y, shooter.x - P.x), true);
      G.combat.muzzle(P.x, P.y, Math.atan2(shooter.y - P.y, shooter.x - P.x));
    }
    // A second rival opens up from the containers, so the frame has two tracers.
    const second = G.combat.enemies.filter((e) => e.alive)[1];
    if (second) {
      G.combat.fireBullet(second.x, second.y, Math.atan2(P.y - second.y, P.x - second.x), false);
      G.combat.muzzle(second.x, second.y, Math.atan2(P.y - second.y, P.x - second.x));
    }
    S.shotZoom = 1;
    return 1;
  }
  if (name === 'city') {
    // High view over Downtown at sunset: the whole city, traffic and all,
    // with one star and a cop closing in so the wide shot still shows heat.
    G.missions.jumpTo(0, 1);
    const car = placeCar(G, 'Bay Cruiser', 2360, 1620, 0, 320);
    P.inCar = car;
    P.x = car.x;
    P.y = car.y;
    P.angle = 0;
    P.speed = 320;
    P.cash = 650;
    G.police.setStars(1);
    placeCop(G, 2360, 1380, Math.PI / 2);
    for (let i = 0; i < 10; i += 1) G.traffic.spawnCar();
    for (let i = 0; i < 12; i += 1) G.traffic.spawnPed(2360 + ((i % 4) - 2) * 220, 1620 + (Math.floor(i / 4) - 1) * 220);
    // Two taxis wait at the kerb on Downtown Ave, fares and all.
    const taxi1 = placeCar(G, 'Sol Taxi', 2360, 1020, 0, 0, false);
    taxi1.taxi = true;
    taxi1.pickupTimer = 4;
    const taxi2 = placeCar(G, 'Sol Taxi', 1760, 1620, Math.PI / 2, 0, false);
    taxi2.taxi = true;
    taxi2.pickupTimer = 5;
    G.missions.say('First Fare — drive the package to the Marina.', 6);
    settle(G, 1.0, scriptedInput(1, 0));
    S.shotZoom = 0.42;
    return 0.42;
  }
  if (name === 'mission') {
    // The Hot Wheels job: Mara on foot beside the Vesper S, Strip lights behind.
    // The car sits on the Strip road itself, not on the grass — a parked car
    // belongs on a street.
    G.missions.jumpTo(1, 0);
    P.x = 4100;
    P.y = 640;
    P.angle = -0.5;
    P.cash = 1250;
    placeCar(G, 'Vesper S', 4160, 600, -0.3, 0, true);
    placeCar(G, 'Comet GT', 4160, 700, 0.4, 0, true);
    placeCar(G, 'Sol Taxi', 4160, 520, 0.1, 0, true);
    placeCar(G, 'Harbor Runner', 4160, 800, -0.2, 0, true);
    for (let i = 0; i < 8; i += 1) G.traffic.spawnPed(4100 + (i - 4) * 80, 640 + ((i % 2) * 140 - 70));
    S.prompt = 'Press E — steal the Vesper S';
    G.missions.say('Hot Wheels — the Tide needs that Vesper S tonight.', 6);
    settle(G, 1.0, scriptedInput(0, 0));
    S.shotZoom = 1;
    return 1;
  }
  // Cover: a three-star chase down the Downtown boulevard at sunset. The
  // pursuit cars start right on Mara's bumper, so the frame reads as a chase
  // in progress, not two cars parked a block away.
  G.missions.jumpTo(3, 2);
  const car = placeCar(G, 'Comet GT', 2100, 1620, 0, 380);
  P.inCar = car;
  P.x = car.x;
  P.y = car.y;
  P.angle = 0;
  P.speed = 380;
  P.cash = 2400;
  P.health = 88;
  G.police.setStars(3);
  placeCop(G, 1940, 1600, 0);
  placeCop(G, 1970, 1670, 0.1);
  placeCop(G, 1900, 1550, -0.1);
  placeCar(G, 'Sol Taxi', 2260, 1560, 0, 0, true);
  placeCar(G, 'Harbor Van', 2440, 1680, 0, 0, true);
  placeCar(G, 'Dune Buggy', 1800, 1560, 0, 0, true);
  // A taxi threads past Mara's bumper — the near-miss that sells the speed.
  const taxi = placeCar(G, 'Sol Taxi', 2150, 1500, 0, 320, false);
  taxi.taxi = true;
  for (let i = 0; i < 8; i += 1) G.traffic.spawnPed(2100 + (i - 4) * 130, 1620 + ((i % 2) * 190 - 95));
  G.missions.say('The Getaway — lose the heat, reach Palm Heights.', 6);
  settle(G, 1.6, scriptedInput(1, 0));
  S.shotZoom = 1;
  return 1;
}
