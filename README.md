# 奇妙考察隊 · 四上人文課1–4

Play: https://pakho2433.github.io/p4-humanities-review-3d/

First-person Three.js review game for EPH《奇妙的世界》四上 lessons 1–4（小小考察隊／漫遊香港／香港的氣候／發現地球）. About 12 missions, ~30–45 minutes.

## Credits
- Characters: Quaternius Ultimate Animated Character Pack (CC0)
- Textures: ambientCG (CC0) via prior MTR Mini assets
- Engine: three.js r160 (MIT)
- Textbook facts verified against e-Smart screenshots in `/workspace/p4-humanities-u1-4/`

## Local
```bash
python3 -m http.server 8765
# open http://127.0.0.1:8765/
```

## Test hooks
`window.__GAME` exposes mission state, `jumpTo(i)`, `completeMission()`, etc. for Playwright.

## v2 art overhaul (2026-11)
- PBR surfaces: ambientCG CC0 materials (WoodFloor051, Wood049, PaintedPlaster017, Plaster001, PavingStones070, Asphalt026B, Grass004, Ground054, Snow006, Concrete034, Fabric045, Terrazzo013, Metal009) with colour/normal/roughness maps, MeshStandard/Physical materials.
- Lighting: three.js Sky + PMREM environment for outdoor scenes, RoomEnvironment for interiors, ACES Filmic tone mapping, soft shadows that follow the player.
- Themed scenes per mission: classroom, Sheung Wan street (tram/taxi/minibus/tong lau), hill lookout with terrain, airport harbour, Northern Metropolis wetland, four-season park, typhoon living room with rain/lightning, winter estate courtyard, planetarium Earth (three.js example earth textures, MIT), desert/polar split, earthquake drill classroom.
- Characters: Quaternius Ultimate Animated Character Pack (CC0) with Idle/Walk/Victory animations; HK street props generated with Tripo AI (same as hk90s project).
- Adaptive quality: touch/≤4-core devices use lower pixel ratio and 1024 shadow maps; runtime FPS monitor lowers/raises resolution.
- Tests: `tests/playthrough.mjs` (real keyboard/mouse/click playthrough of all 12 missions), `tests/shots.mjs`, `tests/ipad.mjs`.
