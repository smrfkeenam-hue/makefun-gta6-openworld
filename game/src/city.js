// Solmar Bay itself: a seeded city of road grids, blocks, buildings, parks, palms,
// a beach and a harbor, plus the road queries the traffic, police and missions
// use to stay on the streets. Generation runs once at boot from the seed.
//
// Landmarks give the city its named places: the lighthouse on the Marina
// point, the Tide garage, Voss's harbor office, the Marina market. Streets
// have names too, so the HUD can say where Mara is instead of only which
// district. Benches, lamps, fountains and billboards fill the blocks out.

import { DISTRICTS, MISSION_POINTS, PALETTE, ROADS_X, ROADS_Y, WORLD } from './config.js';
import { chance, int, pick, range } from './random.js';

const ROAD_HALF = WORLD.roadWidth / 2;
const SIDE = WORLD.sidewalk;

// Street names for the HUD: one per road, in the order of ROADS_X / ROADS_Y.
export const STREET_NAMES_X = [
  'Marina Blvd', 'Palm Row', 'Canal St', 'Downtown Ave', 'Harbor Rd', 'Strip Way', 'Sunset Dr',
];
export const STREET_NAMES_Y = [
  'Bayfront St', 'Market St', 'Garage Ln', 'Pier Rd', 'South Quay',
];

/** True when the point is on a road surface (not sidewalk). */
export function onRoad(x, y) {
  for (const rx of ROADS_X) if (Math.abs(x - rx) < ROAD_HALF) return true;
  for (const ry of ROADS_Y) if (Math.abs(y - ry) < ROAD_HALF) return true;
  return false;
}

/** True when the point is on a sidewalk ring around a road. */
export function onSidewalk(x, y) {
  for (const rx of ROADS_X) {
    if (Math.abs(x - rx) < ROAD_HALF + SIDE && Math.abs(x - rx) >= ROAD_HALF) return true;
  }
  for (const ry of ROADS_Y) {
    if (Math.abs(y - ry) < ROAD_HALF + SIDE && Math.abs(y - ry) >= ROAD_HALF) return true;
  }
  return false;
}

/** True when the point is inside the ocean. */
export function inWater(x) {
  return x < WORLD.waterX;
}

/** True when the point is on sand. */
export function onBeach(x) {
  return x >= WORLD.waterX && x < WORLD.beachX;
}

/** Nearest road centre-line point to (x, y), for snapping spawns onto streets. */
export function nearestRoadPoint(x, y) {
  let bestX = ROADS_X[0];
  let bestD = Infinity;
  for (const rx of ROADS_X) {
    if (Math.abs(x - rx) < bestD) {
      bestD = Math.abs(x - rx);
      bestX = rx;
    }
  }
  let bestY = ROADS_Y[0];
  bestD = Infinity;
  for (const ry of ROADS_Y) {
    if (Math.abs(y - ry) < bestD) {
      bestD = Math.abs(y - ry);
      bestY = ry;
    }
  }
  // Snap to whichever axis is closer.
  if (Math.abs(x - bestX) < Math.abs(y - bestY)) return { x: bestX, y, vertical: true };
  return { x, y: bestY, vertical: false };
}

/** Which district a point is in, for the HUD's location line. */
export function districtAt(x, y) {
  for (const d of DISTRICTS) {
    if (x >= d.x && x < d.x + d.w && y >= d.y && y < d.y + d.h) return d.name;
  }
  return 'Solmar Bay';
}

/** The street a point is on (nearest road), for the HUD's location line. */
export function streetAt(x, y) {
  let bestX = 0;
  let bestD = Infinity;
  for (let i = 0; i < ROADS_X.length; i += 1) {
    if (Math.abs(x - ROADS_X[i]) < bestD) {
      bestD = Math.abs(x - ROADS_X[i]);
      bestX = i;
    }
  }
  let bestY = 0;
  bestD = Infinity;
  for (let i = 0; i < ROADS_Y.length; i += 1) {
    if (Math.abs(y - ROADS_Y[i]) < bestD) {
      bestD = Math.abs(y - ROADS_Y[i]);
      bestY = i;
    }
  }
  if (Math.abs(x - ROADS_X[bestX]) < Math.abs(y - ROADS_Y[bestY])) return STREET_NAMES_X[bestX];
  return STREET_NAMES_Y[bestY];
}

export function createCity(random) {
  const buildings = [];
  const parks = [];
  const palms = [];
  const props = []; // benches, crates, containers, lamps
  const parkingSpots = [];
  const landmarks = [];

  // Blocks are the rectangles between neighbouring road centre-lines.
  const xs = [WORLD.beachX + 40, ...ROADS_X, WORLD.width - 40];
  const ys = [40, ...ROADS_Y, WORLD.height - 40];

  for (let bi = 0; bi < xs.length - 1; bi += 1) {
    for (let bj = 0; bj < ys.length - 1; bj += 1) {
      const x0 = xs[bi] + ROAD_HALF + SIDE + 16;
      const x1 = xs[bi + 1] - ROAD_HALF - SIDE - 14;
      const y0 = ys[bj] + ROAD_HALF + SIDE + 14;
      const y1 = ys[bj + 1] - ROAD_HALF - SIDE - 14;
      const w = x1 - x0;
      const h = y1 - y0;
      if (w < 90 || h < 90) continue;
      const roll = random();
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      if (roll < 0.16) {
        // A park: grass, trees, a pond, benches.
        parks.push({ x: x0, y: y0, w, h });
        const trees = int(random, 4, 9);
        for (let t = 0; t < trees; t += 1) {
          props.push({ kind: 'tree', x: range(random, x0 + 20, x1 - 20), y: range(random, y0 + 20, y1 - 20), r: range(random, 10, 16) });
        }
        props.push({ kind: 'pond', x: cx, y: cy, r: Math.min(w, h) * 0.22 });
        // Benches and a fountain around the pond.
        props.push({ kind: 'fountain', x: cx, y: cy, r: Math.min(w, h) * 0.1 });
        for (let b = 0; b < 3; b += 1) {
          props.push({ kind: 'bench', x: cx + range(random, -70, 70), y: cy + range(random, -50, 50), r: 8 });
        }
        continue;
      }
      if (roll < 0.26) {
        // A parking lot with parked cars.
        const spots = int(random, 4, 8);
        for (let s = 0; s < spots; s += 1) {
          parkingSpots.push({
            x: x0 + 40 + (s % 4) * 70,
            y: y0 + 40 + Math.floor(s / 4) * 60,
            angle: random() < 0.5 ? 0 : Math.PI / 2,
            taken: random() < 0.6,
          });
        }
        props.push({ kind: 'lot', x: x0, y: y0, w, h });
        continue;
      }
      // Buildings: 1–4 per block, taller near Downtown — never on a mission
      // point, so a job can never ask Mara to drive into a wall.
      const downtown = cx > 1800 && cx < 3600 && cy > 900 && cy < 2400;
      const count = downtown ? int(random, 2, 4) : int(random, 1, 3);
      const cols = Math.ceil(Math.sqrt(count));
      const cellW = w / cols;
      const cellH = h / Math.ceil(count / cols);
      for (let b = 0; b < count; b += 1) {
        const col = b % cols;
        const row = Math.floor(b / cols);
        const bw = cellW * range(random, 0.55, 0.8);
        const bh = cellH * range(random, 0.55, 0.8);
        const bx = x0 + col * cellW + (cellW - bw) / 2;
        const by = y0 + row * cellH + (cellH - bh) / 2;
        const onMissionPoint = MISSION_POINTS.some(
          (p) => bx - 60 < p.x + p.r && bx + bw + 60 > p.x - p.r && by - 60 < p.y + p.r && by + bh + 60 > p.y - p.r,
        );
        if (onMissionPoint) continue;
        const tall = downtown && chance(random, 0.5);
        buildings.push({
          x: bx,
          y: by,
          w: bw,
          h: bh,
          height: tall ? int(random, 26, 44) : int(random, 8, 20),
          roof: pick(random, PALETTE.buildingRoof),
          wall: pick(random, PALETTE.buildingWall),
          windows: random() < 0.8,
        });
      }
    }
  }

  // Landmarks: the named places the story happens in. They sit on open
  // ground the generator keeps clear, so they never block a mission point.
  landmarks.push(
    { name: 'Marina Lighthouse', x: 240, y: 300, r: 26, kind: 'lighthouse' },
    { name: 'Tide Garage', x: 4160, y: 2820, r: 60, kind: 'garage' },
    { name: 'Harbor Office', x: 2360, y: 2820, r: 48, kind: 'office' },
    { name: 'Marina Market', x: 700, y: 420, r: 54, kind: 'market' },
    { name: 'Palm Heights Safehouse', x: 1160, y: 2500, r: 48, kind: 'safehouse' },
  );
  for (const lm of landmarks) {
    props.push({ kind: 'landmark', x: lm.x, y: lm.y, r: lm.r, name: lm.name });
  }

  // Palm-lined boulevard along the beach, and palms scattered on sidewalks.
  for (let y = 120; y < WORLD.height - 100; y += 170) {
    palms.push({ x: 330 + range(random, -8, 8), y, r: 12 });
    palms.push({ x: 470 + range(random, -8, 8), y: y + 80, r: 11 });
  }
  for (let i = 0; i < 90; i += 1) {
    const rx = pick(random, ROADS_X);
    const ry = pick(random, ROADS_Y);
    if (random() < 0.5) palms.push({ x: rx + (random() < 0.5 ? -1 : 1) * (ROAD_HALF + SIDE / 2), y: range(random, 80, WORLD.height - 80), r: 10 });
    else palms.push({ x: range(random, 400, WORLD.width - 80), y: ry + (random() < 0.5 ? -1 : 1) * (ROAD_HALF + SIDE / 2), r: 10 });
  }

  // Street lamps along the main roads: they glow at dusk in the renderer.
  for (const rx of ROADS_X) {
    for (let y = 200; y < WORLD.height - 100; y += 420) {
      props.push({ kind: 'lamp', x: rx + ROAD_HALF + 8, y, r: 5 });
    }
  }
  // Billboards on the Sunset Strip.
  for (let i = 0; i < 4; i += 1) {
    props.push({ kind: 'billboard', x: 4160 + range(random, -30, 30), y: 300 + i * 480, w: 90, h: 30 });
  }

  // A wooden pier jutting into the harbor at the Dockside Deal spot, with
  // mooring posts — the pier the Salt Dogs fight over.
  for (let i = 0; i < 5; i += 1) {
    props.push({ kind: 'pier', x: 2960 - 30 - i * 46, y: 3100, w: 40, h: 120 });
  }
  for (let i = 0; i < 3; i += 1) {
    props.push({ kind: 'post', x: 2960 - 60 - i * 90, y: 3040, r: 7 });
    props.push({ kind: 'post', x: 2960 - 60 - i * 90, y: 3160, r: 7 });
  }

  // Harbor containers and crates near the south docks.
  for (let i = 0; i < 26; i += 1) {
    props.push({ kind: 'container', x: range(random, 2600, 4400), y: range(random, 3050, 3450), w: 64, h: 26, color: pick(random, ['#b0563f', '#3f7fd8', '#e8a13c', '#3f9e6e']) });
  }
  for (let i = 0; i < 30; i += 1) {
    props.push({ kind: 'crate', x: range(random, 400, WORLD.width - 100), y: range(random, 100, WORLD.height - 100), r: range(random, 8, 14) });
  }

  // Collision circles for palms/trees (small) and rectangles for buildings.
  function blocked(x, y, radius) {
    if (x < WORLD.waterX + radius || x > WORLD.width - radius || y < radius || y > WORLD.height - radius) return true;
    for (const b of buildings) {
      if (x + radius > b.x && x - radius < b.x + b.w && y + radius > b.y && y - radius < b.y + b.h) return true;
    }
    return false;
  }

  /** A walkable spawn point near (x, y): nudged out of buildings and water. */
  function freeSpot(x, y) {
    for (let tries = 0; tries < 40; tries += 1) {
      const px = x + range(random, -160, 160);
      const py = y + range(random, -160, 160);
      if (!blocked(px, py, 20) && !inWater(px)) return { x: px, y: py };
    }
    return { x, y };
  }

  /**
   * A free spot in a ring around a point: far enough to see coming, close
   * enough to matter. Rival crews spawn in this ring, not on top of Mara —
   * five gunmen appearing within arm's reach and shooting straight was a
   * death sentence, not a fight.
   */
  function freeSpotRing(x, y, minR, maxR) {
    for (let tries = 0; tries < 40; tries += 1) {
      const a = random() * Math.PI * 2;
      const r = range(random, minR, maxR);
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r;
      if (!blocked(px, py, 20) && !inWater(px)) return { x: px, y: py };
    }
    return freeSpot(x, y);
  }

  /** The landmark at (x, y), if the point is inside one. */
  function landmarkAt(x, y) {
    for (const lm of landmarks) {
      if (Math.hypot(x - lm.x, y - lm.y) < lm.r) return lm.name;
    }
    return null;
  }

  return { buildings, parks, palms, props, parkingSpots, landmarks, blocked, freeSpot, freeSpotRing, landmarkAt };
}
