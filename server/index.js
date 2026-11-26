// Scrapper multiplayer relay. Players connect over a WebSocket to a room; whatever one sends, the server passes on
// to the others in that room (or to the ones it names). It keeps no game state, so it's tiny and cheap to run.
// Run: npm install && npm start   (PORT comes from the environment; Railway sets it)
const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;
const MAX_MSG = 256*1024, MAX_ROOM = 32;
const rooms = new Map();   // room name -> Map(id -> socket)

const server = http.createServer((req, res) => {
  const n = [...rooms.values()].reduce((a, r) => a + r.size, 0);
  res.writeHead(200, {'content-type':'text/plain', 'access-control-allow-origin':'*'});
  res.end(`Scrapper relay is up. ${n} player${n === 1 ? '' : 's'} in ${rooms.size} room${rooms.size === 1 ? '' : 's'}.\n`);
});
const wss = new WebSocketServer({server, maxPayload:MAX_MSG});

const clean = (s, d) => (typeof s === 'string' && /^[\w.\-]{1,64}$/.test(s)) ? s : d;
const send = (ws, obj) => { if (ws.readyState === 1) ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj)); };

wss.on('connection', (ws, req) => {
  const q = new URL(req.url, 'http://x').searchParams;
  const roomName = clean(q.get('room'), 'scrapper'), id = clean(q.get('id'), 'p-' + Math.random().toString(36).slice(2, 10));
  let room = rooms.get(roomName); if (!room){ room = new Map(); rooms.set(roomName, room); }
  if (room.size >= MAX_ROOM){ send(ws, {sys:'full'}); ws.close(); return; }
  const old = room.get(id); if (old && old !== ws){ old.replaced = true; old.close(); }   // same player reconnecting
  room.set(id, ws); ws.alive = true;
  send(ws, {sys:'welcome', id, peers:[...room.keys()].filter(k => k !== id)});
  for (const [k, o] of room) if (k !== id) send(o, {sys:'join', id});

  ws.on('pong', () => { ws.alive = true; });
  ws.on('message', (buf, isBinary) => {
    if (isBinary) return; let m; try { m = JSON.parse(buf); } catch(e){ return; }
    if (!m || typeof m.type !== 'string') return;
    const out = JSON.stringify({type:m.type, data:m.data, from:id});
    if (Array.isArray(m.to)){ for (const t of m.to){ const o = room.get(t); if (o && o !== ws) send(o, out); } }
    else for (const [k, o] of room) if (k !== id) send(o, out);
  });
  ws.on('close', () => {
    if (room.get(id) === ws){ room.delete(id); for (const o of room.values()) send(o, {sys:'leave', id}); }
    if (!room.size) rooms.delete(roomName);
  });
});

// drop connections that stopped answering
setInterval(() => { for (const ws of wss.clients){ if (!ws.alive){ ws.terminate(); continue; } ws.alive = false; try { ws.ping(); } catch(e){} } }, 20000);

server.listen(PORT, () => console.log('Scrapper relay listening on ' + PORT));
