// SOLMAR — Bay City Heat. Shared tuning for the whole game: the city grid, the
// palette, the cars, the police and the money. One place to change how it feels.
export const CITY = {
  pitch: 58, // distance between road centrelines
  roadHalf: 7, // half the road width
  blocks: 7, // blocks across (roads run -3..3)
  blockHalf: 22, // half a block (buildings live inside this)
  beachZ: -212, // south edge: sand starts here
  seaZ: -238, // water starts here
  extent: 210, // playable half-extent in x and z
};

export const PALETTE = {
  skyTop: 0x2e4a7a,
  skyHorizon: 0xff9a52,
  sun: 0xffc46b,
  fog: 0xf2a56b,
  asphalt: 0x2f3338,
  asphaltLine: 0xd8d3c3,
  sidewalk: 0x8f8a80,
  sand: 0xe8cf9a,
  sea: 0x1e6f8e,
  grass: 0x5d8a4a,
  building: [0xe8b48c, 0xd98f7a, 0xf0d9a8, 0x9fc3d8, 0xc9a3c9, 0xf5f0e6, 0x8fb8a8, 0xe07856],
  glass: 0x2a4a66,
  palmTrunk: 0x7a5a3a,
  palmLeaf: 0x3f8a4a,
  car: [0xd84040, 0x3a6fd8, 0xf2c230, 0x38b24a, 0xe8e4da, 0x22242a, 0x8a4fd0, 0xe07830],
  police: 0x1c2a44,
  taxi: 0xf2c230,
};

export const PLAYER = {
  walkSpeed: 6,
  runSpeed: 10,
  radius: 0.6,
  health: 100,
  jumpSpeed: 7,
};

export const CAR = {
  accel: 22,
  brake: 34,
  reverseAccel: 12,
  maxSpeed: 38,
  maxReverse: 10,
  steer: 0.55,
  grip: 6,
  health: 100,
};

export const TRAFFIC = { count: 14, speedMin: 7, speedMax: 13, spawnGap: 26 };
export const PEDS = { count: 22, speedMin: 1.2, speedMax: 2.2 };

export const WANTED = {
  decayDelay: 14, // seconds unseen before a star drops
  maxStars: 5,
  policeCars: [1, 2, 2, 3, 4, 5], // by stars (index = stars)
  footCops: [0, 0, 2, 3, 4, 6],
  bustSeconds: 2.0,
  ramDamage: 6,
};

export const COMBAT = {
  pistolDamage: 34,
  pistolRange: 60,
  pistolFireMs: 240,
  pistolMag: 12,
  reloadMs: 1100,
  punchDamage: 25,
  punchRange: 2.2,
  punchMs: 450,
  enemyHealth: 100,
  copHealth: 100,
};

export const ECONOMY = {
  startCash: 250,
  stealHeat: 1,
  shootHeat: 1,
  killHeat: 1,
  bustFine: 300,
  missionReward: [500, 800, 1200, 1500, 5000],
};

export const CHASE_CAM = {
  onFootDist: 9.5, // camera distance behind the player on foot
  carDist: 13, // camera distance behind the car
  aimDistance: 14, // how far ahead the camera looks (the crosshair's aim point)
  smooth: 7, // how fast the camera catches up
};

export const SAVE_KEY = 'solmar-bay-city-heat-save-v1';

// Street names the HUD and missions use (all invented for Solmar City).
export const STREETS = [
  'Palma Ave', 'Coral Blvd', 'Marina Row', 'Sol St', 'Dune Dr',
  'Harbor Ln', 'Flamingo Way', 'Sunset Strip',
];
