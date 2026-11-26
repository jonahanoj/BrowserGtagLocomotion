# Scrapper relay server

A tiny WebSocket relay for Scrapper's multiplayer. Players connect to a room, and the server passes each player's
messages on to the others. It keeps no game state.

- Run locally: `npm install && npm start` (listens on `PORT`, default 8080)
- Railway: deploy this repo with the service's Root Directory set to `server`, then generate a public domain.
  The game connects to `wss://<that domain>` (set `NET_SERVER` in `src/game.html`).
- Test any server without rebuilding: open the game with `#server=wss://your-server` in the link.
