# BrowserGtagLocomotion — Backrooms Bot Scrap

A WebXR VR game for Meta Quest. You're a scary robot in the Backrooms, moving with real Gorilla Tag locomotion, hunting cute chatbot robots and tearing them apart.

**Play:** open https://jonahanoj.github.io/BrowserGtagLocomotion/ in the Quest Browser and press **Enter VR**.

- Start in the lobby: see yourself in the mirror, then hit the red **PLAY** button.
- Push off floors and walls with your hands to move; fling your arms to jump.
- **Grip** to grab a bot or any part. Grab a second part with your other hand and pull to rip it off.
- Swing fast to punch parts off. Throw bots and parts into walls to smash them, or smash two held bots together hard to break them.
- Right thumbstick snap-turns. **Y** returns to the lobby. Score and time are on your left wrist.
- **Player vs player:** grab a friend with one claw to carry (and throw) them, or with both claws and pull. Arms come off (and stop working for movement); rip the head off and they're scrapped back to the lobby.
- **Multiplayer:** open the page on another headset (same Wi-Fi works best). The lobby board shows who's online; push the blue **PLAY TOGETHER** button to start or join a shared game. Players find each other through [Trystero](https://github.com/dmotz/trystero) and then connect directly with WebRTC.

The page checks for updates every 30 s and reloads itself (in VR it waits until you're in the lobby).

## Credits
Locomotion is a JavaScript port of [Another Axiom's GorillaLocomotion](https://github.com/Another-Axiom/GorillaLocomotion) (`Player.cs`), MIT License — see `LICENSE-GorillaLocomotion`. Rendering uses three.js r128.
