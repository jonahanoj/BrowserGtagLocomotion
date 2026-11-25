# Scrapper

(The repo is still called BrowserGtagLocomotion for now.)

A WebXR VR game for Meta Quest. The Backrooms here has half walls to vault, a tall hall with a ramp up to a balcony, and office chairs glitched into the walls. You're a scary robot in the Backrooms, moving with real Gorilla Tag locomotion, hunting cute chatbot robots and tearing them apart.

**Play:** open https://jonahanoj.github.io/BrowserGtagLocomotion/ in the Quest Browser and press **Enter VR**.

- Start in the lobby: see yourself in the mirror, then hit the red **PLAY** button.
- Push off floors and walls with your hands to move; fling your arms to jump.
- **Grip** to grab a bot or any part. Grab a second part with your other hand and pull to rip it off.
- Swing fast to punch parts off. Throw bots and parts into walls to smash them, or smash two held bots together hard to break them.
- **Weapons:** in the lobby, press NONE / HAMMER / CHAINSAW / FLAMETHROWER with the claw you want it on. The hammer smashes things into pieces, the chainsaw (trigger) grinds all the way through and splits robots in half, the flamethrower (trigger) sets parts on fire until they crumble to ash.
- Right thumbstick snap-turns. **Y** returns to the lobby (not within 10 s of a fight). Score and time are on your left wrist.
- **Player vs player:** grab a friend with one claw to carry (and throw) them, or with both claws and pull. Swing or throw bot parts at friends: light hits shove, hard hits knock arms (then heads) off. Arms come off (and stop working for movement); rip the head off and they're scrapped back to the lobby.
- **Multiplayer:** open the page on another headset (same Wi-Fi works best). The lobby board shows who's online; push the blue **PLAY TOGETHER** button to start or join a shared game. Players find each other through [Trystero](https://github.com/dmotz/trystero) and then connect directly with WebRTC.

The page checks for updates every 30 s and reloads itself (in VR it waits until you're in the lobby).

## Credits
Locomotion is a JavaScript port of [Another Axiom's GorillaLocomotion](https://github.com/Another-Axiom/GorillaLocomotion) (`Player.cs`), MIT License — see `LICENSE-GorillaLocomotion`. Rendering uses three.js r128.

## Project layout
- `src/game.html` — the game (engine, weapons, multiplayer, lobby, game modes)
- `src/maps.js` — every map
- `build.py` — run `python build.py` to rebuild `index.html` (the game GitHub Pages serves) and `tools/MapViewer.html`
- `tools/MapViewer.html` — open it on a computer to fly around any map (collision boxes, wireframe, screenshots with positions)
