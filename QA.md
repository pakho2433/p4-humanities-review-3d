# QA — 2026-11-07 (Asia/Taipei, UTC+8)

## Scope and evidence
Local static server; Chromium/SwiftShader via Playwright. This is **segment-based verification**, not one uninterrupted 12-mission run. Earlier M1–M10 passage was handed over from the previous run at `fdde03e`; that browser crashed before M11 finished. M1–M10 were not replayed in this pass.

| This pass | Result |
| --- | --- |
| `START=10 node tests/full.mjs` | M11 + M12, wrong-item feedback, unsafe lift feedback, money/shop, intentional Boss defeat, retry, all 3 Boss phases, aiming/shooting, cover blocking shots, reload, switching weapon, jumping, victory/end screen. Passed; 0 page errors; ~395 s automation wall time. |
| `START=11 node tests/full.mjs` | M12 through intentional defeat/retry and Boss victory using only the starter water gun. Passed; 0 page errors; ~288 s wall time. |
| `node tests/ipad3.mjs` | 1180×820 landscape and 820×1180 portrait: joystick movement 1.89 units, look +0.48 rad, shop purchase, ammo 10→6, reload→10, jump >0, swap to water; weapon HUD overlaps neither joystick nor interact button. Passed both; 0 page errors. |
| `node tests/combat-regressions.mjs` | Test-only instrumentation verifies fractional damage, clean Boss restart, slime pause while shopping, enemy cleanup on victory. Passed; 0 page errors. |

`START` uses debug `jumpTo` **only to skip earlier missions**; navigation, task actions and combat thereafter use keyboard/mouse input. Thus final completion counters are honestly 2/12 and 1/12, not 12/12. Skipped missions award no money, so higher-priced purchases are correctly refused in these segments. iPad control smoke tests separately use debug Boss start and test funds, not a full touch playthrough.

Screenshots in `previews/v3_*` were opened and visually reviewed, including M11, Boss loss/phase changes/victory, and portrait/landscape mission/shop/combat screens. Machine-readable outcomes: `previews/qa-results.json`.

## Bugs fixed (no new features)
- Kept fractional contact damage internally; per-frame rounding previously made damage frame-rate dependent. HUD still shows whole HP.
- Boss retry now clears old shockwaves, jump velocity/height, firing/reload cooldowns and held mouse-fire state.
- Slimes no longer move, attack or keep firing during the shop or a modal defeat screen.
- Victory removes surviving slimes so they cannot attack during the end-screen delay.
- Test harness now dodges rather than standing in enemy fire, handles a death/retry race, accounts for jump height in aiming, accepts `BASE_URL`, and makes explicit success assertions.

## Limits / remaining unverified
- iPad is **Chromium touch/viewport emulation**, not real iPad hardware or Safari/WebKit.
- **30–45 minutes of normal first-time human play is not tested or established.** Automation wall time is not lesson duration.
- No exhaustive all-position camera, collision, occlusion or physics guarantee; screenshots and navigation cover the exercised routes only. No newly observed blocking issue remains in the tested segments.

## Reproduce
```sh
python3 -m http.server 8766
BASE_URL=http://127.0.0.1:8766/ START=10 node tests/full.mjs
BASE_URL=http://127.0.0.1:8766/ START=11 node tests/full.mjs
BASE_URL=http://127.0.0.1:8766/ node tests/ipad3.mjs
BASE_URL=http://127.0.0.1:8766/ node tests/combat-regressions.mjs
```
