// Solmar Bay — tuning, palette, districts and story data for the open-world game.
// Every number that shapes how the city feels lives here, in one place.
//
// The city now has seven districts (North Point, the cliff-side lookout,
// joined the map), a day cycle that the sky and the traffic follow (rush hour
// at 08:00 and 17:30, quiet streets after midnight), and a weather table the
// renderer reads for its sunset wash. Car models, mission steps, rewards and
// the physics numbers that decide a chase are unchanged — a getaway that
// worked before still works.

export const VIEW = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const WORLD = {
  width: 4800,
  height: 3600,
  // West edge is the ocean; the beach runs along x = 0..320.
  beachX: 320,
  waterX: 120,
  roadWidth: 96,
  sidewalk: 26,
};

// Vertical and horizontal road centre-lines. Blocks sit between them.
export const ROADS_X = [560, 1160, 1760, 2360, 2960, 3560, 4160];
export const ROADS_Y = [420, 1020, 1620, 2220, 2820];

export const DISTRICTS = [
  { name: 'Marina Bay', x: 0, y: 0, w: 900, h: 900, tint: '#e8b04b' },
  { name: 'Old Town', x: 900, y: 0, w: 1500, h: 1200, tint: '#d97b4f' },
  { name: 'Downtown', x: 1800, y: 900, w: 1800, h: 1500, tint: '#5f7fa8' },
  { name: 'Palm Heights', x: 900, y: 1800, w: 1500, h: 1200, tint: '#7fae62' },
  { name: 'Harbor South', x: 1800, y: 2400, w: 3000, h: 1200, tint: '#8a7a9e' },
  { name: 'Sunset Strip', x: 3600, y: 0, w: 1200, h: 2400, tint: '#c96a8a' },
  { name: 'North Point', x: 3600, y: 2400, w: 1200, h: 1200, tint: '#4f8a7a' },
];

/** Time of day: the story opens in late afternoon and the clock runs in real time. */
export const DAY_CYCLE = {
  startHour: 17.4,
  duskHour: 18.5,   // the sunset wash is strongest here
  nightHour: 20.0,  // headlights and lamp glow take over after this
  rushHours: [8, 17.5],
};

/** Sky tints by hour, for the sunset wash the renderer paints over the world. */
export const SKY_TINTS = [
  { hour: 6, tint: 'rgba(255, 180, 120, 0.06)' },
  { hour: 12, tint: 'rgba(255, 255, 255, 0.00)' },
  { hour: 17.4, tint: 'rgba(255, 140, 66, 0.11)' },
  { hour: 18.5, tint: 'rgba(255, 90, 60, 0.16)' },
  { hour: 20, tint: 'rgba(20, 30, 70, 0.18)' },
  { hour: 24, tint: 'rgba(10, 14, 40, 0.22)' },
];

export const PALETTE = {
  grass: '#7fae62',
  grassDark: '#6d9c54',
  sand: '#ecd9a0',
  water: '#2f7fa8',
  waterDeep: '#256b92',
  road: '#3a3f46',
  roadEdge: '#2c3036',
  lane: '#d8c25a',
  sidewalk: '#9aa0a8',
  curb: '#7d838c',
  buildingRoof: ['#b0563f', '#c97b4f', '#8a6f5c', '#5f7fa8', '#7a8a99', '#a8546e'],
  buildingWall: ['#d8c9b0', '#c9b8a3', '#b8c4cc', '#e0d4c0', '#c4b49a'],
  park: '#5d8f4e',
  tree: '#3f7a34',
  palm: '#4d8a3d',
  player: '#ffd23f',
  police: '#2b4fd8',
  policeLight: '#ff3b30',
  enemy: '#c22e2e',
  hudPanel: 'rgba(12, 16, 24, 0.72)',
  hudText: '#f4f1e6',
  hudAccent: '#ffd23f',
  sunset: 'rgba(255, 140, 66, 0.10)',
  headlight: 'rgba(255, 248, 201, 0.20)',
  lampGlow: 'rgba(255, 220, 140, 0.25)',
  smoke: 'rgba(120, 120, 120, 0.5)',
};

// Car models the player can steal and drive. Each is an original design.
export const CAR_MODELS = [
  { name: 'Comet GT', color: '#e5484d', len: 52, wid: 26, accel: 420, top: 560, grip: 3.4, price: 900 },
  { name: 'Bay Cruiser', color: '#3f7fd8', len: 56, wid: 27, accel: 330, top: 470, grip: 3.0, price: 500 },
  { name: 'Dune Buggy', color: '#e8a13c', len: 48, wid: 28, accel: 380, top: 500, grip: 3.8, price: 650 },
  { name: 'Sol Taxi', color: '#ffd23f', len: 54, wid: 26, accel: 300, top: 430, grip: 2.9, price: 300 },
  { name: 'Harbor Van', color: '#8a8f98', len: 62, wid: 28, accel: 260, top: 380, grip: 2.6, price: 350 },
  { name: 'Vesper S', color: '#7a3fd8', len: 50, wid: 25, accel: 460, top: 610, grip: 3.6, price: 1400 },
  { name: 'Coast Pickup', color: '#3f9e6e', len: 58, wid: 28, accel: 340, top: 460, grip: 3.1, price: 550 },
  { name: 'Harbor Runner', color: '#d8d8d8', len: 54, wid: 27, accel: 400, top: 540, grip: 3.5, price: 1100 },
];

export const PED_COLORS = ['#e5484d', '#3f7fd8', '#e8a13c', '#7a3fd8', '#3f9e6e', '#f4f1e6', '#ff8fb0', '#5cc8d8'];

export const PLAYER = {
  walkSpeed: 210,
  runSpeed: 330,
  radius: 14,
  maxHealth: 100,
  enterRadius: 70,
  stealTime: 0.9,
};

export const WANTED = {
  max: 5,
  decayDelay: 4,      // seconds out of police sight before stars start falling
  decayRate: 0.5,     // stars per second once decaying
  chaseSpeed: 430,
  spawnInterval: 2.2,
  maxCops: [0, 2, 3, 4, 6, 8],
  sightRange: 520,
  interceptLead: 2.0, // seconds ahead an interceptor aims for
  roadblockMinStars: 4,
  roadblockHold: 12,  // seconds a roadblock cruiser holds its post
};

export const COMBAT = {
  bulletSpeed: 900,
  fireRate: 0.16,
  bulletDamage: 34,
  enemyHealth: 100,
  enemyFireRate: 1.2,
  enemyRange: 380,
  pickupRadius: 26,
  burstSize: 3,       // shots per gunman burst before the reload pause
  reloadMin: 0.9,
  reloadMax: 1.4,
  meleeDamage: 14,
  meleeRange: 46,
};

export const TRAFFIC = {
  carsSeeded: 26,
  parkedSeeded: 10,
  pedsSeeded: 46,
  nearCarsTarget: 14,
  nearPedsTarget: 20,
  nearParkedTarget: 2,
  rushPeak: 1.6,      // density multiplier at rush hour
};

/** How fast the in-game clock runs: 1 game hour per real hour of play. */
export const CLOCK_RATE = 1 / 3600;

export const SAVE_KEY = 'solmar-bay.save.v1';

// The story: Mara Quinn, a courier driver in Solmar Bay, takes jobs for the
// Tide crew and ends up owing the harbor boss one last run. All names original.
export const STORY = {
  hero: 'Mara Quinn',
  crew: 'the Tide',
  boss: 'Captain Anselmo Voss',
  rival: 'the Salt Dogs',
  fence: 'Lena Marlowe',
};

// Story beats the title screen and the pause screen can quote.
export const STORY_BEATS = [
  'Mara Quinn came to Solmar Bay to drive — and stayed to pay a debt.',
  'The Tide crew runs the harbor. Voss runs the Tide.',
  'The Salt Dogs want the pier. The pier is Voss\'s.',
  'Five jobs. One last run. Then the Tide is free.',
];

export const MISSIONS = [
  {
    id: 'm1',
    title: 'First Fare',
    giver: 'Lena Marlowe',
    brief: 'A package needs to reach the Marina before the tide turns. Grab a car and drive it there — fast, but clean.',
    reward: 400,
    steps: [
      { type: 'enterCar', text: 'Steal or borrow a car (walk up to one and press E)' },
      { type: 'goto', x: 560, y: 300, r: 90, text: 'Drive the package to the Marina drop-off' },
      { type: 'wait', t: 1.5, text: 'Hand over the package' },
    ],
  },
  {
    id: 'm2',
    title: 'Hot Wheels',
    giver: 'Lena Marlowe',
    brief: 'The Tide needs a Vesper S for tonight. Take one from the Sunset Strip and bring it to the garage — and don\'t bring the law with you.',
    reward: 800,
    steps: [
      { type: 'stealModel', model: 'Vesper S', text: 'Steal a Vesper S on the Sunset Strip' },
      { type: 'goto', x: 4160, y: 2820, r: 100, text: 'Deliver the Vesper S to the Tide garage' },
      { type: 'loseCops', text: 'Lose the heat before the handover counts' },
    ],
  },
  {
    id: 'm3',
    title: 'Dockside Deal',
    giver: 'Captain Anselmo Voss',
    brief: 'The Salt Dogs are muscling in on the harbor. Get out of the car at the pier and hold it on foot — send them back to their boats.',
    reward: 1200,
    steps: [
      { type: 'goto', x: 2960, y: 3100, r: 110, text: 'Reach the Harbor pier' },
      { type: 'defeat', count: 5, text: 'Drive off the Salt Dogs (5 left)' },
      { type: 'goto', x: 2360, y: 2820, r: 100, text: 'Meet Voss at the Harbor office' },
    ],
  },
  {
    id: 'm4',
    title: 'The Getaway',
    giver: 'Lena Marlowe',
    brief: 'The pickup went loud. Three stars and counting — get across town to the Palm Heights safehouse before they box you in.',
    reward: 1500,
    steps: [
      { type: 'enterCar', text: 'Get in a car — any car' },
      { type: 'wanted', level: 3, text: 'The heat is on. Run!' },
      { type: 'goto', x: 1160, y: 2500, r: 110, text: 'Reach the Palm Heights safehouse', keepWanted: true },
      { type: 'loseCops', text: 'Shake the pursuit' },
    ],
  },
  {
    id: 'm5',
    title: 'Bayfront Heist',
    giver: 'Captain Anselmo Voss',
    brief: 'One last run. The harbor vault car leaves at dusk — take it, and the Tide is square with Voss forever. Expect the whole bay to answer.',
    reward: 3000,
    steps: [
      { type: 'goto', x: 3560, y: 3000, r: 110, text: 'Reach the vault car at the Harbor depot' },
      { type: 'stealModel', model: 'Comet GT', text: 'Take the vault Comet GT' },
      { type: 'wanted', level: 4, text: 'Every cop in Solmar Bay is coming' },
      { type: 'goto', x: 560, y: 300, r: 100, text: 'Escape to the Marina hideout', keepWanted: true },
      { type: 'loseCops', text: 'Lose the heat — the Tide is free' },
    ],
  },
];

// Every place a mission step sends the player: the city generator keeps these
// clear of buildings, so a job can never ask Mara to drive into a wall.
export const MISSION_POINTS = MISSIONS.flatMap((m) =>
  m.steps.filter((s) => s.type === 'goto').map((s) => ({ x: s.x, y: s.y, r: s.r })),
);

export const ACTIVITY_SPOTS = [
  { type: 'cash', x: 1160, y: 420, label: 'Street cash' },
  { type: 'health', x: 2360, y: 1020, label: 'Med kit' },
  { type: 'cash', x: 3560, y: 1620, label: 'Street cash' },
  { type: 'health', x: 1760, y: 2220, label: 'Med kit' },
  { type: 'cash', x: 4160, y: 1020, label: 'Street cash' },
  { type: 'health', x: 700, y: 2000, label: 'Med kit' },
  { type: 'cash', x: 2960, y: 2820, label: 'Street cash' },
  { type: 'health', x: 4160, y: 2220, label: 'Med kit' },
  { type: 'cash', x: 1760, y: 420, label: 'Street cash' },
  { type: 'health', x: 2960, y: 1020, label: 'Med kit' },
  { type: 'cash', x: 700, y: 2820, label: 'Street cash' },
  { type: 'health', x: 3560, y: 420, label: 'Med kit' },
];
