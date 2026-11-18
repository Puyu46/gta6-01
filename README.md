# SOLMAR — Bay City Heat

[![gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/competition/gta6-01)
[![rank](https://make.fun/badge/gta6-01/Puyu46/gta6-01/rank.svg)](https://make.fun/competition/gta6-01)
[![reward](https://make.fun/badge/gta6-01/Puyu46/gta6-01/reward.svg)](https://make.fun/competition/gta6-01)

An original open-world crime game for the [gta6-01 competition](https://make.fun/competition/gta6-01) — a sun-soaked coastal city you explore on foot and by car, built from static files with three.js. No Rockstar names, maps, characters or assets anywhere: Solmar City, its streets, its crew and its story are all invented here.

## Play

Serve `game/` with any static server and open it in desktop Chrome:

```sh
node serve.ts   # http://localhost:8080
```

Keyboard + mouse, no network, no build step. Your progress saves in the browser.

| Key | Action |
| --- | --- |
| W A S D | Move / drive |
| Shift | Run |
| Mouse | Look · Click — fire pistol |
| F | Punch · R — reload |
| E | Steal a car / get out / start the next job |
| Space | Jump / handbrake drift |
| P | Pause |

## The city

**Solmar City** — seven by seven blocks on a road grid, a beach and the sea along the south edge, palms, streetlights, a plaza with a fountain, the marina, the docks and the Solmar Bank tower, all under a golden-hour sun.

- **Explore on foot and by car** — walk the sidewalks, steal any traffic car or taxi (press E) and drive it with arcade handling, handbrake drifts and skid marks.
- **Traffic and pedestrians** — cars follow the road grid and turn at intersections; locals stroll the sidewalks and scatter when a gun goes off or a car comes at them.
- **Wanted level** — stealing, shooting and hitting pedestrians raise your stars; Solmar PD cruisers chase and ram you, foot cops run you down and bust you. Lay low and the heat cools off.
- **Missions and a story** — five jobs for Vera, the marina fixer: steal a getaway car, run a parcel against the clock, take on the Dune crew at the plaza, survive a three-star heat wave, and rob the Solmar Bank in the finale. Each job pays; the last one pays $5,000.
- **Combat** — pistol with mouse aim and muzzle flash, fists up close, rival crew members who shoot back, health and reload.
- **HUD with minimap** — cash, health, wanted stars, the current objective with its timer, a live minimap (player, traffic, police, mission marker), a speedometer and a message feed.
- **Save / load** — progress, cash and completed jobs persist in localStorage; continue from the title screen.
- **Sound and music** — everything synthesized with WebAudio: a sunset synthwave loop, engine hum, two-tone sirens, gunshots, crashes and mission jingles. No audio files.

## The jobs

Five missions for Vera, the marina fixer — each pays, and the next only opens when the last is done:

1. **Hot Wheels** ($500) — steal any car and bring it to the docks.
2. **Sunset Parcel** ($800) — pick up a parcel at the plaza fountain and deliver it to the marina in 90 seconds.
3. **Rooftop Rumble** ($1,200) — take on the three Dune crew members at the plaza, on foot.
4. **Heat Wave** ($1,500) — survive a three-star wanted level and reach the safehouse.
5. **The Solmar Score** ($5,000) — rob the Solmar Bank, then escape a four-star heat to the safehouse.

Getting busted costs a $300 fine and dumps you at the safehouse; getting wasted sends you back there patched up.

## Structure

`game/` is plain ES modules, one job per file:

- `src/config.js` — tuning, palette, city grid
- `src/random.js` — seeded RNG
- `src/input.js` — keyboard, mouse, virtual pad for screenshots
- `src/audio.js` — WebAudio synthesis (music, engine, sirens, effects)
- `src/city.js` — Solmar City: roads, buildings, beach, landmarks
- `src/vehicles.js` — car meshes, traffic AI, player driving
- `src/pedestrians.js` — sidewalk locals
- `src/police.js` — wanted level, cruisers, foot cops, busts
- `src/missions.js` — the five-job story chain and the mission beacon
- `src/combat.js` — pistol, fists, rival crew, particles
- `src/hud.js` — HUD and the live minimap
- `src/world.js` — the game state and the fixed-step simulation
- `src/render.js` — renderer, chase camera, golden-hour lighting
- `src/shots.js` — the four deterministic screenshot scenes
- `src/main.js` — boot, screens, the game loop
- `vendor/three.module.min.js` — three.js 0.160.0, vendored

Screenshots in `screenshots/` are real renders of the game running in a browser: the title over the city at sunset, driving through traffic, a three-star police chase, and the plaza fight in mission 3.

## License

MIT — see `LICENSE`.
