// ================= the other maps =================
let lightsOut = false;
// ---- building blocks the maps share ----
// A box as plain triangles, with texture coordinates in metres (so textures tile the same on every size)
function worldBox(a, b, us, skip){
  const [x0,y0,z0] = a, [x1,y1,z1] = b, pos = [], nor = [], uv = [];
  const F = {'x+':[[x1,y0,z0],[x1,y0,z1],[x1,y1,z1],[x1,y1,z0],[1,0,0]], 'x-':[[x0,y0,z1],[x0,y0,z0],[x0,y1,z0],[x0,y1,z1],[-1,0,0]],
    'z+':[[x1,y0,z1],[x0,y0,z1],[x0,y1,z1],[x1,y1,z1],[0,0,1]], 'z-':[[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],[0,0,-1]],
    'y+':[[x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1],[0,1,0]], 'y-':[[x0,y0,z0],[x0,y0,z1],[x1,y0,z1],[x1,y0,z0],[0,-1,0]]};
  for (const k in F){
    if (skip && skip.includes(k)) continue;
    const [p0,p1,p2,p3,n] = F[k];
    const e1 = [p1[0]-p0[0], p1[1]-p0[1], p1[2]-p0[2]], e2 = [p2[0]-p0[0], p2[1]-p0[1], p2[2]-p0[2]];
    const cr = [e1[1]*e2[2]-e1[2]*e2[1], e1[2]*e2[0]-e1[0]*e2[2], e1[0]*e2[1]-e1[1]*e2[0]];
    const tri = cr[0]*n[0] + cr[1]*n[1] + cr[2]*n[2] > 0 ? [p0,p1,p2,p0,p2,p3] : [p0,p2,p1,p0,p3,p2];
    for (const p of tri){ pos.push(...p); nor.push(...n); uv.push((n[0] ? p[2] : p[0])/us, (n[1] ? p[2] : p[1])/us); }
  }
  const g = new T3.BufferGeometry();
  g.setAttribute('position', new T3.Float32BufferAttribute(pos,3)); g.setAttribute('normal', new T3.Float32BufferAttribute(nor,3)); g.setAttribute('uv', new T3.Float32BufferAttribute(uv,2));
  return g;
}
function mergeNI(list){
  const pos = [], nor = [], uv = [];
  for (let g of list){ if (g.index) g = g.toNonIndexed(); if (!g.attributes.normal) g.computeVertexNormals();
    pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array);
    if (g.attributes.uv) uv.push(...g.attributes.uv.array); else for (let i=0;i<g.attributes.position.count;i++) uv.push(0,0); }
  const out = new T3.BufferGeometry();
  out.setAttribute('position', new T3.Float32BufferAttribute(pos,3)); out.setAttribute('normal', new T3.Float32BufferAttribute(nor,3)); out.setAttribute('uv', new T3.Float32BufferAttribute(uv,2));
  out.computeBoundingSphere(); return out;
}
// Everything a map draws is binned by material and merged into one mesh per material.
// Collision is axis-aligned boxes only, so every shape that isn't a box gets boxes that fit INSIDE it
// (round things get a cross of boxes per layer): you never sink into something you can see.
function rockGeo(sx, sy, sz, seed){
  // a box with its corners and edges pulled in and lumpy faces; it never sticks out past the box
  const sub = d => Math.max(2, Math.min(8, Math.ceil(d/0.7)));
  const g = new T3.BoxGeometry(sx, sy, sz, sub(sx), sub(sy), sub(sz)), p = g.attributes.position;
  const h = (x, y, z) => { const v = Math.sin(x*127.1 + y*311.7 + z*74.7 + seed*13.1)*43758.5453; return v - Math.floor(v); };
  for (let i=0;i<p.count;i++){
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), ux = Math.abs(x/(sx/2)), uy = Math.abs(y/(sy/2)), uz = Math.abs(z/(sz/2));
    const corner = Math.max(0, (ux + uy + uz - 2.2)/0.8), L = Math.hypot(x, y, z) || 1, k = 1 - (0.09*corner + 0.035*h(x, y, z))/L;
    p.setXYZ(i, x*k, y*k, z*k);
  }
  g.computeVertexNormals(); return g;
}
const DISC = [5, 15, 25, 35, 45, 55, 65, 75, 85].map(d => [Math.cos(d*Math.PI/180), Math.sin(d*Math.PI/180)]);
// collision that follows a mesh's actual shape: sample its surface densely, then one tight box per
// (cell x cell) column of the samples. Good for lumpy rocks and wavy cliff walls.
function meshBoxes(geo, cell, back){
  const pos = geo.attributes.position, idx = geo.index, cols = new Map(), a = new V(), b = new V(), c = new V(), p = new V();
  const tri = (i0, i1, i2) => { a.fromBufferAttribute(pos, i0); b.fromBufferAttribute(pos, i1); c.fromBufferAttribute(pos, i2);
    const n = Math.max(1, Math.ceil(Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a))/(cell*0.4)));
    for (let i=0;i<=n;i++) for (let j=0;j<=n-i;j++){ const u = i/n, v = j/n; p.copy(a).multiplyScalar(1 - u - v).addScaledVector(b, u).addScaledVector(c, v);
      const k = Math.floor(p.x/cell) + ',' + Math.floor(p.z/cell) + ',0'; let e = cols.get(k); if (!e) cols.set(k, e = [p.x, p.y, p.z, p.x, p.y, p.z]);
      if (p.x < e[0]) e[0] = p.x; if (p.y < e[1]) e[1] = p.y; if (p.z < e[2]) e[2] = p.z; if (p.x > e[3]) e[3] = p.x; if (p.y > e[4]) e[4] = p.y; if (p.z > e[5]) e[5] = p.z; } };
  if (idx) for (let i=0;i<idx.count;i+=3) tri(idx.getX(i), idx.getX(i+1), idx.getX(i+2)); else for (let i=0;i<pos.count;i+=3) tri(i, i+1, i+2);
  // stack the little boxes back up where the shape barely changes from one to the next
  const byCol = new Map();
  for (const [k, e] of cols){ const [i, j, l] = k.split(',').map(Number), ck = i + ',' + j; let L = byCol.get(ck); if (!L) byCol.set(ck, L = []); L.push([l, e]); }
  const out = [], pad = 0.02, tol = cell*0.25;
  for (const L of byCol.values()){ L.sort((x, y) => x[0] - y[0]); let cur = null, lastL = -9;
    for (const [l, e] of L){
      if (cur && l === lastL + 1 && Math.abs(e[0] - cur[0]) < tol && Math.abs(e[2] - cur[2]) < tol && Math.abs(e[3] - cur[3]) < tol && Math.abs(e[5] - cur[5]) < tol){
        cur[0] = Math.max(cur[0], e[0]); cur[2] = Math.max(cur[2], e[2]); cur[3] = Math.min(cur[3], e[3]); cur[5] = Math.min(cur[5], e[5]); cur[4] = e[4]; }
      else { if (cur) out.push(cur); cur = e.slice(); }
      lastL = l; }
    if (cur) out.push(cur); }
  // a shell (like a cliff seen from inside) is thickened backwards, away from the side you see
  if (back && back.length === 2) for (const e of out){ const dx = (e[0] + e[3])/2 - back[0], dz = (e[2] + e[5])/2 - back[1], L = Math.hypot(dx, dz) || 1, t = 0.8;
    if (dx > 0) e[3] += t*dx/L; else e[0] += t*dx/L; if (dz > 0) e[5] += t*dz/L; else e[2] += t*dz/L; }
  // a closed lump is thickened inwards, towards its middle, so it's solid all the way through
  // (columns already run from the lowest to the highest point of the shape, so a closed lump is solid through)
  // widen sideways by the sample spacing so neighbouring columns overlap (no cracks for a hand to slip into)
  const sp = cell*0.2;
  return out.map(e => [[e[0]-sp, e[1]-pad, e[2]-sp], [e[3]+sp, e[4]+pad, e[5]+sp]]);
}
function discBoxes(cx, cz, R, y0, y1, out){
  for (const t of DISC) out.push([[cx-R*t[0], y0, cz-R*t[1]], [cx+R*t[0], y1, cz+R*t[1]]]);
  return out;
}
function ellipsoidBoxes(cx, cy, cz, rx, ry, rz, n){
  const out = []; n = n || 10;
  for (let k=0;k<n;k++){
    const ya = -1 + 2*k/n, yb = ya + 2/n, ym = Math.abs(ya) > Math.abs(yb) ? ya*0.85 + yb*0.15 : yb*0.85 + ya*0.15, f = Math.sqrt(Math.max(0, 1 - ym*ym));
    if (f < 0.15) continue;
    for (const [lo, hi] of discBoxes(0, 0, f, cy + ya*ry, cy + yb*ry, [])) out.push([[cx + lo[0]*rx, lo[1], cz + lo[2]*rz], [cx + hi[0]*rx, hi[1], cz + hi[2]*rz]]);
  }
  return out;
}
function coneBoxes(cx, cz, R, y0, h, down){
  const out = [];
  const n = 10; for (let k=0;k<n;k++){ const f = 1 - (k + 0.8)/n; if (f <= 0.05) continue; const ya = y0 + (down ? -(k+1) : k)*h/n, yb = ya + h/n; discBoxes(cx, cz, R*f, ya, yb, out); }
  return out;
}
function mapBuilder(O, key, ghost){
  const group = new T3.Group(), bins = {}, solids = [];
  const W = a => [a[0]+O.x, a[1]+O.y, a[2]+O.z];
  const B = {group, O, solids, bins, key, wins:[], props:[],
    mat(k, m){ bins[k] = {m, list:[]}; return B; },
    // Each drawn box is grown by its own tiny amount (0.6-3 mm, a different amount for every box),
    // so two boxes can never have faces in exactly the same plane: that's what Z fighting is. Collision is exact.
    box(k, a, c, o){ o = o || {}; const A = W(a), C2 = W(c);
      if (k){ const e = 0.0006 + 0.0024*((B.nbox = (B.nbox || 0) + 1)*0.6180339887 % 1); bins[k].list.push(worldBox(A.map(v => v - e), C2.map(v => v + e), o.us || 1, o.skip)); }
      if (o.solid !== false && !ghost) solids.push(addBox(A, C2)); },
    solid(a, c){ if (!ghost) solids.push(addBox(W(a), W(c))); },
    solids_(list){ for (const [a, c] of list) B.solid(a, c); },
    // a mesh that is solid exactly where it is drawn
    meshSolid(k, geo, x, y, z, cell, rx, ry, rz, back){ const g = geo.clone().applyMatrix4(new M4().compose(new V(x+O.x, y+O.y, z+O.z), new Q().setFromEuler(new T3.Euler(rx||0, ry||0, rz||0)), new V(1, 1, 1)));
      bins[k].list.push(g); if (!ghost) for (const [a, c] of meshBoxes(g, cell || 0.3, back ? [back[0]+O.x, back[1]+O.z] : [x+O.x, y+O.y, z+O.z])) solids.push(addBox(a, c)); },
    geo(k, geo, x, y, z, rx, ry, rz, sx, sy, sz){ const s = sx == null ? 1 : sx; bins[k].list.push(geo.clone().applyMatrix4(new M4().compose(new V(x+O.x, y+O.y, z+O.z), new Q().setFromEuler(new T3.Euler(rx||0, ry||0, rz||0)), new V(s, sy == null ? s : sy, sz == null ? s : sz)))); },
    // a lumpy rock filling exactly the box a..c (and solid exactly there)
    rock(k, a, c, solid){ B.geo(k, rockGeo(c[0]-a[0], c[1]-a[1], c[2]-a[2], a[0]*7 + a[2]*3 + a[1]), (a[0]+c[0])/2, (a[1]+c[1])/2, (a[2]+c[2])/2); if (solid !== false) B.solid(a, c); },
    // round things
    ball(k, geo, x, y, z, rx, ry, rz, n){ B.geo(k, geo, x, y, z, 0, 0, 0, rx, ry, rz); B.solids_(ellipsoidBoxes(x, y, z, rx, ry, rz, n)); },
    cyl(k, r0, r1, h, x, y0, z, seg){ B.geo(k, new T3.CylinderGeometry(r1, r0, h, seg || 10), x, y0 + h/2, z); const n = Math.abs(r0 - r1) > 0.03 ? 4 : 1, ap = Math.cos(Math.PI/(seg || 10));
      for (let i=0;i<n;i++){ const t = (i + 1)/n, r = r0 > r1 ? r0 + (r1 - r0)*t : r0 + (r1 - r0)*(i/n); B.solids_(discBoxes(x, z, r*ap, y0 + h*i/n, y0 + h*(i+1)/n, [])); } },
    window(a, c){ if (!ghost) B.wins.push([W(a), W(c)]); },
    prop(kind, x, y, z){ if (!ghost) B.props.push([kind, x+O.x, y+O.y, z+O.z]); },
    // a wall run along x (or z) between c0 and c1, t0..t1 thick, with openings [a0, a1, y0, y1];
    // glass: openings listed by index get a breakable window
    wallRun(keys, axis, c0, c1, t0, t1, y0, y1, holes, us, glass){
      const seg = (a, b, ya, yb) => { if (b - a < 0.01 || yb - ya < 0.01) return; const mn = axis === 'x' ? [a, ya, t0] : [t0, ya, a], mx = axis === 'x' ? [b, yb, t1] : [t1, yb, b];
        keys.forEach((k, i) => B.box(k, mn, mx, {us:us || 1.6, solid:i === 0})); };
      let cur = c0;
      (holes || []).slice().sort((p, q) => p[0] - q[0]).forEach(([a0, a1, hy0, hy1, isGlass]) => {
        seg(cur, a0, y0, y1); seg(a0, a1, y0, hy0); seg(a0, a1, hy1, y1); cur = a1;
        if (isGlass){ const m = (t0 + t1)/2; if (axis === 'x') B.window([a0, hy0, m - 0.025], [a1, hy1, m + 0.025]); else B.window([m - 0.025, hy0, a0], [m + 0.025, hy1, a1]); }
      });
      seg(cur, c1, y0, y1);
    },
    finish(light, parent){
      for (const k in bins){ const b = bins[k]; if (!b.list.length) continue; const geo = mergeNI(b.list);
        if (light && b.m.vertexColors){ const p = geo.attributes.position, cols = new Float32Array(p.count*3);
          for (let i=0;i<p.count;i++){ const c = light(p.getX(i), p.getY(i), p.getZ(i)); cols[i*3] = c[0]; cols[i*3+1] = c[1]; cols[i*3+2] = c[2]; }
          geo.setAttribute('color', new T3.BufferAttribute(cols, 3)); }
        group.add(new T3.Mesh(geo, b.m)); }
      if (parent){ parent.add(group); return group; }
      for (const [a, c] of B.wins) addWindow(key, group, a, c);
      group.visible = false; scene.add(group); return group;
    }};
  return B;
}

// ---- breakable windows ----
// Only a hammer, an explosion, or a body flying into it breaks one (hands just bump off it).
// It bursts into glass bits you can't pick up, and fades back in 30 s later once nobody is in the way.
const WINS = [];
const glassBase = 0.3;
function addWindow(map, group, a, c){
  const box = addBox(a, c);
  const m = new T3.Mesh(new T3.BoxGeometry(c[0]-a[0], c[1]-a[1], c[2]-a[2]), new T3.MeshLambertMaterial({color:0xcdeeff, emissive:0x1d3442, transparent:true, opacity:glassBase, depthWrite:false}));
  m.position.set((a[0]+c[0])/2, (a[1]+c[1])/2, (a[2]+c[2])/2); m.renderOrder = 3; group.add(m);
  const w = {map, i:WINS.filter(x => x.map === map).length, box, mesh:m, st:'ok', t:0, a, c};
  WINS.push(w); return w;
}
const SHN = 500, shardMesh = new T3.InstancedMesh(new T3.TetrahedronGeometry(1, 0), new T3.MeshLambertMaterial({color:0xd8f2ff, emissive:0x2a4a5a, transparent:true, opacity:0.75}), SHN);
shardMesh.frustumCulled = false; shardMesh.count = 0; scene.add(shardMesh);
const shards = [];
function sndGlass(vol){ if (!AC) return; noiseHit(0.4, 5200, 1.5, 0.7*vol); noiseHit(0.15, 9000, 3, 0.4*vol); for (let i=0;i<5;i++) setTimeout(() => tone('sine', 2500 + R()*3000, 1800 + R()*2000, 0.08, 0.05*vol), R()*400); }
function breakWindow(w, dir, remote){
  if (w.st === 'gone') return;
  w.st = 'gone'; w.t = 30; w.box.off = true; w.mesh.visible = false;
  if (!remote && netGame) netSend('ev', {t:'win', m:w.map, i:w.i});
  const sz = [w.c[0]-w.a[0], w.c[1]-w.a[1], w.c[2]-w.a[2]], area = Math.max(sz[0], sz[2])*sz[1];
  const n = Math.min(110, Math.round(25 + area*30)), d = dir ? dir.clone() : new V();
  if (d.length() > 6) d.setLength(6);
  for (let k=0;k<n;k++){
    if (shards.length >= SHN) shards.shift();
    const p = new V(w.a[0] + R()*sz[0], w.a[1] + R()*sz[1], w.a[2] + R()*sz[2]);
    shards.push({p, v:d.clone().multiplyScalar(0.4 + R()*0.6).add(new V((R()-0.5)*2.5, R()*1.5, (R()-0.5)*2.5)), q:new Q().setFromEuler(new T3.Euler(R()*6, R()*6, R()*6)), w:new V(R()-0.5, R()-0.5, R()-0.5).multiplyScalar(20),
      s:0.012 + R()*0.03, life:3.5 + R()*2.5, fy:floorBelow(p)});
  }
  const dist = w.mesh.position.distanceTo(lastPlayer); sndGlass(Math.min(1, 3/(1 + dist)));
}
function windowsHitByBox(lo, hi){ return WINS.filter(w => w.map === curMap && w.st !== 'gone' && w.a[0] <= hi[0] && w.c[0] >= lo[0] && w.a[1] <= hi[1] && w.c[1] >= lo[1] && w.a[2] <= hi[2] && w.c[2] >= lo[2]); }
function windowDist(w, p){ const dx = Math.max(w.a[0] - p.x, 0, p.x - w.c[0]), dy = Math.max(w.a[1] - p.y, 0, p.y - w.c[1]), dz = Math.max(w.a[2] - p.z, 0, p.z - w.c[2]); return Math.hypot(dx, dy, dz); }
let winHeadPrev = null;
const winHeadV = new V();
// your body (not your hands) flying into glass at speed breaks it
function bodyWindowCheck(dt){
  const h = loco.headPos();
  if (winHeadPrev && dt > 0){ const iv = h.clone().sub(winHeadPrev).divideScalar(dt); if (iv.length() < 15) winHeadV.lerp(iv, 0.6); else winHeadV.set(0, 0, 0); }   // teleports aren't flying
  winHeadPrev = h.clone();
  if (mode !== 'game' || winHeadV.length() < 3.0) return;
  const look = winHeadV.clone().multiplyScalar(dt*2.5);
  for (const off of [0, -0.45, -0.85]){
    const p = h.clone().add(new V(0, off, 0)), q = p.clone().add(look);
    for (const w of WINS){ if (w.map !== curMap || w.st === 'gone') continue;
      const c = w.mesh.position, toward = c.clone().sub(p).dot(winHeadV) > 0;
      if (toward && Math.min(windowDist(w, p), windowDist(w, q)) < 0.45) breakWindow(w, winHeadV); }
  }
}
function updateWindows(dt){
  // glass bits
  let n = 0; const ONE_ = new V(1,1,1);
  for (let i = shards.length-1; i >= 0; i--){
    const s = shards[i]; s.life -= dt; if (s.life <= 0){ shards.splice(i, 1); continue; }
    s.v.y -= (s.g != null ? s.g : 9.8)*dt; s.p.addScaledVector(s.v, dt);
    if (s.p.y < s.fy + s.s){ s.p.y = s.fy + s.s; s.v.y *= -0.25; s.v.x *= 0.6; s.v.z *= 0.6; s.w.multiplyScalar(0.6); }
    s.q.multiply(new Q().setFromEuler(new T3.Euler(s.w.x*dt, s.w.y*dt, s.w.z*dt)));
  }
  for (const s of shards){ const k = Math.min(1, s.life); tmpM.compose(s.p, s.q, ONE_.clone().multiplyScalar(s.s*k)); shardMesh.setMatrixAt(n++, tmpM); }
  shardMesh.count = n; shardMesh.instanceMatrix.needsUpdate = true;
  // broken ones come back
  const bodies = [];
  if (mode === 'game'){ const h = loco.headPos(); bodies.push(h, h.clone().add(new V(0, -0.5, 0)), handW[0], handW[1]); }
  for (const p of Object.values(NET.peers)) if (p.P && p.g && p.g === netGame) bodies.push(p.P.head, p.P.head.clone().add(new V(0, -0.5, 0)), p.P.hands[0], p.P.hands[1]);
  for (const w of WINS){
    if (w.map !== curMap) continue;
    if (w.st === 'gone'){ w.t -= dt; if (w.t <= 0 && !bodies.some(b => windowDist(w, b) < 0.4)){ w.st = 'fade'; w.f = 0; w.box.off = false; w.mesh.visible = true; } }
    else if (w.st === 'fade'){ w.f += dt; w.mesh.material.opacity = (w.base || glassBase)*Math.min(1, w.f/1.5); if (w.f >= 1.5) w.st = 'ok'; }
  }
}
function resetWindows(){ for (const w of WINS){ w.st = 'ok'; w.box.off = false; w.mesh.visible = true; w.mesh.material.opacity = w.base || glassBase; } shards.length = 0; }

// ---- props: loose things in every map to pick up, throw, smash and cut ----
const PROPK = {};
const pmat = {};
const PM = (c, o) => pmat[c + JSON.stringify(o || {})] || (pmat[c + JSON.stringify(o || {})] = new T3.MeshLambertMaterial(Object.assign({color:c}, o || {})));
const pg = (geo, c, x, y, z, rx, o) => { const m = new T3.Mesh(geo, PM(c, o)); m.position.set(x||0, y||0, z||0); if (rx) m.rotation.set(...rx); return m; };
const grp_ = (...ms) => { const g = new T3.Group(); for (const m of ms) g.add(m); return g; };
Object.assign(PROPK, {
  box:{r:0.17, make:() => grp_(pg(new T3.BoxGeometry(0.36, 0.34, 0.36), 0xc09a62), pg(new T3.BoxGeometry(0.37, 0.05, 0.08), 0xd8c08e, 0, 0.15, 0))},
  bottle:{r:0.1, make:() => grp_(pg(new T3.CylinderGeometry(0.06, 0.06, 0.24, 10), 0x9fd3ff, 0, 0, 0, null, {transparent:true, opacity:0.75}), pg(new T3.CylinderGeometry(0.02, 0.02, 0.05, 8), 0x2f62c8, 0, 0.14, 0))},
  cone:{r:0.17, make:() => grp_(pg(new T3.ConeGeometry(0.14, 0.42, 12), 0xff6a1a, 0, 0.05, 0), pg(new T3.BoxGeometry(0.34, 0.04, 0.34), 0x222222, 0, -0.15, 0), pg(new T3.CylinderGeometry(0.075, 0.095, 0.05, 12), 0xf4f4f4, 0, 0.06, 0))},
  ball:{r:0.12, make:() => grp_(pg(new T3.SphereGeometry(0.12, 14, 10), 0xe8742a), pg(new T3.TorusGeometry(0.121, 0.004, 4, 20), 0x2a1a10))},
  pinecone:{r:0.06, make:() => grp_(pg(new T3.ConeGeometry(0.05, 0.13, 7), 0x6b4423, 0, 0, 0, [Math.PI, 0, 0]))},
  apple:{r:0.05, make:() => grp_(pg(new T3.SphereGeometry(0.05, 10, 8), 0xd8302a), pg(new T3.CylinderGeometry(0.004, 0.004, 0.03, 4), 0x5a3a1e, 0, 0.055, 0))},
  stick:{r:0.05, make:() => grp_(pg(new T3.CylinderGeometry(0.02, 0.025, 0.6, 6), 0x6b4a2b, 0, 0, 0, [0, 0, Math.PI/2]))},
  rock:{r:0.11, make:() => grp_(pg(new T3.DodecahedronGeometry(0.12, 0), 0x8b8378))},
  crystal:{r:0.09, make:() => grp_(new T3.Mesh(new T3.OctahedronGeometry(0.09, 0), new T3.MeshBasicMaterial({color:0x7fe8ff})))},
  pillow:{r:0.07, make:() => grp_(pg(new T3.BoxGeometry(0.45, 0.13, 0.3), 0xfbf8f0))},
  book:{r:0.04, make:() => grp_(pg(new T3.BoxGeometry(0.16, 0.05, 0.23), 0x2f62c8), pg(new T3.BoxGeometry(0.15, 0.044, 0.225), 0xf4f0e0, 0.006, 0, 0))},
  block:{r:0.06, make:() => grp_(pg(new T3.BoxGeometry(0.12, 0.12, 0.12), [0xd8302a, 0x2f62c8, 0xf2c230, 0x3f9a4a][Math.floor(R()*4)]))},
  mug:{r:0.06, make:() => grp_(pg(new T3.CylinderGeometry(0.045, 0.04, 0.1, 12), 0xf2f2ee), pg(new T3.TorusGeometry(0.025, 0.008, 5, 10), 0xf2f2ee, 0.05, 0, 0))},
  barrel:{r:0.28, make:() => grp_(pg(new T3.CylinderGeometry(0.26, 0.26, 0.6, 14), 0x2f6b35), pg(new T3.CylinderGeometry(0.265, 0.265, 0.05, 14), 0x1c1d20, 0, 0.15, 0), pg(new T3.CylinderGeometry(0.265, 0.265, 0.05, 14), 0x1c1d20, 0, -0.15, 0))},
  duck:{r:0.08, make:() => grp_(pg(new T3.SphereGeometry(0.08, 10, 8), 0xffd23d, 0, 0, 0), pg(new T3.SphereGeometry(0.05, 10, 8), 0xffd23d, 0.06, 0.07, 0), pg(new T3.ConeGeometry(0.02, 0.05, 6), 0xff8a1f, 0.12, 0.07, 0, [0, 0, -Math.PI/2]))},
  can:{r:0.05, make:() => grp_(pg(new T3.CylinderGeometry(0.04, 0.04, 0.12, 10), [0xd8302a, 0x2f62c8, 0x3f9a4a, 0xf2c230][Math.floor(R()*4)]), pg(new T3.CylinderGeometry(0.041, 0.041, 0.01, 10), 0xc0c4c8, 0, 0.06, 0))},
  cereal:{r:0.07, make:() => grp_(pg(new T3.BoxGeometry(0.2, 0.28, 0.07), [0xf2c230, 0xd8302a, 0x2f62c8, 0x9a4fc8][Math.floor(R()*4)]), pg(new T3.BoxGeometry(0.12, 0.08, 0.072), 0xffffff, 0, 0.04, 0))},
  melon:{r:0.14, make:() => grp_(pg(new T3.SphereGeometry(0.15, 14, 10), 0x2f7d32, 0, 0, 0, null), pg(new T3.TorusGeometry(0.15, 0.006, 4, 20), 0x9adf7a, 0, 0, 0, [Math.PI/2, 0, 0]))},
  orange:{r:0.05, make:() => grp_(pg(new T3.SphereGeometry(0.05, 10, 8), 0xff9a1a))},
  cart:{r:0.3, make:() => { const m = PM(0xa9b0b8), g = new T3.Group(); const bx = (w, h, d, x, y, z) => { const o = new T3.Mesh(new T3.BoxGeometry(w, h, d), m); o.position.set(x, y, z); g.add(o); };
    bx(0.5, 0.02, 0.75, 0, 0.05, 0); bx(0.02, 0.35, 0.75, -0.25, 0.22, 0); bx(0.02, 0.35, 0.75, 0.25, 0.22, 0); bx(0.5, 0.35, 0.02, 0, 0.22, 0.37); bx(0.5, 0.35, 0.02, 0, 0.22, -0.37); bx(0.5, 0.03, 0.03, 0, 0.5, -0.47); bx(0.03, 0.15, 0.03, -0.22, 0.43, -0.42); bx(0.03, 0.15, 0.03, 0.22, 0.43, -0.42);
    for (const [x, z] of [[-0.2,-0.3],[0.2,-0.3],[-0.2,0.3],[0.2,0.3]]){ const w = new T3.Mesh(new T3.CylinderGeometry(0.05, 0.05, 0.03, 8), PM(0x1c1d20)); w.rotation.z = Math.PI/2; w.position.set(x, -0.2, z); g.add(w); }
    g.position.y = -0.05; return g; }},
  trashcan:{r:0.25, make:() => grp_(pg(new T3.CylinderGeometry(0.25, 0.22, 0.7, 14), 0x6f777f), pg(new T3.CylinderGeometry(0.27, 0.27, 0.05, 14), 0x4a5056, 0, 0.36, 0))},
});
function makeProp(kind, id, owner){
  const d = PROPK[kind] || PROPK.box, p = mkPart('prop', d.r);
  p.obj.add(d.make()); p.kind = kind; p.id = id; partsById.set(id, p); p.owner = owner; p.spec = {type:'prop', k:kind}; p.mode = 'free';
  scene.add(p.obj); return p;
}
function spawnProps(){
  const list = MAPS[curMap].props || [];
  list.forEach(([kind, x, y, z], k) => { const p = makeProp(kind, NET.id.slice(0,6) + '-pr' + k + '-' + (botCounter++), NET.id); p.obj.position.set(x, y + p.r, z); p.obj.rotation.y = R()*6; });
}
// standing in a flame (torches, the campfire): heats you up, then you're on fire. Same for robot pieces.
let heatMe = 0;
function fireHazard(dt, spots, rad){
  if (mode !== 'game') return;
  const head = loco.headPos(), at = {head, torso:head.clone().add(new V(0,-0.35,0)), arm0:handW[0], arm1:handW[1]};
  let near = null;
  for (const k in at){ if (k[0] === 'a' && me.lost[+k[3]]) continue; for (const t of spots) if (at[k].distanceTo(t) < rad){ near = k; break; } if (near) break; }
  if (near && !myBurn){ heatMe += dt; if (near[0] === 'a') pulse(+near[3], 0.2 + heatMe*0.4, 20); if (R() < 0.3) partFlames(at[near], 0.06, 1.5);
    if (heatMe > 1.4){ heatMe = 0; igniteMe(near, 'the fire'); } }
  else heatMe = Math.max(0, heatMe - dt);
  for (const p of parts){
    if (p.obj.userData.dead || p.fire || p.name === 'mine' || !mine(rootOf(p))) continue;
    const c = centerW(p); let hot = false; for (const t of spots) if (c.distanceTo(t) < rad*0.7 + p.r*0.5){ hot = true; break; }
    if (!hot) continue; p.heat = (p.heat || 0) + dt; p.heatT = clock; heated.add(p); if (p.heat > 1.2) ignitePart(p);
  }
}
// moving things you can bump into (the vacuum, sliding doors)
function dynBox(){ const b = {min:[0,-99,0], max:[0,-99,0]}; (window.DYN_BOXES = window.DYN_BOXES || []).push(b); return b; }
function setDyn(b, x0, y0, z0, x1, y1, z1){ b.min[0] = x0; b.min[1] = y0; b.min[2] = z0; b.max[0] = x1; b.max[1] = y1; b.max[2] = z1; }
function announce(text){ try { if (!window.speechSynthesis) return; const u = new SpeechSynthesisUtterance(text); u.pitch = 0.8; u.rate = 0.95; u.volume = 0.8; speechSynthesis.speak(u); } catch(e){} }

// Robots walk on a grid of 2 m cells: a cell is walkable where there's floor and nothing in the way.
function buildNav(solids, O, size, c, lv, keep){
  const nx = Math.floor(size/c), x0 = O.x, z0 = O.z;
  const hit = (lo, hi) => { for (const b of solids) if (b.min[0] < hi[0] && b.max[0] > lo[0] && b.min[1] < hi[1] && b.max[1] > lo[1] && b.min[2] < hi[2] && b.max[2] > lo[2]) return true; return false; };
  const floorAt = (x, z, y) => { for (const b of solids) if (b.min[0] <= x && b.max[0] >= x && b.min[2] <= z && b.max[2] >= z && b.max[1] >= y-0.05 && b.max[1] <= y+0.3) return true; return false; };
  const clear = (x, z, y, r) => (!keep || keep(x, z)) && floorAt(x, z, y) && !hit([x-r, y+0.32, z-r], [x+r, y+1.0, z+r]);
  const ok = lv.map(y => Array.from({length:nx}, (_, j) => Array.from({length:nx}, (_, i) => clear(x0+(i+0.5)*c, z0+(j+0.5)*c, y, 0.35))));
  const link = lv.map((y, l) => Array.from({length:nx}, (_, j) => Array.from({length:nx}, (_, i) => {
    const out = [false, false];      // +x, +z
    for (const [k, di, dj] of [[0,1,0],[1,0,1]]){
      if (!ok[l][j][i] || !(ok[l][j+dj] && ok[l][j+dj][i+di])) continue;
      let good = true; for (const t of [0.25, 0.5, 0.75]) if (!clear(x0+(i+0.5+di*t)*c, z0+(j+0.5+dj*t)*c, y, 0.25)) good = false;
      out[k] = good;
    }
    return out;
  })));
  return {x0, z0, nx, nz:nx, c, lv, ok:(i,j,l) => !!(ok[l] && ok[l][j] && ok[l][j][i]),
    open:(i,j,l,di,dj) => { if (di === 1) return link[l][j][i][0]; if (di === -1) return i > 0 && link[l][j][i-1][0]; if (dj === 1) return link[l][j][i][1]; return j > 0 && link[l][j-1][i][1]; }};
}
const lam = (c, o) => new T3.MeshLambertMaterial(Object.assign({color:c}, o || {}));
const tex = (w, h, f) => canvasTex(w, h, f, true);
const noiseFill = (g, w, h, n, col, a, s) => { for (let i=0;i<n;i++){ g.fillStyle = col.replace('A', (R()*a).toFixed(3)); g.fillRect(R()*w, R()*h, s || 2, s || 2); } };
let mapSeed = 1;
const mr = () => { mapSeed = (mapSeed*16807) % 2147483647; return (mapSeed - 1)/2147483646; };
const placeFree = (taken, x0, x1, z0, z1, rad, avoid) => { for (let t=0;t<200;t++){ const x = x0 + mr()*(x1-x0), z = z0 + mr()*(z1-z0);
  if (avoid && avoid(x, z)) continue; if (taken.some(([a,b,r]) => Math.hypot(a-x, b-z) < r + rad)) continue; taken.push([x, z, rad]); return [x, z]; } return null; };
const boing = () => { if (!AC) return; tone('sine', 180, 520, 0.25, 0.25); tone('triangle', 360, 900, 0.18, 0.12); };

// ======================= FOREST =======================
// Quirk: giant bouncy mushrooms. Slap one with a claw (or land on it) and you're launched into the air.
{
  const O = new V(0, 0, 100), B = mapBuilder(O, 'forest'); mapSeed = 4242;
  const grass = tex(256, 256, (g,w,h) => { g.fillStyle = '#4f8a35'; g.fillRect(0,0,w,h); noiseFill(g, w, h, 6000, 'rgba(20,60,10,A)', 0.35); noiseFill(g, w, h, 3000, 'rgba(170,220,90,A)', 0.25);
    g.strokeStyle = 'rgba(30,80,20,.35)'; for (let i=0;i<500;i++){ const x = R()*w, y = R()*h; g.beginPath(); g.moveTo(x,y); g.lineTo(x+(R()-0.5)*4, y-4-R()*5); g.stroke(); } });
  const hedge = tex(128, 128, (g,w,h) => { g.fillStyle = '#2c5a24'; g.fillRect(0,0,w,h); for (let i=0;i<700;i++){ g.fillStyle = `rgba(${40+R()*60|0},${90+R()*70|0},${30+R()*30|0},.7)`; g.beginPath(); g.arc(R()*w, R()*h, 2+R()*5, 0, 7); g.fill(); } });
  const bark = tex(64, 128, (g,w,h) => { g.fillStyle = '#5d4027'; g.fillRect(0,0,w,h); g.strokeStyle = 'rgba(30,18,8,.5)'; for (let i=0;i<20;i++){ const x = R()*w; g.beginPath(); g.moveTo(x,0); g.lineTo(x+(R()-0.5)*8,h); g.stroke(); } });
  const rockT = tex(128, 128, (g,w,h) => { g.fillStyle = '#8b8d88'; g.fillRect(0,0,w,h); noiseFill(g, w, h, 2500, 'rgba(40,40,40,A)', 0.3, 3); noiseFill(g, w, h, 1200, 'rgba(220,220,210,A)', 0.2, 2); });
  const capT = canvasTex(128, 128, (g,w,h) => { g.fillStyle = '#d8342c'; g.fillRect(0,0,w,h); g.fillStyle = '#fff6ea'; for (let i=0;i<14;i++){ g.beginPath(); g.arc(R()*w, R()*h*0.75, 5+R()*8, 0, 7); g.fill(); } });
  B.mat('grass', lam(0xffffff, {map:grass})).mat('hedge', lam(0xffffff, {map:hedge})).mat('bark', lam(0xffffff, {map:bark})).mat('leaf', lam(0x3f8f3a)).mat('leaf2', lam(0x5aa840))
   .mat('pine', lam(0x24603a)).mat('rock', lam(0xffffff, {map:rockT})).mat('log', lam(0x7a5534)).mat('stem', lam(0xf0e6d0)).mat('bush', lam(0x3b7d2e)).mat('flower', lam(0xffd84a));
  B.box('grass', [-2,-1,-2], [46,0,46], {us:3});
  // the edge: a tall hedge, with an invisible wall above it so nobody climbs out
  for (const [a,b] of [[[-1,0,-1],[0,4.5,45]], [[44,0,-1],[45,4.5,45]], [[0,0,-1],[44,4.5,0]], [[0,0,44],[44,4.5,45]]]){ B.box('hedge', a, b, {us:2}); B.solid([a[0],4.5,a[2]], [b[0],16,b[2]]); }
  for (let i=0;i<44;i++){ const t = i/44*4, side = Math.floor(t), f = (t - side)*46 - 1, p = [[f,-3],[47,f],[46-f,47],[-3,46-f]][side];
    B.geo('pine', new T3.ConeGeometry(2.2, 6, 7), p[0], 6, p[1]); B.geo('pine', new T3.ConeGeometry(1.6, 4.5, 7), p[0], 8.5, p[1]); }
  const taken = [[22, 22, 5]];          // keep a clearing in the middle where you spawn
  const pine = (x, z, s) => { B.cyl('bark', 0.28*s, 0.2*s, 2.4*s, x, 0, z, 7);
    for (let k=0;k<3;k++){ const R_ = (1.6 - k*0.4)*s, cy = (2.4 + k*1.3)*s; B.geo('pine', new T3.ConeGeometry(R_, 2.4*s, 8), x, cy, z); B.solids_(coneBoxes(x, z, R_*0.98, cy - 1.2*s, 2.4*s)); } };
  const leafy = (x, z, s) => { B.cyl('bark', 0.38*s, 0.25*s, 3.6*s, x, 0, z, 7);
    B.ball(mr() < 0.5 ? 'leaf' : 'leaf2', new T3.IcosahedronGeometry(1, 1), x, 4.3*s, z, 1.9*s, 1.52*s, 1.9*s);
    B.ball('leaf', new T3.IcosahedronGeometry(1, 0), x + 0.9*s, 3.7*s, z + 0.4*s, 1.1*s, 1.1*s, 1.1*s, 3); };
  for (let i=0;i<38;i++){ const p = placeFree(taken, 2, 42, 2, 42, 1.6); if (p) (mr() < 0.55 ? pine : leafy)(p[0], p[1], 0.85 + mr()*0.45); }
  for (let i=0;i<14;i++){ const p = placeFree(taken, 2, 42, 2, 42, 1.2); if (!p) continue; const r = 0.45 + mr()*0.9;
    const w = r*(1.3 + mr()*0.5), d = r*(1.3 + mr()*0.5); B.rock('rock', [p[0]-w/2, -0.1, p[1]-d/2], [p[0]+w/2, r*0.9, p[1]+d/2]); }
  for (let i=0;i<7;i++){ const p = placeFree(taken, 3, 41, 3, 41, 2.2); if (!p) continue; const L = 3 + mr()*1.5, along = mr() < 0.5;
    B.geo('log', new T3.CylinderGeometry(0.32, 0.36, L, 9), p[0], 0.32, p[1], along ? 0 : Math.PI/2, 0, along ? Math.PI/2 : 0);
    for (const [lo, hi] of discBoxes(0, 0.32, 0.32, 0, 1, [])){ const a_ = lo[0], b_ = hi[0], c_ = lo[2], d_ = hi[2];   // the log's round cross-section as boxes
      if (along) B.solid([p[0]-L/2, c_, p[1]+a_], [p[0]+L/2, d_, p[1]+b_]); else B.solid([p[0]+a_, c_, p[1]-L/2], [p[0]+b_, d_, p[1]+L/2]); } }
  for (let i=0;i<20;i++){ const p = placeFree(taken, 1, 43, 1, 43, 0.7); if (!p) continue; const br = 0.55 + mr()*0.35; B.geo('bush', new T3.IcosahedronGeometry(br, 0), p[0], 0.3, p[1], 0, mr()*6, 0, 1, 0.7, 1);
    B.solids_(ellipsoidBoxes(p[0], 0.3, p[1], br*0.78, br*0.7*0.78, br*0.78, 3).filter(([lo, hi]) => hi[1] > 0));
    for (let k=0;k<3;k++) B.geo('flower', new T3.SphereGeometry(0.06, 5, 4), p[0] + (mr()-0.5)*1.4, 0.06, p[1] + (mr()-0.5)*1.4); }
  // the mushrooms: their caps are their own meshes so they can squash when they bounce you
  const capMat = lam(0xffffff, {map:capT}), shrooms = [];
  // the underside: cream gills radiating out from the stem
  const gillT = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#efe6cc'; g.fillRect(0, 0, w, h); g.translate(w/2, h/2);
    for (let k=0;k<120;k++){ const a = k/120*Math.PI*2; g.strokeStyle = k % 2 ? 'rgba(150,120,90,.55)' : 'rgba(190,165,130,.45)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(Math.cos(a)*22, Math.sin(a)*22); g.lineTo(Math.cos(a)*126, Math.sin(a)*126); g.stroke(); }
    g.fillStyle = '#f6efdb'; g.beginPath(); g.arc(0, 0, 24, 0, 7); g.fill(); g.strokeStyle = 'rgba(140,110,80,.5)'; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 124, 0, 7); g.stroke(); });
  const gillMat = lam(0xffffff, {map:gillT});
  for (let i=0;i<8;i++){
    const p = i === 0 ? [27, 22] : placeFree(taken, 4, 40, 4, 40, 1.8); if (!p) continue; if (i === 0) taken.push([27, 22, 1.8]);
    const r = 0.9 + mr()*0.5, top = 1.0 + mr()*0.8;
    B.cyl('stem', 0.32, 0.22, top - 0.5*r, p[0], 0, p[1], 10);
    B.solids_(ellipsoidBoxes(p[0], top - 0.55*r, p[1], r, 0.55*r, r, 14).filter(([lo]) => lo[1] >= top - 0.55*r - 0.01));
    const cap = new T3.Mesh(new T3.SphereGeometry(r, 16, 8, 0, Math.PI*2, 0, Math.PI/2), capMat); cap.scale.y = 0.55; cap.position.set(p[0]+O.x, top - 0.55*r, p[1]+O.z); B.group.add(cap);
    const gills = new T3.Mesh(new T3.CircleGeometry(r*0.995, 32), gillMat); gills.rotation.x = Math.PI/2; gills.position.y = 0.012; cap.add(gills);       // faces down; squashes with the cap
    shrooms.push({x:p[0]+O.x, z:p[1]+O.z, r, top, cap, t:0});
  }
  // a campfire by the clearing (it'll set you, robots and anything else on fire)
  const fireAt = new V(18.6, 0, 24.6);
  for (let k=0;k<9;k++){ const a = k/9*Math.PI*2; B.geo('rock', new T3.DodecahedronGeometry(0.16, 0), fireAt.x + Math.cos(a)*0.55, 0.08, fireAt.z + Math.sin(a)*0.55); }
  for (let k=0;k<4;k++) B.geo('log', new T3.CylinderGeometry(0.06, 0.07, 0.8, 6), fireAt.x, 0.18, fireAt.z, 0.9, k*Math.PI/2, 0);
  B.solid([fireAt.x - 0.62, 0, fireAt.z - 0.62], [fireAt.x + 0.62, 0.12, fireAt.z + 0.62]);
  const fireW = fireAt.clone().add(O).setY(0.35);
  for (let i=0;i<22;i++){ const p = placeFree(taken.slice(), 6, 38, 6, 38, 0.2); if (p) B.prop(['pinecone','apple','stick','rock'][i % 4], p[0], 0, p[1]); }
  const grp = B.finish(), nav = buildNav(B.solids, O, 44, 2, [0]);
  const bounceCD = new WeakMap(); let meCD = 0, fireOut = false;
  // robots love the mushrooms: they climb up, jump on, and get flung (then do it again)
  const shroomIdea = (bot, imp) => { if (imp || R() > 0.5) return null; const s = pick(shrooms), a0 = R()*6.283, ax = s.x + Math.cos(a0)*(s.r + 0.7), az = s.z + Math.sin(a0)*(s.r + 0.7);
    return actWalk(new V(ax, 0, az), [], {then:(b, failed) => { if (failed) return null; let t = 0; const from = b.root.obj.position.clone(); say(b, pick(['wheee!','mushroom time','again!!','boing boing','watch me fly']));
      return {step(b2, dt){ t += dt; const r = b2.root, pos = r.obj.position, k = Math.min(1, t/0.6);
        pos.set(from.x + (s.x - from.x)*k, from.y + (s.top + 0.2 - from.y)*k + Math.sin(k*Math.PI)*1.0, from.z + (s.z - from.z)*k); botYaw(b2, yawOf(new V(s.x - from.x, 0, s.z - from.z))); botLimbs(b2, -0.5, 2.5, 0); setFace(b2, 'happy');
        if (k >= 1){ r.mode = 'free'; r.asleep = false; r.v.set(0, -2, 0); r.w.set(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(6); return false; } return true; }}; }}); };
  MAPS.forest = {name:'FOREST', O, botIdea:shroomIdea, group:grp, spawn:new V(22, 0, 22).add(O), yaw:0, nav, yMin:-5, yMax:20, props:B.props,
    sky:{bg:0xa9d6f0, fog:0xb6dcef, near:12, far:48, hs:0xeef8ff, hg:0x4c6b30, hi:1.0, ac:0xffffff, ai:0.32},
    update(dt, inGame){
      meCD -= dt;
      // rain puts the campfire out (smoke and a hiss); it lights again when the rain stops. Snow doesn't.
      const wet = (MAPS.forest.rainK || 0) > 0.35; if (wet !== fireOut){ fireOut = wet; if (AC && fireW.distanceTo(lastPlayer) < 14) noiseHit(wet ? 0.8 : 0.3, wet ? 3000 : 600, 0.8, 0.15); }
      if (fireOut){ if (fireW.distanceTo(lastPlayer) < 14 && R() < 0.12) emitAsh(fireW.clone(), 1, 0.02); }
      else if (fireW.distanceTo(lastPlayer) < 14) for (let k=0;k<3;k++) emitFire(fireW.clone().add(new V((R()-0.5)*0.3, -0.15, (R()-0.5)*0.3)), new V((R()-0.5)*0.3, 0.9 + R()*0.6, (R()-0.5)*0.3), 0.06 + R()*0.05, 0.5 + R()*0.3);
      if (inGame && !fireOut) fireHazard(dt, [fireW, fireW.clone().add(new V(0, 0.35, 0))], 0.5);
      for (const s of shrooms){ if (s.t > 0){ s.t -= dt; const k = s.t/0.35; s.cap.scale.set(1 + 0.25*Math.sin(k*Math.PI), 0.55*(1 - 0.35*Math.sin(k*Math.PI)), 1 + 0.25*Math.sin(k*Math.PI)); } }
      if (!inGame) return;
      const on = (p, pad) => { for (const s of shrooms) if (Math.hypot(p.x - s.x, p.z - s.z) < s.r*0.95 && p.y > s.top - 0.35 && p.y < s.top + pad) return s; return null; };
      // you: a claw on the cap, or your body coming down on it
      if (meCD <= 0){
        let hitS = null;
        for (const i of [0,1]) if (!me.lost[i] && (loco.S.wasTouching[i] || loco.S.isTouching && loco.S.isTouching[i])){ const s = on(handW[i], 0.2); if (s) hitS = s; }
        const head = loco.headPos(); const s2 = on(new V(head.x, head.y - 0.5, head.z), 0.4); if (s2 && loco.S.velocity.y < 1) hitS = s2;
        if (hitS){ meCD = 0.6; hitS.t = 0.35; boing(); pulse(0, 1, 90); pulse(1, 1, 90);
          const v = loco.S.velocity; v.y = 9.5; v.x *= 1.3; v.z *= 1.3; }
      }
      // loose pieces and knocked-over robots bounce too
      for (const p of parts){
        if (p.parent || p.obj.userData.dead || p.mode !== 'free' || !mine(p)) continue;
        const c = centerW(p), s = on(new V(c.x, c.y - p.r, c.z), 0.25); if (!s) continue;
        const t = bounceCD.get(p) || 0; if (clock - t < 0.5) continue; bounceCD.set(p, clock);
        p.asleep = false; p.v.y = 7 + R()*2; p.v.x += (R()-0.5)*2; p.v.z += (R()-0.5)*2; s.t = 0.35; if (c.distanceTo(lastPlayer) < 8) boing();
      }
    }};
}

// ======================= FOREST: day and night, rain and snow =======================
// The sun goes round every 6 minutes (night with a moon and stars), and the weather changes every couple of
// minutes: clear, rain or snow. Snow settles on everything that faces up, and melts again after.
// Both run off the clock, so everyone in the forest sees the same sky.
{
  const F = MAPS.forest, grp = F.group, baseUpdate = F.update, DAY = 360, SLOT = 150;
  const snowU = {value:0}, patched = new Set();
  const patch = (mt) => { if (!mt || patched.has(mt) || !mt.isMeshLambertMaterial) return; patched.add(mt);
    mt.onBeforeCompile = sh => { sh.uniforms.snowAmt = snowU;
      sh.vertexShader = 'varying float vUp;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vUp = normalize(mat3(modelMatrix) * objectNormal).y;');
      sh.fragmentShader = 'uniform float snowAmt;\nvarying float vUp;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.96, 1.0), snowAmt*smoothstep(0.35, 0.8, vUp));'); };
    mt.customProgramCacheKey = () => 'snowy'; mt.needsUpdate = true; };
  grp.traverse(o => { if (o.isMesh) [].concat(o.material).forEach(patch); });
  // sky things that follow you around
  const sky = new T3.Group(); grp.add(sky);
  const sun = new T3.Mesh(new T3.SphereGeometry(3.2, 16, 10), new T3.MeshBasicMaterial({color:0xfff2c0, fog:false})); sky.add(sun);
  const moon = new T3.Mesh(new T3.SphereGeometry(2.2, 16, 10), new T3.MeshBasicMaterial({color:0xe8ecff, fog:false})); sky.add(moon);
  const sp = new Float32Array(900*3); for (let i=0;i<900;i++){ const v = new V(R()*2-1, R()*0.95 + 0.05, R()*2-1).normalize().multiplyScalar(68); sp[i*3] = v.x; sp[i*3+1] = v.y; sp[i*3+2] = v.z; }
  const sg = new T3.BufferGeometry(); sg.setAttribute('position', new T3.BufferAttribute(sp, 3));
  const starMat = new T3.PointsMaterial({color:0xffffff, size:2, sizeAttenuation:false, fog:false, transparent:true, opacity:0}); sky.add(new T3.Points(sg, starMat));
  // rain (streaks) and snow (flakes) in a box round you
  const RN = 800, rp = new Float32Array(RN*6), rv = []; for (let i=0;i<RN;i++) rv.push(new V());
  const rg = new T3.BufferGeometry(); rg.setAttribute('position', new T3.BufferAttribute(rp, 3)); const rain = new T3.LineSegments(rg, new T3.LineBasicMaterial({color:0xa8bccf, transparent:true, opacity:0.55})); rain.frustumCulled = false; grp.add(rain);
  const SN = 1000, fp = new Float32Array(SN*3), fph = []; for (let i=0;i<SN;i++) fph.push(R()*6.3);
  const fg = new T3.BufferGeometry(); fg.setAttribute('position', new T3.BufferAttribute(fp, 3)); const snow = new T3.Points(fg, new T3.PointsMaterial({color:0xffffff, size:0.07, transparent:true, opacity:0.95})); snow.frustumCulled = false; grp.add(snow);
  const BOX = 13, TOP = 11;
  const seed = (p, i) => { p[i] = lastPlayer.x + (R()*2-1)*BOX; p[i+1] = lastPlayer.y - 2 + R()*TOP; p[i+2] = lastPlayer.z + (R()*2-1)*BOX; };
  let seeded = false;
  let rainS = null; const rainSound = (v) => { if (!AC) return; if (!rainS){ const len = AC.sampleRate*2, buf = AC.createBuffer(1, len, AC.sampleRate), d = buf.getChannelData(0); for (let i=0;i<len;i++) d[i] = R()*2 - 1;
      const src = AC.createBufferSource(); src.buffer = buf; src.loop = true; const bp = AC.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 0.5; const g = AC.createGain(); g.gain.value = 0; src.connect(bp); bp.connect(g); g.connect(AC.destination); src.start(); rainS = g; }
    rainS.gain.setTargetAtTime(v, AC.currentTime, 0.4); };
  const hash = n => { const x = Math.sin(n*127.1 + 311.7)*43758.5453; return x - Math.floor(x); };
  const weatherOf = n => { const h = hash(n); return h < 0.4 ? 'clear' : h < 0.72 ? 'rain' : 'snow'; };
  const C = (a) => new T3.Color(a);
  const DAYS = {bg:C(0xa9d6f0), fog:C(0xb6dcef), hs:C(0xeef8ff), hg:C(0x4c6b30), ac:C(0xffffff)}, DUSK = {bg:C(0xf0a070), fog:C(0xe2a684), hs:C(0xffd0a0), hg:C(0x4a4030), ac:C(0xffe0c0)},
        NIGHT = {bg:C(0x0b1230), fog:C(0x0b1230), hs:C(0x6a78b0), hg:C(0x101a12), ac:C(0x8090c8)}, GREY = C(0x8c969e), WHITE = C(0xdfe5ec);
  const out = {bg:0, fog:0, near:12, far:48, hs:0, hg:0, hi:1, ac:0, ai:0.32}, tc = new T3.Color();
  let lightningT = 8, flashT = 0, lastW = '', wasIn = false;
  const thunder = () => { if (!AC) return; noiseHit(2.6, 120, 0.4, 0.7); tone('sine', 55, 30, 2, 0.3); };
  F.update = (dt, inGame) => {
    baseUpdate(dt, inGame);
    if (!seeded){ seeded = true; for (let i=0;i<SN;i++) seed(fp, i*3); for (let i=0;i<RN;i++) seed(rp, i*6); }
    const now = Date.now()/1000 + (window.__fT || 0), ph = (now % DAY)/DAY, ang = ph*Math.PI*2 - Math.PI/2, sy = Math.sin(ang), sx = Math.cos(ang);
    const slot = Math.floor(now/SLOT), w = window.__fW || weatherOf(slot), into = now/SLOT - slot;
    const ramp = Math.min(1, into*SLOT/12, (1 - into)*SLOT/12), rainK = w === 'rain' ? ramp : 0, snowK = w === 'snow' ? ramp : 0;
    if (inGame && w !== lastW && lastW){ showMsg(w === 'rain' ? 'It started raining...' : w === 'snow' ? 'It started snowing!' : 'The sky clears up.'); }
    lastW = w;
    // the sky colour: day, sunset, night, then greyed by clouds
    const day = Math.max(0, Math.min(1, (sy + 0.12)/0.35)), dusk = Math.max(0, 1 - Math.abs(sy)/0.25);
    for (const k of ['bg', 'fog', 'hs', 'hg', 'ac']){ tc.copy(NIGHT[k]).lerp(DAYS[k], day).lerp(DUSK[k], dusk*0.6*day + dusk*0.25*(1 - day));
      if (k === 'bg' || k === 'fog') tc.lerp(w === 'snow' ? WHITE : GREY, Math.max(rainK, snowK)*0.7*(0.3 + 0.7*day)); out[k] = tc.getHex(); }
    const cloud = Math.max(rainK, snowK);
    out.hi = (0.3 + 0.75*day)*(1 - 0.3*cloud); out.ai = 0.14 + 0.18*day; out.near = (6 + 6*day)*(1 - 0.4*cloud); out.far = (30 + 18*day)*(1 - 0.35*cloud);
    if (flashT > 0){ flashT -= dt; out.bg = 0xdde4ff; out.fog = 0xb0b8d0; out.hi = 1.8; out.ai = 0.7; }
    applySky(out);
    sky.position.copy(lastPlayer);
    sun.position.set(sx*60, sy*60, -20); moon.position.set(-sx*60, -sy*60, 20); sun.visible = sy > -0.1; moon.visible = sy < 0.1;
    sun.material.color.setHex(dusk > 0.3 ? 0xffb070 : 0xfff2c0); starMat.opacity = Math.max(0, 1 - day*1.5)*(1 - cloud*0.8);
    // snow settles slowly and melts slowly
    snowU.value = Math.max(0, Math.min(1, snowU.value + (snowK > 0.5 ? dt/35 : -dt/70)));
    // falling stuff
    rain.visible = rainK > 0.01; snow.visible = snowK > 0.01; F.rainK = rainK;
    if (rain.visible){ const n = Math.floor(RN*rainK); rg.setDrawRange(0, n*2);
      for (let i=0;i<n;i++){ const j = i*6; rp[j+1] -= 16*dt; if (rp[j+1] < lastPlayer.y - 3 || Math.abs(rp[j] - lastPlayer.x) > BOX || Math.abs(rp[j+2] - lastPlayer.z) > BOX){ seed(rp, j); rp[j+1] = lastPlayer.y + 6 + R()*5; }
        rp[j+3] = rp[j] + 0.03; rp[j+4] = rp[j+1] + 0.45; rp[j+5] = rp[j+2]; } rg.attributes.position.needsUpdate = true;
      lightningT -= dt; if (rainK > 0.8 && lightningT <= 0){ lightningT = 18 + R()*25; flashT = 0.12; if (inGame) setTimeout(thunder, 900 + R()*1500); } }
    if (snow.visible){ const n = Math.floor(SN*snowK); fg.setDrawRange(0, n);
      for (let i=0;i<n;i++){ const j = i*3; fph[i] += dt; fp[j+1] -= 1.1*dt; fp[j] += Math.sin(fph[i]*1.3)*0.4*dt; fp[j+2] += Math.cos(fph[i])*0.3*dt;
        if (fp[j+1] < lastPlayer.y - 3 || Math.abs(fp[j] - lastPlayer.x) > BOX || Math.abs(fp[j+2] - lastPlayer.z) > BOX){ seed(fp, j); fp[j+1] = lastPlayer.y + 5 + R()*4; } }
      fg.attributes.position.needsUpdate = true; }
    rainSound(inGame ? rainK*0.07 : 0);
  };
  const baseLeave = F.leave; F.leave = () => { if (baseLeave) baseLeave(); rainSound(0); };
}

// ======================= CITY =======================
// Quirk: traffic. Cars run down both streets (timed by the clock, so everyone sees the same cars) and
// they flatten whatever's in the road: you get sent flying, robots get smashed.
{
  const O = new V(0, 0, 200), B = mapBuilder(O, 'city'); mapSeed = 777;
  const asph = tex(256, 256, (g,w,h) => { g.fillStyle = '#3b3d40'; g.fillRect(0,0,w,h); noiseFill(g, w, h, 9000, 'rgba(0,0,0,A)', 0.25); noiseFill(g, w, h, 4000, 'rgba(160,160,160,A)', 0.18); });
  const walk = tex(128, 128, (g,w,h) => { g.fillStyle = '#a9a59c'; g.fillRect(0,0,w,h); noiseFill(g, w, h, 1500, 'rgba(60,55,50,A)', 0.2); g.strokeStyle = 'rgba(70,65,60,.5)'; g.lineWidth = 2; g.strokeRect(0,0,w,h); g.beginPath(); g.moveTo(w/2,0); g.lineTo(w/2,h); g.moveTo(0,h/2); g.lineTo(w,h/2); g.stroke(); });
  const facade = (base, win, lit) => tex(128, 256, (g,w,h) => { g.fillStyle = base; g.fillRect(0,0,w,h); noiseFill(g, w, h, 800, 'rgba(0,0,0,A)', 0.12, 3);
    for (let y=10;y<h;y+=42) for (let x=8;x<w;x+=42){ g.fillStyle = R() < lit ? '#f4e3a0' : win; g.fillRect(x, y, 26, 28); g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(x, y, 26, 4); } });
  B.mat('asph', lam(0xffffff, {map:asph})).mat('walk', lam(0xffffff, {map:walk})).mat('fA', lam(0xffffff, {map:facade('#a8644a', '#2a3644', 0.15)})).mat('fB', lam(0xffffff, {map:facade('#8e949b', '#1f2a36', 0.1)}))
   .mat('fC', lam(0xffffff, {map:facade('#5f7f9e', '#9cc7e8', 0.05)})).mat('roof', lam(0x55585c)).mat('paint', lam(0xf2f2ea)).mat('yellow', lam(0xf2c230)).mat('tunnel', new T3.MeshBasicMaterial({color:0x050505}))
   .mat('pole', lam(0x3c4046)).mat('lamp', new T3.MeshBasicMaterial({color:0xfff2c0})).mat('red', lam(0xc8302a)).mat('green', lam(0x2f6b35)).mat('bin', lam(0x2e5a3a)).mat('wood', lam(0x8a6a44)).mat('grassC', lam(0x5c9440)).mat('ac', lam(0xb9bdc2)).mat('leafC', lam(0x3f8f3a)).mat('barkC', lam(0x5d4027));
  const plain = (c1, c2) => tex(128, 128, (g,w,h) => { g.fillStyle = c1; g.fillRect(0,0,w,h); noiseFill(g, w, h, 900, c2, 0.15, 2); });
  const marble = tex(256, 256, (g,w,h) => { g.fillStyle = '#e8e4dc'; g.fillRect(0,0,w,h); g.strokeStyle = 'rgba(120,110,100,.25)'; for (let i=0;i<30;i++){ g.beginPath(); g.moveTo(R()*w, R()*h); g.bezierCurveTo(R()*w, R()*h, R()*w, R()*h, R()*w, R()*h); g.stroke(); } g.strokeStyle = 'rgba(90,80,70,.4)'; g.lineWidth = 2; g.strokeRect(0,0,w,h); g.beginPath(); g.moveTo(w/2,0); g.lineTo(w/2,h); g.moveTo(0,h/2); g.lineTo(w,h/2); g.stroke(); });
  const carpet = tex(128, 128, (g,w,h) => { g.fillStyle = '#5a6472'; g.fillRect(0,0,w,h); noiseFill(g, w, h, 5000, 'rgba(20,25,35,A)', 0.3, 2); });
  B.mat('skin', lam(0xffffff, {map:plain('#7c8794', 'rgba(30,35,40,A)')})).mat('office', lam(0xffffff, {map:plain('#e6e2d6', 'rgba(120,110,90,A)')})).mat('marble', lam(0xffffff, {map:marble})).mat('carpet', lam(0xffffff, {map:carpet}))
   .mat('ceilO', lam(0xf1efe8)).mat('panel', new T3.MeshBasicMaterial({color:0xf4f8ff})).mat('desk', lam(0xb48a5a)).mat('dark', lam(0x24272c)).mat('screen', new T3.MeshBasicMaterial({color:0x3a7bd5})).mat('metalO', lam(0xa9b0b8))
   .mat('chairO', lam(0x2b2f36)).mat('white', lam(0xf4f4f2)).mat('stairs', lam(0x9c9488)).mat('rail', lam(0x6c7278)).mat('plantO', lam(0x3f8f3a)).mat('pot', lam(0x8a5a3a)).mat('water', lam(0x8fd0ff, {transparent:true, opacity:0.7}));
  B.box('asph', [-2,-1,-2], [46,0,46], {us:4});
  // markings: centre lines and crosswalks
  for (let x=0;x<44;x+=3) if (x < 15 || x > 28) B.box('yellow', [x, 0, 21.9], [x+1.6, 0.006, 22.1], {solid:false});
  for (let z=0;z<44;z+=3) if (z < 15 || z > 28) B.box('yellow', [21.9, 0, z], [22.1, 0.006, z+1.6], {solid:false});
  for (let k=0;k<6;k++){ for (const c of [16.6, 27.4]){ B.box('paint', [18.4 + k*1.3, 0, c-0.9], [19.0 + k*1.3, 0.006, c+0.9], {solid:false}); B.box('paint', [c-0.9, 0, 18.4 + k*1.3], [c+0.9, 0.006, 19.0 + k*1.3], {solid:false}); } }
  // four blocks: a raised sidewalk, then buildings with alleys between them
  const quads = [[0,18,0,18],[26,44,0,18],[0,18,26,44],[26,44,26,44]];
  const tall = [3.2, 4.5, 8, 13, 19, 24];
  quads.forEach(([x0,x1,z0,z1], qi) => {
    B.box('walk', [x0, 0, z0], [x1, 0.15, z1], {us:2});
    const ix0 = x0 === 0 ? 0 : x0 + 3, ix1 = x1 === 44 ? 44 : x1 - 3, iz0 = z0 === 0 ? 0 : z0 + 3, iz1 = z1 === 44 ? 44 : z1 - 3;
    const mx = (ix0 + ix1)/2, mz = (iz0 + iz1)/2;
    const cells = [[ix0, mx-1.5, iz0, mz-1.5], [mx+1.5, ix1, iz0, mz-1.5], [ix0, mx-1.5, mz+1.5, iz1], [mx+1.5, ix1, mz+1.5, iz1]];
    cells.forEach(([a0,a1,b0,b1], ci) => {
      if ((qi + ci) % 5 === 3){       // a little park instead of a building
        B.box('grassC', [a0, 0.15, b0], [a1, 0.2, b1], {solid:false});
        const cx = (a0+a1)/2, cz = (b0+b1)/2;
        B.cyl('barkC', 0.32, 0.25, 3.2, cx, 0.15, cz, 7);
        B.ball('leafC', new T3.IcosahedronGeometry(1, 1), cx, 4, cz, 1.8, 1.8, 1.8);
        B.box('wood', [cx+1.2, 0.15, cz-0.9], [cx+1.7, 0.6, cz+0.9]); return; }
      const h = tall[Math.floor(mr()*tall.length)], k = ['fA','fB','fC'][Math.floor(mr()*3)];
      if (qi === 0 && ci < 2) return;          // the office building you can go into (built below)
      B.box(k, [a0, 0, b0], [a1, h, b1], {us:3, skip:['y+','y-']}); B.box('roof', [a0, h, b0], [a1, h+0.05, b1], {solid:false});
      if (h > 4 && mr() < 0.7){ const ax = a0 + 1 + mr()*(a1-a0-3), az = b0 + 1 + mr()*(b1-b0-3); B.box('ac', [ax, h, az], [ax+1.4, h+0.9, az+1.1]); }
      if (h < 5) B.box('pole', [a0, h, b0], [a1, h+0.4, b0+0.15]);     // a little parapet to grab on low roofs
    });
    // street furniture on the sidewalk
    const sx = x0 === 0 ? x1 - 1.2 : x0 + 1.2, sz = z0 === 0 ? z1 - 1.2 : z0 + 1.2;
    const ad = x0 === 0 ? 1 : -1;
    B.box('pole', [sx-0.07, 0, sz-0.07], [sx+0.07, 4.6, sz+0.07]); B.box('pole', [Math.min(sx, sx + ad*1.3), 4.5, sz-0.05], [Math.max(sx, sx + ad*1.3), 4.6, sz+0.05]);
    B.box('pole', [Math.min(sx + ad*0.85, sx + ad*1.35), 4.5, sz-0.22], [Math.max(sx + ad*0.85, sx + ad*1.35), 4.62, sz+0.22]);
    B.box('lamp', [Math.min(sx + ad*0.9, sx + ad*1.3), 4.44, sz-0.18], [Math.max(sx + ad*0.9, sx + ad*1.3), 4.5, sz+0.18]);
    for (let k=0;k<3;k++){ const p = [x0 + 1 + mr()*(x1 - x0 - 2), z0 === 0 ? z1 - 0.6 - mr()*1.6 : z0 + 0.6 + mr()*1.6]; B.prop(['cone','ball','trashcan'][(qi + k) % 3], p[0], 0.15, p[1]); }
    B.prop('cone', x0 === 0 ? x1 + 0.6 : x0 - 0.6, 0, (z0 + z1)/2 + 2);
    const hx = x0 === 0 ? x1 - 1 : x0 + 1, hz = (z0 + z1)/2 + (mr()-0.5)*6;
    B.geo('red', new T3.CylinderGeometry(0.14, 0.16, 0.6, 8), hx, 0.45, hz); B.solid([hx-0.14, 0, hz-0.14], [hx+0.14, 0.75, hz+0.14]);
    const bx = (x0 + x1)/2 + (mr()-0.5)*6, bz = z0 === 0 ? z1 - 1 : z0 + 1;
    B.box('wood', [bx-0.9, 0.15, bz-0.25], [bx+0.9, 0.55, bz+0.25]); B.box('pole', [bx-0.9, 0.55, bz + (z0 === 0 ? 0.2 : -0.25)], [bx+0.9, 0.95, bz + (z0 === 0 ? 0.25 : -0.2)]);
    // dumpster in an alley
    B.box('bin', [mx-1, 0.15, mz-0.6], [mx+1, 1.35, mz+0.6]);
  });
  // ---- an office building you can go into: lobby, two office floors, glass windows ----
  {
    const FL = [0.15, 3.55, 6.95], TOP = 10.35, WX0 = 0, WX1 = 15, WZ0 = 0, WZ1 = 6, T = 0.3;
    const band = f => [f === 0 ? 0 : FL[f] - 0.25, f === 2 ? TOP : FL[f+1] - 0.25];
    for (let f=0;f<3;f++){
      const [y0, y1] = band(f), F = FL[f];
      const east = f === 0 ? [[2.4, 3.6, F - 0.004, F + 2.3],          // (the door's sill tucks just under the floors either side: no flicker)
 [0.6, 2.1, F + 0.45, F + 2.55, true], [3.9, 5.4, F + 0.45, F + 2.55, true]] : [[0.8, 2.3, F + 0.9, F + 2.5, true], [3.7, 5.2, F + 0.9, F + 2.5, true]];
      const north = f === 0 ? [[1.5, 3.7, F + 0.45, F + 2.55, true], [6, 8.2, F + 0.45, F + 2.55, true], [10.8, 13, F + 0.45, F + 2.55, true]] : [[1, 2.7, F + 0.9, F + 2.5, true], [4.2, 5.9, F + 0.9, F + 2.5, true], [7.4, 9.1, F + 0.9, F + 2.5, true], [10.6, 12.3, F + 0.9, F + 2.5, true]];
      B.wallRun(['office'], 'z', WZ0 + T, WZ1 - T, WX1 - T, WX1, y0, y1, east, 1.6);
      B.wallRun(['skin'], 'z', WZ0, WZ1, WX1, WX1 + 0.03, y0, y1, east.map(h => h.slice(0, 4)), 2);
      B.wallRun(['office'], 'x', WX0, WX1, WZ1 - T, WZ1, y0, y1, north, 1.6);
      B.wallRun(['skin'], 'x', WX0, WX1 + 0.03, WZ1, WZ1 + 0.03, y0, y1, north.map(h => h.slice(0, 4)), 2);
    }
    B.box('office', [WX0, 0, WZ0], [WX1 - T, TOP, WZ0 + T]); B.box('office', [WX0, 0, WZ0 + T], [WX0 + T, TOP, WZ1 - T]);
    B.box('roof', [WX0, TOP - 0.25, WZ0], [WX1 + 0.03, TOP, WZ1 + 0.03]); B.box('pole', [WX0, TOP, WZ1 - 0.15], [WX1, TOP + 0.6, WZ1 + 0.03]); B.box('pole', [WX1 - 0.15, TOP, WZ0], [WX1 + 0.03, TOP + 0.6, WZ1]);
    B.box('marble', [WX0 + T, 0.15, WZ0 + T], [WX1 - T, 0.16, WZ1 - T], {solid:false, us:2});
    // floors with a hole over each staircase
    const holes = [null, [0.9, 7.2, 0.3, 1.75], [7.5, 13.8, 0.3, 1.75]];
    for (const f of [1, 2]){
      const y = FL[f], [hx0, hx1, hz0, hz1] = holes[f], pieces = [[T, hx0, T, WZ1 - T], [hx1, WX1 - T, T, WZ1 - T], [hx0, hx1, hz1, WZ1 - T]];
      for (const [x0, x1, z0, z1] of pieces){ B.box('carpet', [x0, y - 0.25, z0], [x1, y, z1], {us:2, skip:['y-']}); B.box('ceilO', [x0, y - 0.25, z0], [x1, y - 0.24, z1], {solid:false}); }
      B.box('rail', [hx0, y, hz1], [hx1, y + 1.0, hz1 + 0.06]); if (f === 2) B.box('rail', [hx1, y, hz0], [hx1 + 0.06, y + 1.0, hz1 + 0.06]);
      if (f === 1) B.box('rail', [hx0 - 0.06, y, hz0], [hx0, y + 1.0, hz1 + 0.06]);
    }
    B.box('ceilO', [T, TOP - 0.26, T], [WX1 - T, TOP - 0.25, WZ1 - T], {solid:false});
    // stairs: solid steps, ground -> 1 going east along the south wall, 1 -> 2 continuing east
    const stair = (xa, y0, rise) => { for (let i=0;i<12;i++) B.box('stairs', [xa + i*0.5, y0, 0.4], [xa + (i+1)*0.5, y0 + (i+1)*rise/12, 1.6]); };
    stair(1.0, FL[0], FL[1] - FL[0]); stair(7.6, FL[1], FL[2] - FL[1]);
    // lobby: reception desk, elevators, couches, plants
    B.box('desk', [10.2, 0.15, 3.7], [12.8, 1.2, 4.5]); B.box('dark', [10.1, 1.2, 3.6], [12.9, 1.25, 4.6]);
    B.box('metalO', [WX0 + T, 0.15, 2.2], [WX0 + T + 0.02, 2.5, 3.3], {solid:false}); B.box('metalO', [WX0 + T, 0.15, 3.5], [WX0 + T + 0.02, 2.5, 4.6], {solid:false});
    B.box('panel', [WX0 + T, 1.2, 3.33], [WX0 + T + 0.03, 1.36, 3.47], {solid:false});
    B.box('chairO', [5.5, 0.15, 4.6], [7.7, 0.6, 5.5]); B.box('chairO', [5.5, 0.6, 5.3], [7.7, 1.0, 5.5]);
    for (const [x, z] of [[9.2, 5.2], [13.9, 1.2], [4.6, 5.2]]){ B.cyl('pot', 0.2, 0.25, 0.45, x, 0.15, z, 8); B.ball('plantO', new T3.IcosahedronGeometry(1, 0), x, 0.95, z, 0.38, 0.45, 0.38, 3); }
    // office floor: desks with screens and chairs, a water cooler
    const F1 = FL[1];
    for (const [x, z] of [[3, 2.7], [3, 4.45], [6.5, 2.7], [6.5, 4.45], [10, 2.7], [10, 4.45]]){          // back row's chairs clear the wall
      B.box('desk', [x - 0.8, F1 + 0.72, z - 0.4], [x + 0.8, F1 + 0.77, z + 0.4]); B.box('dark', [x - 0.75, F1, z - 0.35], [x - 0.7, F1 + 0.72, z + 0.35]); B.box('dark', [x + 0.7, F1, z - 0.35], [x + 0.75, F1 + 0.72, z + 0.35]);
      B.box('dark', [x - 0.3, F1 + 0.77, z - 0.05], [x + 0.3, F1 + 1.15, z]); B.box('screen', [x - 0.27, F1 + 0.8, z + 0.001], [x + 0.27, F1 + 1.12, z + 0.01], {solid:false});
      B.box('chairO', [x - 0.25, F1 + 0.4, z + 0.45], [x + 0.25, F1 + 0.48, z + 0.95]); B.box('chairO', [x - 0.25, F1 + 0.48, z + 0.9], [x + 0.25, F1 + 1.0, z + 0.97]); B.box('metalO', [x - 0.03, F1, z + 0.67], [x + 0.03, F1 + 0.4, z + 0.73], {solid:false});
      B.prop(['mug','book'][Math.floor(x) % 2], x + 0.4, F1 + 0.77, z - 0.2);
    }
    B.box('white', [13.6, F1, 2.3], [14.2, F1 + 1.0, 2.9]); B.cyl('water', 0.17, 0.17, 0.45, 13.9, F1 + 1.0, 2.6, 10);
    // top floor: meeting room table, whiteboard, sofas
    const F2 = FL[2];
    B.box('desk', [3, F2 + 0.72, 2.6], [7.5, F2 + 0.78, 4.4]); B.box('dark', [5, F2, 3.3], [5.5, F2 + 0.72, 3.7]);
    for (let k=0;k<4;k++){ B.box('chairO', [3.3 + k*1.1, F2 + 0.4, 2.0], [3.8 + k*1.1, F2 + 0.48, 2.5]); B.box('chairO', [3.3 + k*1.1, F2 + 0.4, 4.5], [3.8 + k*1.1, F2 + 0.48, 5.0]); }
    B.box('white', [WX0 + T, F2 + 1.0, 2.4], [WX0 + T + 0.03, F2 + 2.2, 4.8], {solid:false});
    B.box('chairO', [9.5, F2, 4.6], [12, F2 + 0.45, 5.6]); B.box('chairO', [9.5, F2 + 0.45, 5.4], [12, F2 + 0.9, 5.6]);
    B.prop('box', 12.5, F2, 3); B.prop('trashcan', 1.2, F1, 5.2); B.prop('box', 13.5, 0.15, 5.2);
    for (const f of [0, 1, 2]) for (const x of [3, 7.5, 12]) B.box('panel', [x - 0.8, (f === 2 ? TOP - 0.26 : FL[f+1] - 0.26) - 0.02, 3.2], [x + 0.8, (f === 2 ? TOP - 0.26 : FL[f+1] - 0.26), 3.8], {solid:false});
  }
  // the edge: tall buildings all round, with dark tunnels where the streets leave
  const edge = (a, b) => { B.box('fB', a, b, {us:3}); B.solid([a[0], b[1], a[2]], [b[0], 34, b[2]]); };
  edge([-1,0,-1], [0,26,18]); edge([-1,0,26], [0,26,45]); edge([44,0,-1], [45,26,18]); edge([44,0,26], [45,26,45]);
  edge([0,0,-1], [18,26,0]); edge([26,0,-1], [44,26,0]); edge([0,0,44], [18,26,45]); edge([26,0,44], [44,26,45]);
  for (const [a,b] of [[[-1,0,18],[0,5,26]], [[44,0,18],[45,5,26]], [[18,0,-1],[26,5,0]], [[18,0,44],[26,5,45]]]){ B.box('tunnel', a, b); B.box('fA', [a[0],5,a[2]], [b[0],26,b[2]], {us:3}); B.solid([a[0],26,a[2]], [b[0],34,b[2]]); }
  const grp = B.finish(), nav = buildNav(B.solids, O, 44, 2, [0]);
  // ---- the cars ----
  const carCols = [0xd23a2a, 0x2a62c8, 0xf2c230, 0x2f9e55, 0xeeeeee, 0x7a3fb0];
  const makeCar = (col) => { const g = new T3.Group(), add = (geo, m, x, y, z) => { const o = new T3.Mesh(geo, m); o.position.set(x,y,z); g.add(o); return o; };
    const body = lam(col), dark = lam(0x1a1c20), glass = lam(0x7fa8c8), light = new T3.MeshBasicMaterial({color:0xfff6c8}), tail = new T3.MeshBasicMaterial({color:0xff2a1a});
    add(new T3.BoxGeometry(4.2, 0.7, 1.8), body, 0, 0.6, 0); add(new T3.BoxGeometry(2.2, 0.6, 1.6), body, -0.2, 1.25, 0); add(new T3.BoxGeometry(2.24, 0.46, 1.64), glass, -0.2, 1.25, 0);
    for (const [x,z] of [[1.35,0.85],[1.35,-0.85],[-1.35,0.85],[-1.35,-0.85]]) add(new T3.CylinderGeometry(0.36, 0.36, 0.25, 12), dark, x, 0.36, z).rotation.x = Math.PI/2;
    for (const z of [0.6,-0.6]){ add(new T3.BoxGeometry(0.05, 0.16, 0.34), light, 2.12, 0.72, z); add(new T3.BoxGeometry(0.05, 0.14, 0.3), tail, -2.12, 0.72, z); }
    g.visible = false; grp.add(g); return g; };
  const P = 10, SPD = 11;
  // lane: start point, direction, time offset
  const lanes = [[new V(-4, 0, 20.3), new V(1,0,0), 0], [new V(48, 0, 23.7), new V(-1,0,0), 0.4], [new V(23.7, 0, -4), new V(0,0,1), 5], [new V(20.3, 0, 48), new V(0,0,-1), 5.4]]
    .map(([s, d, off], i) => ({s:s.add(O), d, off, car:makeCar(carCols[i]), hitCD:0, honk:0}));
  let hitMeCD = 0;
  const sndCrash = () => { if (!AC) return; noiseHit(0.5, 700, 0.7, 0.9); noiseHit(0.2, 2400, 2, 0.5); tone('square', 300, 60, 0.3, 0.15); };
  const honk = (vol) => { if (!AC) return; const o = AC.createOscillator(), o2 = AC.createOscillator(), gg = AC.createGain(), t = AC.currentTime; o.type = o2.type = 'square'; o.frequency.value = 415; o2.frequency.value = 523;
    gg.gain.setValueAtTime(0.05*vol, t); gg.gain.setValueAtTime(0.05*vol, t+0.35); gg.gain.exponentialRampToValueAtTime(0.001, t+0.45); o.connect(gg); o2.connect(gg); gg.connect(AC.destination); o.start(t); o2.start(t); o.stop(t+0.5); o2.stop(t+0.5); };
  const roadIdea = (bot, imp) => { if (imp || R() > 0.35) return null; const t = (R() < 0.5 ? 4 + R()*12 : 28 + R()*12), alongX = R() < 0.5, back = R() < 0.5;
    let a = alongX ? new V(t, 0, 17.6) : new V(17.6, 0, t), b = alongX ? new V(t, 0, 26.4) : new V(26.4, 0, t); if (back){ const q = a; a = b; b = q; }
    return actWalk(a.clone().add(O), [], {then:(bt, failed) => { if (failed) return null; say(bt, pick(['why did the robot cross the road?','YOLO','last one across is rusty','run run run']));
      return actWalk(null, [b.clone().add(O)], {speed:1.7}); }}); };
  MAPS.city = {name:'CITY', O, botIdea:roadIdea, group:grp, spawn:new V(15.5, 0.15, 15.5).add(O), yaw:-Math.PI*0.75, nav, yMin:-5, yMax:36, props:B.props,
    sky:{bg:0x9ec9ea, fog:0xb4cbe0, near:14, far:60, hs:0xffffff, hg:0x8a8070, hi:1.0, ac:0xffffff, ai:0.3},
    update(dt, inGame){
      hitMeCD -= dt;
      const t = Date.now()/1000;
      for (const L of lanes){
        const s = (((t - L.off) % P) + P) % P*SPD, c = L.car;
        c.visible = s < 52; if (!c.visible) continue;
        const pos = L.s.clone().addScaledVector(L.d, s); c.position.copy(pos); c.rotation.y = Math.atan2(-L.d.z, L.d.x);
        if (!inGame) continue;
        const side = new V(-L.d.z, 0, L.d.x);
        const inCar = (p, pad) => { const r = p.clone().sub(pos); return Math.abs(r.dot(L.d)) < 2.2 + pad && Math.abs(r.dot(side)) < 0.95 + pad && p.y < 1.6 + pad; };
        // honk when you're standing in its way
        const head = loco.headPos(), ahead = head.clone().sub(pos);
        if (ahead.dot(L.d) > 0 && ahead.dot(L.d) < 14 && Math.abs(ahead.dot(side)) < 1.4 && clock - L.honk > 2){ L.honk = clock; honk(1); }
        if (hitMeCD <= 0 && (inCar(head, 0.15) || inCar(head.clone().add(new V(0,-0.8,0)), 0.15))){
          hitMeCD = 1.5; sndCrash(); pulse(0, 1, 250); pulse(1, 1, 250); spawnSparks(head, 40, 5);
          const away = Math.sign(ahead.dot(side)) || 1;
          loco.S.velocity.copy(L.d).multiplyScalar(SPD*1.15).addScaledVector(side, away*3).add(new V(0, 6, 0)); lastCombat = clock;
          const arms = [0,1].filter(i => !me.lost[i]);
          if (arms.length && R() < 0.3){ const i = pick(arms); me.lost[i] = true; release(i, true); hs[i] = {mode:'none'}; debris(handW[i], 0x3c4048); showMsg('Hit by a car! Your arm came off!'); }
          else showMsg('Hit by a car!');
        }
        // robots and loose pieces in the road
        for (const p of parts){
          if (p.parent || p.obj.userData.dead || !mine(p) || p.mode === 'held' || p.stuck) continue;
          const c2 = centerW(p); if (!inCar(c2, p.r)) continue;
          if (L.hitCD > clock && L.lastHit === p) continue; L.hitCD = clock + 0.4; L.lastHit = p;
          p.mode = 'free'; p.asleep = false; p.v.copy(L.d).multiplyScalar(SPD*1.1).add(new V((R()-0.5)*3, 4 + R()*3, (R()-0.5)*3)); p.w.set(R()-0.5, R()-0.5, R()-0.5).multiplyScalar(20);
          if (p.kids.length) detach(pick(p.kids), p.v.clone().add(new V(R()-0.5, 2, R()-0.5)));
          const b = p.bot; if (b && !b.dead && p === b.root){ say(b, pick(['SPLAT','I did not see the car','beep beep (me)','why is there traffic in here'])); }
          if (c2.distanceTo(lastPlayer) < 15){ sndCrash(); spawnSparks(c2, 30, 4); }
        }
      }
    }};
}

// ======================= CAVE =======================
// Quirk: torches. They light the place up, but stand in one too long and you catch fire (so do robots).
{
  const O = new V(0, 0, 300), B = mapBuilder(O, 'cave'); mapSeed = 9001;
  const rockT = tex(128, 128, (g,w,h) => { g.fillStyle = '#8a7e72'; g.fillRect(0,0,w,h); noiseFill(g, w, h, 3000, 'rgba(30,25,20,A)', 0.35, 3); noiseFill(g, w, h, 1500, 'rgba(200,190,170,A)', 0.18, 2);
    g.strokeStyle = 'rgba(40,32,26,.35)'; for (let i=0;i<30;i++){ g.beginPath(); g.moveTo(R()*w, R()*h); g.lineTo(R()*w, R()*h); g.stroke(); } });
  const rock = lam(0xffffff, {map:rockT, vertexColors:true});
  B.mat('rock', rock).mat('rock2', lam(0x9a8a78, {map:rockT, vertexColors:true})).mat('wood', lam(0x6b4423, {vertexColors:true})).mat('crystalA', new T3.MeshBasicMaterial({color:0x6fe8ff})).mat('crystalB', new T3.MeshBasicMaterial({color:0xc58bff}));
  const CH = 7;
  B.box('rock', [-2,-1,-2], [46,0,46], {us:3}); B.box('rock', [-2,CH,-2], [46,CH+1,46], {us:3});
  // old mine shafts: short timbered tunnels going off into the rock, with rails and a lantern
  const SH = [{side:'e', c:10}, {side:'n', c:30}, {side:'w', c:32}, {side:'s', c:15}], TWd = 2.4, THt = 2.7, TL = 7;
  const hole = side => SH.filter(t => t.side === side).map(t => [t.c - TWd/2, t.c + TWd/2, 0, THt]);
  B.wallRun(['rock'], 'z', -1, 45, -1, 0, 0, CH, hole('w'), 3); B.wallRun(['rock'], 'z', -1, 45, 44, 45, 0, CH, hole('e'), 3);
  B.wallRun(['rock'], 'x', 0, 44, -1, 0, 0, CH, hole('s'), 3); B.wallRun(['rock'], 'x', 0, 44, 44, 45, 0, CH, hole('n'), 3);
  const lanterns = [];
  B.mat('beam', lam(0x6b4a2b, {vertexColors:true})).mat('rail', lam(0x8a8f96, {vertexColors:true})).mat('lantern', new T3.MeshBasicMaterial({color:0xffc060}));
  for (const t of SH){
    // local frame: u runs into the rock, v across; (x, z) = f(u, v)
    const f = t.side === 'e' ? (u, v) => [44 + u, t.c + v] : t.side === 'w' ? (u, v) => [-u, t.c + v] : t.side === 'n' ? (u, v) => [t.c + v, 44 + u] : (u, v) => [t.c + v, -u];
    const bx = (k, u0, u1, v0, v1, y0, y1, o) => { const [ax, az] = f(u0, v0), [cx, cz] = f(u1, v1); B.box(k, [Math.min(ax, cx), y0, Math.min(az, cz)], [Math.max(ax, cx), y1, Math.max(az, cz)], o); };
    bx('rock', 2, TL + 1, -TWd/2 - 1, TWd/2 + 1, -1, 0, {us:3}); bx('rock', 0, TL + 1,          // (the cave floor already covers the first 2 m: starting there stops the floors overlapping)
      -TWd/2 - 1, TWd/2 + 1, THt, THt + 1, {us:3});
    bx('rock', 0, TL, -TWd/2 - 1, -TWd/2, 0, THt, {us:3}); bx('rock', 0, TL, TWd/2, TWd/2 + 1, 0, THt, {us:3}); bx('rock', TL, TL + 1, -TWd/2 - 1, TWd/2 + 1, 0, THt, {us:3});
    for (let u=0.3; u<TL; u+=1.6){ bx('beam', u, u + 0.18, -TWd/2, -TWd/2 + 0.18, 0, THt); bx('beam', u, u + 0.18, TWd/2 - 0.18, TWd/2, 0, THt); bx('beam', u, u + 0.18, -TWd/2, TWd/2, THt - 0.2, THt); }
    for (const v of [-0.35, 0.35]) bx('rail', -2, TL, v - 0.03, v + 0.03, 0, 0.06, {solid:false});
    for (let u=-1.8; u<TL; u+=0.5) bx('beam', u, u + 0.12, -0.5, 0.5, 0, 0.03, {solid:false});
    // rubble at the end
    for (let k=0;k<3;k++){ const [x, z] = f(TL - 0.6 - mr()*0.6, (mr()-0.5)*1.6); const rr = 0.3 + mr()*0.3; B.rock('rock2', [x - rr, 0, z - rr], [x + rr, rr*1.3, z + rr]); }
    const [lx, lz] = f(TL*0.55, 0); B.geo('lantern', new T3.BoxGeometry(0.12, 0.18, 0.12), lx, THt - 0.35, lz); lanterns.push(new V(lx, THt - 0.4, lz));
    const [px, pz] = f(2.2, 0.35); B.prop('box', px, 0, pz); const [qx, qz] = f(4, -0.3); B.prop('rock', qx, 0, qz);
  }
  // lumpy rock along the walls so they don't look flat
  for (let i=0;i<60;i++){ const t = 1 + mr()*42, side = Math.floor(mr()*4);
    if (SH.some(s_ => s_.side === ['s','e','n','w'][side] && Math.abs(s_.c - t) < 3.2)) continue;
    const _ = 0, w = 1.2 + mr()*2.4, d = 0.3 + mr()*0.9, y0 = mr() < 0.5 ? 0 : mr()*(CH - 2), h = 1 + mr()*2.4;
    if (side === 0) B.rock('rock2', [t - w/2, y0, 0], [t + w/2, y0 + h, d]); else if (side === 1) B.rock('rock2', [44 - d, y0, t - w/2], [44, y0 + h, t + w/2]);
    else if (side === 2) B.rock('rock2', [t - w/2, y0, 44 - d], [t + w/2, y0 + h, 44]); else B.rock('rock2', [0, y0, t - w/2], [d, y0 + h, t + w/2]); }
  // bumpy ceiling with stalactites
  { const g = new T3.PlaneGeometry(44, 44, 30, 30); g.rotateX(Math.PI/2); const p = g.attributes.position;
    for (let i=0;i<p.count;i++) p.setY(i, -(Math.sin(p.getX(i)*0.7)*Math.sin(p.getZ(i)*0.5) + 1)*0.14 - mr()*0.1);
    g.computeVertexNormals(); B.geo('rock', g, 22, CH - 0.02, 22); B.solid([-1, CH - 0.2, -1], [45, CH, 45]); }
  const taken = [[22, 22, 6]];
  const torches = [], crystals = [];
  // big pillars floor to ceiling
  for (let i=0;i<9;i++){ const r = 1.1 + mr()*1.1, p = placeFree(taken, 4, 40, 4, 40, r + 1.6); if (!p) continue;
    // a pillar is a stack of lumpy blocks, each one solid exactly where it's drawn
    // a stack of boulders; each one's collision is boxes fitted inside it, so you touch what you see
    const stack = [];
    for (let k=0;k<4;k++){ const R_ = r*(k % 2 ? 1.15 : 0.95), cx = p[0] + (mr()-0.5)*0.4, cy = k*2.1 + 0.6, cz = p[1] + (mr()-0.5)*0.4;
      B.geo('rock', new T3.DodecahedronGeometry(R_, 1), cx, cy, cz, 0, mr()*6, 0, 1, 1.3, 1);
      B.solids_(ellipsoidBoxes(cx, cy, cz, R_*1.0, R_*1.3*1.0, R_*1.0, 16)); stack.push([cx, cy, cz, R_]); (window.__pil = window.__pil || []).push([cx + O.x, cy, cz + O.z, R_]); }
    const [tx, ty, tz, tR] = stack[1], dy = 1.95 - ty, rad = tR*Math.sqrt(Math.max(0.2, 1 - (dy/(tR*1.3))**2)), a = mr()*6.283;
    const tv = new V(tx + Math.cos(a)*(rad + 0.12), 1.95, tz + Math.sin(a)*(rad + 0.12)).add(O); tv.wall = new V(Math.cos(a), 0, Math.sin(a)); torches.push(tv); }
  // ledges to climb on
  for (let i=0;i<7;i++){ const w = 2.5 + mr()*2.5, d = 2.5 + mr()*2, h = 0.9 + mr()*1.9, p = placeFree(taken, 3, 41, 3, 41, Math.max(w,d)/2 + 1); if (!p) continue;
    B.rock('rock', [p[0]-w/2, -0.1, p[1]-d/2], [p[0]+w/2, h, p[1]+d/2]);
    const w2 = w*0.55, d2 = d*0.55, sx = (mr() < 0.5 ? -1 : 1)*w*0.3, sz = (mr() < 0.5 ? -1 : 1)*d*0.3;
    B.rock('rock2', [p[0]+sx-w2/2, h - 0.15, p[1]+sz-d2/2], [p[0]+sx+w2/2, h + 0.5 + mr()*0.6, p[1]+sz+d2/2]); }
  // boulders and stalagmites
  for (let i=0;i<20;i++){ const r = 0.35 + mr()*0.7, p = placeFree(taken, 2, 42, 2, 42, r + 0.6); if (!p) continue;
    B.rock('rock2', [p[0]-r*(0.8 + mr()*0.3), -0.05, p[1]-r*(0.8 + mr()*0.3)], [p[0]+r*(0.8 + mr()*0.3), r*(1 + mr()*0.4), p[1]+r*(0.8 + mr()*0.3)]); }
  for (let i=0;i<24;i++){ const r = 0.2 + mr()*0.3, h = 0.8 + mr()*1.6, p = placeFree(taken, 2, 42, 2, 42, r + 0.5); if (!p) continue;
    B.geo('rock', new T3.ConeGeometry(r, h, 6), p[0], h/2, p[1]); B.solids_(coneBoxes(p[0], p[1], r*0.93, 0, h)); }
  for (let i=0;i<40;i++){ const r = 0.15 + mr()*0.35, h = 0.6 + mr()*1.8, x = 1 + mr()*42, z = 1 + mr()*42; B.geo('rock', new T3.ConeGeometry(r, h, 6), x, CH - 0.2 - h/2, z, Math.PI, 0, 0); B.solids_(coneBoxes(x, z, r*0.93, CH - 0.2, h, true)); }
  // glowing crystals
  for (let i=0;i<12;i++){ const p = placeFree(taken, 2, 42, 2, 42, 0.6); if (!p) continue; const k = mr() < 0.5 ? 'crystalA' : 'crystalB';
    for (let j=0;j<4;j++) B.geo(k, new T3.OctahedronGeometry(0.12 + mr()*0.12, 0), p[0] + (mr()-0.5)*0.5, 0.15 + mr()*0.25, p[1] + (mr()-0.5)*0.5, mr(), mr(), mr(), 1, 2.2, 1);
    B.solid([p[0]-0.18, 0, p[1]-0.18], [p[0]+0.18, 0.32, p[1]+0.18]);
    crystals.push({p:new V(p[0], 0.3, p[1]), c:k === 'crystalA' ? [0.25, 0.75, 1.0] : [0.7, 0.4, 1.0]}); }
  for (let i=0;i<14;i++){ const p = placeFree(taken.slice(), 3, 41, 3, 41, 0.3); if (p) B.prop(i % 3 ? 'rock' : 'crystal', p[0], 0, p[1]); }
  // torches along the walls too
  for (let i=0;i<10;i++){ const side = i % 4, t = 4 + (i*7.3) % 36; const n = [[0,0,1],[-1,0,0],[0,0,-1],[1,0,0]][side];
    const p = [[t, 1.75, 0.25], [43.75, 1.75, t], [t, 1.75, 43.75], [0.25, 1.75, t]][side]; const v = new V(...p).add(O); v.wall = new V(...n); torches.push(v); }
  for (const tp of torches){ const l = tp.clone().sub(O), w = tp.wall;
    B.geo('wood', new T3.CylinderGeometry(0.035, 0.03, 0.5, 6), l.x - w.x*0.12, l.y - 0.22, l.z - w.z*0.12, w.z*0.35, 0, -w.x*0.35); }
  // baked light: warm around every torch, a cold glow by the crystals, very dark everywhere else
  const light = (x, y, z) => { let r = 0.16, g = 0.13, b = 0.12;
    for (const t of torches){ const d = Math.hypot(x - t.x, y - t.y, z - t.z), k = 1.6*Math.exp(-d/2.6); r += k; g += k*0.62; b += k*0.3; }
    for (const c of crystals){ const d = Math.hypot(x - c.p.x - O.x, y - c.p.y, z - c.p.z - O.z), k = 0.8*Math.exp(-d/1.6); r += k*c.c[0]; g += k*c.c[1]; b += k*c.c[2]; }
    for (const l of lanterns){ const d = Math.hypot(x - l.x - O.x, y - l.y, z - l.z - O.z), k = 1.2*Math.exp(-d/2.2); r += k; g += k*0.7; b += k*0.35; }
    return [r, g, b]; };
  const grp = B.finish(light), nav = buildNav(B.solids, O, 44, 2, [0]);
  const glow = new T3.SpriteMaterial({map:flashTex, blending:T3.AdditiveBlending, depthWrite:false, transparent:true, fog:false, color:0xffb060});
  const glows = torches.map(t => { const s = new T3.Sprite(glow); s.position.copy(t).add(new V(0, 0.08, 0)); s.scale.setScalar(0.7); grp.add(s); return s; });
  const torchIdea = (bot, imp) => { if (imp || R() > 0.4) return null; const t = pick(torches), st = t.clone().add(t.wall.clone().multiplyScalar(1.05)).setY(0);
    return actWalk(st, [], {then:(b, failed) => failed ? null : actDo(6 + R()*6, (b2, tt) => { botYaw(b2, yawOf(t.clone().sub(b2.root.obj.position))); botLimbs(b2, 0, 0.3, j => -1.3 + Math.sin(tt*5 + j*2)*0.15);
      if (tt < 0.02) say(b2, pick(['toasty','ahh warm circuits','cozy','marshmallows anyone?'])); setFace(b2, 'happy'); })}); };
  MAPS.cave = {name:'CAVE', O, botIdea:torchIdea, group:grp, spawn:new V(22, 0, 22).add(O), yaw:0, nav, yMin:-5, yMax:CH + 1.5, props:B.props,
    sky:{bg:0x000000, fog:0x050302, near:4, far:22, hs:0xffd2a0, hg:0x302015, hi:0.65, ac:0xffd0a0, ai:0.34},
    update(dt, inGame){
      for (let i=0;i<torches.length;i++){
        const t = torches[i]; glows[i].scale.setScalar(0.6 + 0.15*Math.sin(clock*13 + i*3) + 0.1*R());
        if (t.distanceTo(lastPlayer) > 12) continue;
        if (R() < 0.35) emitFire(t.clone().add(new V((R()-0.5)*0.05, 0.02, (R()-0.5)*0.05)), new V((R()-0.5)*0.15, 0.5 + R()*0.4, (R()-0.5)*0.15), 0.035 + R()*0.02, 0.35 + R()*0.25);
        if (R() < 0.03) spawnSparks(t, 1, 1);
      }
      if (!inGame) return;
      fireHazard(dt, torches, 0.42);
    }};
}

// ======================= a playable piano keyboard (house, mansion) =======================
// Two octaves from middle C. Press the keys with your claws. s = 1: you stand on the -z side looking +z; s = -1: the +z side looking -z.
function pianoKeys(grp, O, PK, s, mapKey){
  const keys = [], wMat = lam(0xf6f2e6), bMat = lam(0x15151a), WN = 15, ww = (PK.x1 - PK.x0)/WN, wSemi = [0, 2, 4, 5, 7, 9, 11], D = PK.z1 - PK.z0;
  const kx = i => s > 0 ? PK.x1 - i*ww : PK.x0 + i*ww, back = f => s > 0 ? PK.z0 + D*f : PK.z1 - D*f, at = new V((PK.x0 + PK.x1)/2 + O.x, PK.y + 0.1, (PK.z0 + PK.z1)/2 + O.z), keyOn = [null, null];
  for (let i=0;i<WN;i++){ const a = kx(i), b = kx(i + 1), m = new T3.Mesh(new T3.BoxGeometry(ww - 0.006, 0.05, D), wMat); m.position.set((a + b)/2 + O.x, PK.y + 0.025, (PK.z0 + PK.z1)/2 + O.z); grp.add(m);
    keys.push({m, x0:Math.min(a, b), x1:Math.max(a, b), black:false, n:Math.floor(i/7)*12 + wSemi[i % 7], y0:m.position.y, t:0}); }
  for (let i=0;i<WN - 1;i++){ if ([2, 6].includes(i % 7)) continue; const cx = kx(i + 1), m = new T3.Mesh(new T3.BoxGeometry(ww*0.55, 0.05, D*0.6), bMat);
    m.position.set(cx + O.x, PK.y + 0.06, back(0.7) + O.z); grp.add(m); keys.push({m, x0:cx - ww*0.28, x1:cx + ww*0.28, black:true, n:Math.floor(i/7)*12 + wSemi[i % 7] + 1, y0:m.position.y, t:0}); }
  const playNote = (n, vol) => { if (!AC) return; const f = 261.63*Math.pow(2, n/12), t = AC.currentTime, g = AC.createGain(), lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
    for (const [type, mul, v] of [['triangle', 1, 0.6], ['sine', 2, 0.25], ['sine', 3, 0.1]]){ const o = AC.createOscillator(), og = AC.createGain(); o.type = type; o.frequency.value = f*mul; og.gain.value = v; o.connect(og); og.connect(lp); o.start(t); o.stop(t + 2.2); }
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22*vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.06*vol, t + 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.1); lp.connect(g); g.connect(AC.destination); };
  const press = (k, vol, local) => { k.t = 0.18; playNote(k.n, vol/(1 + at.distanceTo(lastPlayer)*0.15)); if (local && netGame) netSend('ev', {t:'mapev', m:mapKey, k:'note', i:keys.indexOf(k)}); };
  return {keys, play(i){ if (keys[i]) press(keys[i], 1, false); },
    update(dt, inGame){
      for (const k of keys){ if (k.t > 0) k.t -= dt; k.m.position.y = k.y0 - (k.t > 0 ? 0.022 : 0); k.m.rotation.x = k.t > 0 ? 0.08*s : 0; }
      if (!inGame) return;
      for (const i of [0, 1]){
        const h = handW[i], hz = h.z - O.z, x = h.x - O.x; let hit = null;
        if (!me.lost[i] && hz > PK.z0 - (s > 0 ? 0.06 : 0) && hz < PK.z1 + (s < 0 ? 0.06 : 0) && h.y < PK.y + 0.12 && h.y > PK.y - 0.16)
          hit = keys.find(k => k.black && (hz - back(0.4))*s > 0 && h.y > PK.y + 0.04 && x > k.x0 && x < k.x1) || keys.find(k => !k.black && x > k.x0 && x < k.x1) || null;
        if (hit && hit !== keyOn[i]){ press(hit, Math.min(1.4, 0.5 + hv[i].length()*0.4), true); pulse(i, 0.3, 25); }
        keyOn[i] = hit;
      } },
    // a robot playing: press key i (everyone hears it, the robot's owner sends it)
    botPress(i, local){ if (keys[i]) press(keys[i], 0.8, local); } };
}

// ======================= robots doing things =======================
// A map can give its robots things to do: MAPS[k].botIdea(bot, imp) returns an activity (or null).
// An activity is {step(bot, dt) -> true while it's still going, then(bot, failed) -> the next one, cancel(bot)}.
// Robots run them from their own update; being grabbed, knocked over or set on fire cancels the chain.
const botLegsOn = bot => bot.legs.filter(l => l.parent === bot.root).length;
// legs: rotation.x (forward is negative), arms: zz = how far out/up to the side, xx = how far forward (negative)
function botLimbs(bot, legs, zz, xx){ const r = bot.root, f = (v, j) => typeof v === 'function' ? v(j) : v;
  bot.legs.forEach((l, j) => { if (l.parent === r && !isStretched(l)) l.obj.rotation.x = f(legs, j); });
  bot.ups.forEach((u, j) => { if (u.parent === r && !isStretched(u)){ u.obj.rotation.z = (j ? 1 : -1)*f(zz, j); u.obj.rotation.x = f(xx || 0, j); } }); }
function botYaw(bot, yaw, dt){ const q = bot.root.obj.quaternion, e = new T3.Euler().setFromQuaternion(q, 'YXZ'); let d = yaw - e.y; d = Math.atan2(Math.sin(d), Math.cos(d));
  q.setFromEuler(new T3.Euler(0, dt == null ? yaw : e.y + d*Math.min(1, dt*8), 0, 'YXZ')); }
const yawOf = dir => Math.atan2(dir.x, dir.z);
function botLevel(y){ let l = 0; for (let k=0;k<NAV.lv.length;k++) if (y >= NAV.lv[k] - 0.3) l = k; return l; }
// back on its feet, on the robots' grid, where it stands
function botSettle(bot){ const r = bot.root, pos = r.obj.position, sk = r.szK || 1, e = new T3.Euler().setFromQuaternion(r.obj.quaternion, 'YXZ');
  r.obj.quaternion.setFromEuler(new T3.Euler(0, e.y, 0, 'YXZ')); bot.ups.forEach(u => { if (u.parent === r) u.obj.rotation.x = 0; });
  const l = botLevel(pos.y - STAND*sk), c = reachableCell(pos, l) || reachableCell(cellPos(...cellOf(pos)), l) || cellOf(pos);
  bot.cell = c; bot.target = cellPos(...c); bot.prev = null; }
// walk: along the grid to `goal` (a world point, its y = the floor it's on), then straight through `pts` (stairs and so on).
// o: speed, each(bot, dt, dir) every step, then, cancel, ptsFn(bot) -> pts worked out on arrival
function actWalk(goal, pts, o){ o = o || {}; let path = null, pi = 0, k = 0, seg = -1, sx = 0, sz = 0, sy = 0, sL = 1, cy = null;
  const a = {then:o.then, cancel:o.cancel, step(bot, dt){
    const r = bot.root, pos = r.obj.position, sk = r.szK || 1, legs = botLegsOn(bot);
    if (!legs){ a.failed = true; return false; }
    if (cy == null) cy = bot.cell ? NAV.lv[bot.cell[2]] : pos.y - STAND*sk;
    if (!path){ path = [];
      if (goal){ const l = botLevel(goal.y + 0.05), gc = reachableCell(new V(goal.x, NAV.lv[l] + STAND, goal.z), l), sc = bot.cell && bot.cell[2] === l ? bot.cell : reachableCell(pos, l);
        if (!gc || !sc){ a.failed = true; return false; } const pp = navPath(sc, gc); if (!pp){ a.failed = true; return false; } path = pp; } }
    if (pi >= path.length && o.ptsFn){ pts = o.ptsFn(bot) || []; o.ptsFn = null; }
    let tgt, ty; if (pi < path.length){ tgt = cellPos(...path[pi]); ty = NAV.lv[path[pi][2]]; } else if (pts && k < pts.length){ tgt = pts[k]; ty = pts[k].y; } else return false;
    const si = pi*1000 + k; if (si !== seg){ seg = si; sx = pos.x; sz = pos.z; sy = cy; sL = Math.max(0.01, Math.hypot(tgt.x - pos.x, tgt.z - pos.z)); }
    const to = new V(tgt.x - pos.x, 0, tgt.z - pos.z), d = to.length(), spd = bot.speed*(o.speed || 0.55)*(legs === 2 ? 1 : 0.55)*Math.sqrt(sk)*dt;
    if (d <= spd + 1e-3){ pos.x = tgt.x; pos.z = tgt.z; cy = ty; if (pi < path.length){ bot.cell = path[pi]; pi++; } else k++; }
    else { to.normalize(); pos.x += to.x*spd; pos.z += to.z*spd; botYaw(bot, yawOf(to), dt); cy = sy + (ty - sy)*Math.min(1, Math.max(0, 1 - (d - spd)/sL)); if (o.each) o.each(bot, dt, to, spd/dt); }
    const ph = bot.t*7; pos.y = cy + STAND*sk + Math.abs(Math.sin(ph))*0.05*sk;
    if (!o.limbs) botLimbs(bot, j => (j ? -1 : 1)*Math.sin(ph)*0.7, j => 0.2 + Math.sin(ph + j)*0.15); else o.limbs(bot, ph);
    return true; } };
  return a; }
// do something on the spot for a while: fn(bot, t, dt) every frame
function actDo(dur, fn, o){ o = o || {}; let t = 0; return {then:o.then, cancel:o.cancel, step(bot, dt){ t += dt; fn(bot, t, dt); return t < dur; }}; }
// take a flight of stairs: stairs = [{lo, hi, bottom:[x,y,z], pts:[[x,y,z]...]}] from bottom (on level lo) up to level hi
function actStairs(stairs, bot, up, then){ const l = bot.cell ? bot.cell[2] : botLevel(bot.root.obj.position.y - STAND);
  const st = stairs.filter(q => up ? q.lo === l : q.hi === l); if (!st.length) return null; const q = pick(st);
  const P = q.pts.map(v => new V(v[0] + MAPS_O().x, v[1], v[2] + MAPS_O().z)), bot0 = new V(q.bottom[0] + MAPS_O().x, q.bottom[1], q.bottom[2] + MAPS_O().z);
  return up ? actWalk(bot0, P, {then}) : actWalk(P[P.length - 1], P.slice(0, -1).reverse().concat([bot0]), {then}); }
const MAPS_O = () => MAPS[curMap].O || new V();
// go to floor `want` (taking stairs one flight at a time), then do `then`
function actToLevel(stairs, bot, want, then){ const l = bot.cell ? bot.cell[2] : botLevel(bot.root.obj.position.y - STAND); if (l === want) return then(bot);
  return actStairs(stairs, bot, want > l, (b, failed) => failed ? null : actToLevel(stairs, b, want, then)); }

// ======================= HOUSE =======================
// Three floors (basement, ground, upstairs), furnished. Quirk: a robot vacuum does its rounds downstairs
// and sucks up any robot bits lying on the floor (and bumps into robots). Don't let it find a mine.
{
  const O = new V(0, 0, 400), B = mapBuilder(O, 'house'); mapSeed = 31337;
  const grass = tex(256, 256, (g,w,h) => { g.fillStyle = '#5a9a3c'; g.fillRect(0,0,w,h); noiseFill(g, w, h, 6000, 'rgba(20,60,10,A)', 0.3); noiseFill(g, w, h, 3000, 'rgba(170,220,90,A)', 0.2); });
  const woodF = tex(256, 256, (g,w,h) => { for (let y=0;y<h;y+=32){ g.fillStyle = `hsl(30,${40+R()*15}%,${38+R()*10}%)`; g.fillRect(0,y,w,32); g.fillStyle = 'rgba(40,20,5,.5)'; g.fillRect(0,y,w,2); const x = R()*w; g.fillRect(x,y,2,32); }
    noiseFill(g, w, h, 2000, 'rgba(60,30,10,A)', 0.12, 2); });
  const paper = (a, b) => tex(128, 128, (g,w,h) => { g.fillStyle = a; g.fillRect(0,0,w,h); g.fillStyle = b; for (let x=0;x<w;x+=32) g.fillRect(x, 0, 12, h); for (let y=16;y<h;y+=32) for (let x=22;x<w;x+=32){ g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); } });
  const tileT = tex(128, 128, (g,w,h) => { g.fillStyle = '#e9eef0'; g.fillRect(0,0,w,h); g.strokeStyle = '#a9b4ba'; g.lineWidth = 2; for (let k=0;k<=w;k+=32){ g.beginPath(); g.moveTo(k,0); g.lineTo(k,h); g.moveTo(0,k); g.lineTo(w,k); g.stroke(); } });
  const concrete = tex(128, 128, (g,w,h) => { g.fillStyle = '#8f8d88'; g.fillRect(0,0,w,h); noiseFill(g, w, h, 3000, 'rgba(40,40,40,A)', 0.2, 2); noiseFill(g, w, h, 600, 'rgba(230,230,220,A)', 0.15, 3); });
  const siding = tex(128, 128, (g,w,h) => { g.fillStyle = '#e8dcc0'; g.fillRect(0,0,w,h); g.fillStyle = 'rgba(120,100,70,.35)'; for (let y=0;y<h;y+=16) g.fillRect(0, y, w, 2); });
  const rugT = tex(128, 128, (g,w,h) => { g.fillStyle = '#a33b3b'; g.fillRect(0,0,w,h); g.strokeStyle = '#e8c070'; g.lineWidth = 6; g.strokeRect(10,10,w-20,h-20); g.strokeRect(30,30,w-60,h-60); g.fillStyle = '#2c4a7a'; g.beginPath(); g.arc(w/2,h/2,18,0,7); g.fill(); });
  const fence = tex(128, 64, (g,w,h) => { g.fillStyle = '#c9a77a'; g.fillRect(0,0,w,h); g.fillStyle = 'rgba(80,55,30,.6)'; for (let x=0;x<w;x+=16) g.fillRect(x, 0, 2, h); });
  const art = (draw) => canvasTex(128, 96, (g,w,h) => { g.fillStyle = '#5a3a1e'; g.fillRect(0,0,w,h); g.save(); g.beginPath(); g.rect(8,8,w-16,h-16); g.clip(); draw(g, w, h); g.restore(); });
  const tvT = canvasTex(128, 80, (g,w,h) => { g.fillStyle = '#123'; g.fillRect(0,0,w,h); g.fillStyle = '#6fd3ff'; g.font = 'bold 20px monospace'; g.fillText('BEEP', 40, 34); g.fillStyle = '#ffd23d'; g.fillText('BOOP', 40, 60); });
  B.mat('grass', lam(0xffffff, {map:grass})).mat('fence', lam(0xffffff, {map:fence})).mat('siding', lam(0xffffff, {map:siding})).mat('woodF', lam(0xffffff, {map:woodF}))
   .mat('paperA', lam(0xffffff, {map:paper('#e9dcbc', '#dccca4')})).mat('paperB', lam(0xffffff, {map:paper('#cfe0e8', '#bcd2dc')})).mat('conc', lam(0xffffff, {map:concrete})).mat('tile', lam(0xffffff, {map:tileT}))
   .mat('ceil', lam(0xf4f1ea)).mat('roof', lam(0x6a6e73)).mat('rug', lam(0xffffff, {map:rugT})).mat('path', lam(0x8f8a80)).mat('trim', lam(0xf8f6f0))
   .mat('wood', lam(0x8a5a32)).mat('darkwood', lam(0x4e3220)).mat('fabric', lam(0x4f6d8f)).mat('fabric2', lam(0x9a4f5f)).mat('white', lam(0xf2f2ee)).mat('metal', lam(0x9aa0a6)).mat('black', lam(0x1c1d20))
   .mat('red', lam(0xc8302a)).mat('blue', lam(0x2f62c8)).mat('yellow', lam(0xf2c230)).mat('green', lam(0x3f9a4a)).mat('pillow', lam(0xfbf8f0)).mat('lamp', new T3.MeshBasicMaterial({color:0xfff4d0}))
   .mat('glow', new T3.MeshBasicMaterial({color:0xff7a20})).mat('tv', new T3.MeshBasicMaterial({map:tvT})).mat('brick', lam(0x9a4a36)).mat('leaf', lam(0x3f8f3a)).mat('bark', lam(0x5d4027)).mat('cardboard', lam(0xc09a62)).mat('mirror', new T3.MeshBasicMaterial({color:0xbfd4dc}));
  const arts = [art((g,w,h) => { g.fillStyle = '#8cc8f0'; g.fillRect(0,0,w,h); g.fillStyle = '#ffd23d'; g.beginPath(); g.arc(90,30,14,0,7); g.fill(); g.fillStyle = '#4a8a3a'; g.beginPath(); g.moveTo(0,h); g.lineTo(40,40); g.lineTo(80,h); g.fill(); }),
    art((g,w,h) => { g.fillStyle = '#f2e8d0'; g.fillRect(0,0,w,h); g.fillStyle = '#e07a5f'; g.fillRect(20,20,40,40); g.fillStyle = '#3d405b'; g.beginPath(); g.arc(80,55,22,0,7); g.fill(); }),
    art((g,w,h) => { g.fillStyle = '#20304a'; g.fillRect(0,0,w,h); g.fillStyle = '#f3f0e6'; g.fillRect(46,24,36,30); g.fillStyle = '#6fd3ff'; g.fillRect(52,30,24,16); g.fillStyle = '#f3f0e6'; g.fillRect(56,56,16,20); })];
  arts.forEach((t, i) => B.mat('art' + i, lam(0xffffff, {map:t})));
  // ---- ground, yard, fence ----
  const FX0 = 8, FX1 = 36, FZ0 = 12, FZ1 = 32, T = 0.3, L = [-3, 0, 3], CEIL = 2.75;
  B.box('grass', [-2,-1,-2], [46,0,FZ0], {us:3}); B.box('grass', [-2,-1,FZ1], [46,0,46], {us:3}); B.box('grass', [-2,-1,FZ0], [FX0,0,FZ1], {us:3}); B.box('grass', [FX1,-1,FZ0], [46,0,FZ1], {us:3});
  B.box('path', [21, 0, 0], [23, 0.01, FZ0], {solid:false});
  for (const [a,b] of [[[-1,0,-1],[0,1.6,45]], [[44,0,-1],[45,1.6,45]], [[0,0,-1],[44,1.6,0]], [[0,0,44],[44,1.6,45]]]){ B.box('fence', a, b, {us:2}); B.solid([a[0],1.6,a[2]], [b[0],14,b[2]]); }
  for (const [x,z,s] of [[4,6,1],[39,5,1.2],[5,38,1.1],[40,39,0.9],[15,40,1]]){ B.cyl('bark', 0.35*s, 0.25*s, 3.4*s, x, 0, z, 7);
    B.ball('leaf', new T3.IcosahedronGeometry(1, 1), x, 4.1*s, z, 1.8*s, 1.8*s, 1.8*s); }
  const wallRun = B.wallRun;
  // outer walls, per floor (inside paper changes per floor), with windows and the front door
  const floorKey = ['conc', 'paperA', 'paperB'];
  for (let f=0;f<3;f++){
    const y0 = L[f] - (f === 0 ? 0.6 : 0.25), y1 = f === 2 ? 6.0 : L[f+1] - 0.25, k = floorKey[f];          // floors' wall bands meet, never overlap
    const win = f === 0 ? [] : [[0.9, 1.0 + L[f], 2.1 + L[f]]];
    const xs = f === 0 ? [] : [11, 15, 28, 32].map(x => [x, x + 1.4, L[f] + 0.9, L[f] + 2.1, true]);
    const zs = f === 0 ? [] : [15, 19, 26].map(z => [z, z + 1.4, L[f] + 0.9, L[f] + 2.1, true]);
    const front = xs.concat(f === 1 ? [[21, 23, L[1], L[1] + 2.2]] : []);
    wallRun([k], 'x', FX0, FX1, FZ0, FZ0 + T, y0, y1, front); wallRun([k], 'x', FX0, FX1, FZ1 - T, FZ1, y0, y1, xs);
    wallRun([k], 'z', FZ0 + T, FZ1 - T, FX0, FX0 + T, y0, y1, zs); wallRun([k], 'z', FZ0 + T, FZ1 - T, FX1 - T, FX1, y0, y1, zs);
    if (f > 0){ // siding skin outside (visual only)
      const nog = l => l.map(h => h.slice(0, 4));
      wallRun(['siding'], 'x', FX0 - 0.02, FX1 + 0.02, FZ0 - 0.02, FZ0, y0 < 0 ? 0 : y0, y1, nog(front)); wallRun(['siding'], 'x', FX0 - 0.02, FX1 + 0.02, FZ1, FZ1 + 0.02, y0 < 0 ? 0 : y0, y1, nog(xs));
      wallRun(['siding'], 'z', FZ0, FZ1, FX0 - 0.02, FX0, y0 < 0 ? 0 : y0, y1, nog(zs)); wallRun(['siding'], 'z', FZ0, FZ1, FX1, FX1 + 0.02, y0 < 0 ? 0 : y0, y1, nog(zs));
      for (const o of [...front, ...xs]) if (o[1] - o[0] < 2) for (const zz of [FZ0 - 0.06, FZ1 - 0.02]) B.box('trim', [o[0]-0.06, o[2]-0.08, zz], [o[1]+0.06, o[2], zz + 0.08], {solid:false});
    }
  }
  // floors (with stair holes) and ceilings
  const UPH = [8.3, 10.5, 23.5, FZ1 - T], DNH = [10.5, 12.9, 23.5, FZ1 - T];    // holes: x0,x1,z0,z1
  const slab = (y, hole, top, bot) => { const parts_ = hole ? [[FX0, hole[0], FZ0, FZ1], [hole[1], FX1, FZ0, FZ1], [hole[0], hole[1], FZ0, hole[2]], [hole[0], hole[1], hole[3], FZ1]] : [[FX0, FX1, FZ0, FZ1]];
    for (const [x0, x1, z0, z1] of parts_){ if (x1 - x0 < 0.01 || z1 - z0 < 0.01) continue; B.box(top, [x0, y - 0.25, z0], [x1, y, z1], {us:2, skip:['y-','x+','x-','z+','z-']}); B.box(bot, [x0, y - 0.25, z0], [x1, y, z1], {us:2, skip:['y+'], solid:false}); } };
  B.box('conc', [FX0, -3.6, FZ0], [FX1, -3, FZ1], {us:2});
  slab(0, DNH, 'woodF', 'ceil'); slab(3, UPH, 'woodF', 'ceil'); slab(6, null, 'roof', 'ceil');
  // flat roof: parapet and a chimney to climb on
  for (const [a,b] of [[[FX0,6,FZ0],[FX1,6.5,FZ0+0.25]], [[FX0,6,FZ1-0.25],[FX1,6.5,FZ1]], [[FX0,6,FZ0],[FX0+0.25,6.5,FZ1]], [[FX1-0.25,6,FZ0],[FX1,6.5,FZ1]]]) B.box('siding', a, b);
  B.box('brick', [17.5, 6, 29.6], [19.5, 7.8, 31.6]);
  // stairs: both start in the hallway (z 23.6) and run toward the back wall: up to the top floor, down to the basement.
  // 12 solid steps each, 25 cm high, with a tread on top
  for (let i=0;i<12;i++){ const za = 23.6 + i*8/12, zb = za + 8/12;
    B.box('wood', [8.35, 0, za], [10.3, (i+1)*0.25 - 0.03, zb]); B.box('darkwood', [8.33, (i+1)*0.25 - 0.03, za - 0.02], [10.32, (i+1)*0.25, zb]);
    B.box('wood', [10.7, -3, za], [12.8, -(i+1)*0.25 - 0.03, zb]); B.box('darkwood', [10.68, -(i+1)*0.25 - 0.03, za - 0.02], [12.82, -(i+1)*0.25, zb]); }
  // railings (with a gap at the top of each flight to step off)
  const rail = (a, b) => B.box('darkwood', a, b);
  rail([10.4, 0, 24.6], [10.55, 1.0, 31.6]); rail([12.85, 0, 23.6], [13.0, 1.0, 29.6]); rail([10.45, 3, 23.6], [10.6, 4.0, 29.6]); rail([8.3, 3, 23.4], [10.6, 4.0, 23.55]);
  // interior walls (gaps are doorways)
  const iw = (axis, c0, c1, at, f, gaps) => wallRun([floorKey[f]], axis, c0, c1, at - 0.08, at + 0.08, L[f], L[f] + CEIL, (gaps || []).map(([a, b]) => [a, b, L[f], L[f] + 2.15]));
  iw('z', FZ0 + T, 23.5, 18, 1, [[16, 17.6]]); iw('z', FZ0 + T, 23.5, 26, 1, [[16, 17.6]]);
  iw('x', 13, 18, 23.5, 1, []); iw('x', 18, 26, 23.5, 1, [[21, 23]]); iw('x', 26, FX1 - T, 23.5, 1, [[29, 30.6]]);
  iw('x', FX0 + T, FX1 - T, 21, 2, [[12, 13.4], [20, 21.4], [28, 29.4]]); iw('z', FZ0 + T, 21, 18, 2); iw('z', FZ0 + T, 21, 24, 2);
  iw('x', 10.6, FX1 - T, 23.5, 2, [[16, 17.4], [29, 30.4]]); iw('z', 23.5, FZ1 - T, 24, 2);
  iw('z', FZ0 + T, 26, 22, 0, [[18, 19.6]]);
  // ---- furniture ----
  // f(key, x, y, z, w, h, d, solid): a box sitting at (x, y, z) = centre of its base
  const f = (k, x, y, z, w, h, d, solid) => B.box(k, [x - w/2, y, z - d/2], [x + w/2, y + h, z + d/2], {us:1, solid:solid !== false});
  const ceilingLight = (x, z, y) => f('lamp', x, y - 0.03, z, 1.0, 0.03, 0.5, false);
  // pictures and screens are flat planes facing into the room (ry: which way they face)
  const pic = (i, x, y, z, ry) => B.geo('art' + i, new T3.PlaneGeometry(1.2, 0.9), x, y + 0.45, z, 0, ry, 0);
  const couch = (x, y, z, rot, k) => { const W = 2.2, D = 0.9; if (rot % 2 === 0){ f(k, x, y, z, W, 0.45, D); const bz = z + (rot ? 0.35 : -0.35); f(k, x, y + 0.45, bz, W, 0.45, 0.2); f(k, x - W/2 + 0.1, y + 0.45, z, 0.2, 0.25, D); f(k, x + W/2 - 0.1, y + 0.45, z, 0.2, 0.25, D); }
    else { f(k, x, y, z, D, 0.45, W); const bx = x + (rot === 1 ? -0.35 : 0.35); f(k, bx, y + 0.45, z, 0.2, 0.45, W); f(k, x, y + 0.45, z - W/2 + 0.1, D, 0.25, 0.2); f(k, x, y + 0.45, z + W/2 - 0.1, D, 0.25, 0.2); } };
  const chair = (x, y, z, rot) => { f('wood', x, y + 0.42, z, 0.44, 0.05, 0.44); for (const [sx, sz] of [[-1,-1],[1,-1],[-1,1],[1,1]]) f('wood', x + sx*0.19, y, z + sz*0.19, 0.04, 0.42, 0.04, false);
    const [bx, bz, bw, bd] = [[0, 0.2, 0.44, 0.05], [0.2, 0, 0.05, 0.44], [0, -0.2, 0.44, 0.05], [-0.2, 0, 0.05, 0.44]][rot]; f('wood', x + bx, y + 0.47, z + bz, bw, 0.45, bd); };
  const shelf = (x, y, z, w, d, h, rotX) => { f('darkwood', x, y, z, w, h, d); const cols = ['red','blue','yellow','green','white'];
    for (let r=0;r<4;r++) for (let i=0;i<8;i++){ const bw = 0.07 + mr()*0.05, bh = 0.2 + mr()*0.12; if (rotX) f(cols[(i + r) % 5], x - w/2 + 0.1 + i*(w - 0.2)/8, y + 0.15 + r*h/4.3, z + (d/2 + 0.02)*rotX, bw, bh, 0.04, false);
      else f(cols[(i + r) % 5], x + (w/2 + 0.02), y + 0.15 + r*h/4.3, z - d/2 + 0.1 + i*(d - 0.2)/8, 0.04, bh, bw, false); } };
  const bed = (x, y, z, w, l, k) => { f('darkwood', x, y, z, w, 0.35, l); f('pillow', x, y + 0.35, z, w - 0.1, 0.2, l - 0.1, false); f(k, x, y + 0.42, z + 0.27, w - 0.05, 0.16, l - 0.56, false); f('pillow', x, y + 0.55, z - l/2 + 0.3, w - 0.4, 0.14, 0.35, false); f('darkwood', x, y, z - l/2 + 0.05, w, 1.0, 0.1); };
  const plant = (x, y, z) => { B.cyl('cardboard', 0.15, 0.2, 0.35, x, y, z, 8); B.ball('leaf', new T3.IcosahedronGeometry(1, 0), x, y + 0.65, z, 0.4, 0.4, 0.4, 3); };
  const lampStand = (x, y, z) => { f('metal', x, y, z, 0.05, 1.4, 0.05); B.cyl('lamp', 0.25, 0.15, 0.3, x, y + 1.4, z, 10); f('metal', x, y, z, 0.3, 0.04, 0.3); };
  // ground floor: living room (west), hall, kitchen (east), dining/den (back)
  f('rug', 13, 0, 17.6, 4, 0.01, 3, false);
  couch(13.4, 0, 21.9, 2, 'fabric'); f('wood', 13.4, 0, 18.4, 1.4, 0.42, 0.7);
  f('darkwood', 13.4, 0, 13.0, 2.0, 0.55, 0.5); f('black', 13.4, 0.55, 13.0, 1.6, 0.9, 0.08); B.geo('black', new T3.PlaneGeometry(1.5, 0.8), 13.4, 1.0, 13.045, 0, 0, 0);
  shelf(8.75, 0, 16.5, 0.4, 1.8, 2.0, 0); couch(9.6, 0, 19.6, 1, 'fabric2'); plant(17.2, 0, 13.0); lampStand(17.3, 0, 22.8);
  pic(0, 13.4, 1.5, 23.4, Math.PI); pic(1, 8.33, 1.4, 20.6, Math.PI/2);
  f('darkwood', 19, 0, 13.0, 1.2, 0.5, 0.4); plant(25.2, 0, 13.0); f('rug', 22, 0, 17, 2, 0.01, 6, false); pic(2, 18.1, 1.4, 20.5, Math.PI/2);
  // kitchen
  f('wood', 35.2, 0, 16.5, 0.9, 0.9, 7.0); f('white', 35.2, 0.9, 16.5, 0.92, 0.04, 7.02, false); f('metal', 35.2, 0.92, 15.0, 0.6, 0.02, 0.5, false);
  f('black', 35.2, 0.92, 18.2, 0.6, 0.02, 0.6, false); for (const dz of [-0.15, 0.15]) for (const dx of [-0.15, 0.15]) B.geo('red', new T3.CylinderGeometry(0.08, 0.08, 0.012, 10), 35.2 + dx, 0.94, 18.2 + dz);
  f('white', 35.1, 0, 21.6, 0.9, 2.0, 0.9); f('wood', 35.5, 1.6, 16.5, 0.4, 0.7, 7.0);
  f('wood', 30, 0, 17, 2.2, 0.76, 1.2); for (const [cx, cz, r] of [[29.4, 16.0, 2], [30.6, 16.0, 2], [29.4, 18.0, 0], [30.6, 18.0, 0]]) chair(cx, 0, cz, r);
  // back room: long table, piano, fireplace
  f('wood', 24, 0, 27.6, 4.6, 0.76, 1.2); for (let i=0;i<3;i++){ chair(22.4 + i*1.6, 0, 26.4, 2); chair(22.4 + i*1.6, 0, 28.8, 0); }
  f('black', 33.5, 0, 30.6, 1.6, 1.2, 0.7); f('black', 33.5, 0, 30.15, 1.6, 0.6, 0.25); f('black', 33.5, 0.6, 30.16, 1.6, 0.12, 0.22); f('black', 32.65, 0.72, 30.15, 0.1, 0.16, 0.25); f('black', 34.35, 0.72, 30.15, 0.1, 0.16, 0.25);          // the key bed holds the keys up
  f('brick', 18.5, 0, 31.3, 2.0, 1.4, 0.5); f('black', 18.5, 0.1, 31.05, 1.2, 0.8, 0.02, false); for (let i=0;i<5;i++) B.geo('glow', new T3.DodecahedronGeometry(0.1, 0), 18.0 + i*0.25, 0.2, 31.2);
  shelf(15, 0, 31.4, 1.8, 0.4, 2.0, -1); pic(0, 28, 1.4, 31.68, Math.PI);
  // upstairs: bedroom 1, bathroom, bedroom 2, game room, kids' room
  const U = 3;
  bed(11.5, U, 15.0, 1.8, 2.1, 'fabric'); f('wood', 10.2, U, 13.2, 0.5, 0.55, 0.5); f('wood', 12.8, U, 13.2, 0.5, 0.55, 0.5); lampStand(12.8, U + 0.55, 13.2);
  f('darkwood', 17.2, U, 13.6, 1.1, 2.0, 0.6); f('wood', 16.8, U, 19.6, 1.4, 0.75, 0.6); chair(16.8, U, 19.0, 2); f('rug', 13, U, 17.5, 2.5, 0.01, 2, false); pic(1, 8.33, U + 1.3, 17.5, Math.PI/2);
  B.box('tile', [18.1, U, FZ0 + T], [23.9, U + 0.01, 20.9], {solid:false, us:0.6});
  f('white', 21, U, 13.2, 1.8, 0.6, 0.8); f('blue', 21, U + 0.45, 13.2, 1.6, 0.02, 0.6, false);
  f('white', 19.0, U, 20.3, 0.45, 0.45, 0.55); f('white', 19.0, U + 0.45, 20.65, 0.45, 0.4, 0.2); f('white', 22.8, U, 20.55, 0.6, 0.85, 0.5); B.box('mirror', [22.4, U + 1.2, 20.86], [23.2, U + 2.0, 20.9], {solid:false});
  bed(31.5, U, 15.0, 1.6, 2.1, 'fabric2'); f('darkwood', 26.2, U, 13.6, 1.1, 2.0, 0.6); f('wood', 34.9, U, 19.5, 0.6, 0.9, 1.4); B.ball('yellow', new T3.SphereGeometry(1, 12, 8), 27.5, U + 0.3, 19.0, 0.5, 0.3, 0.5, 3);
  f('green', 17, U, 27.6, 2.7, 0.76, 1.5); f('white', 17, U + 0.76, 27.6, 0.02, 0.15, 1.5, false); f('black', 22.9, U, 30.9, 0.8, 1.8, 0.7); B.geo('tv', new T3.PlaneGeometry(0.6, 0.45), 22.9, U + 1.25, 30.54, 0, Math.PI, 0);
  couch(13.4, U, 30.8, 2, 'fabric');
  f('darkwood', 34.6, U, 27.2, 1.1, 0.12, 2.1); f('darkwood', 34.6, U + 1.25, 27.2, 1.1, 0.12, 2.1); for (const dz of [-1, 1]) f('darkwood', 35.1, U, 27.2 + dz, 0.08, 2.0, 0.08);
  f('pillow', 34.6, U + 0.12, 27.2, 1.0, 0.15, 2.0, false); f('pillow', 34.6, U + 1.37, 27.2, 1.0, 0.15, 2.0, false);
  for (let i=0;i<10;i++) f(['red','blue','yellow','green'][i % 4], 27 + mr()*5, U, 25 + mr()*5, 0.3, 0.3, 0.3);
  f('wood', 25.0, U, 30.9, 1.2, 0.6, 0.6);
  // basement: laundry, storage boxes, workbench, water heater, old couch
  const D = -3;
  f('white', 24, D, 13.0, 0.7, 0.9, 0.7); f('white', 24.8, D, 13.0, 0.7, 0.9, 0.7); for (const x of [24, 24.8]) B.geo('black', new T3.CylinderGeometry(0.22, 0.22, 0.02, 14), x, D + 0.5, 13.36, Math.PI/2);
  B.cyl('metal', 0.3, 0.3, 1.6, 34.8, D, 13.2, 12);
  f('darkwood', 30, D, 31.2, 3, 0.9, 0.7); for (let i=0;i<6;i++) f('metal', 28.8 + i*0.45, D + 0.9, 31.2, 0.1, 0.1 + mr()*0.2, 0.3, false);
  // things to grab and throw
  for (const [k, x, y, z] of [['pillow', 11.5, U + 0.6, 14.4], ['pillow', 31.5, U + 0.6, 14.4], ['pillow', 13.4, 0.5, 21.6], ['pillow', 9.6, 0.5, 19.6], ['book', 9.3, 0, 16], ['book', 9.3, 0, 17],
    ['mug', 30, 0.76, 17], ['mug', 29.6, 0.76, 16.8], ['mug', 24, 0.76, 27.6], ['block', 28, U, 26], ['block', 29, U, 27], ['block', 30.5, U, 26.5], ['block', 28.6, U, 28.4], ['ball', 25.8, U, 28],
    ['box', 14, D, 20], ['box', 15, D, 21], ['ball', 22, 0, 15], ['book', 17.4, U + 0.75, 19.6]]) B.prop(k, x, y, z);
  for (const [sx, sz] of [[9.4, 13.4], [10.6, 13.5], [11.9, 13.4], [9.5, 15.2], [12.6, 15.6], [10.2, 17.6], [12.9, 18.2]]){      // stacks of storage boxes
    let y = D, s = 0.62 + mr()*0.12; const n = 1 + Math.floor(mr()*3);
    for (let k=0;k<n;k++){ f('cardboard', sx + (mr() - 0.5)*0.08, y, sz + (mr() - 0.5)*0.08, s, s*0.85, s); y += s*0.85; s *= 0.85; } }
  shelf(16.5, D, 12.6, 2.4, 0.4, 2.0, 1); couch(28, D, 20, 0, 'fabric2'); f('green', 17, D, 22, 2.7, 0.76, 1.5);
  // ceiling lights
  for (const [x, z] of [[13, 17.5], [22, 17], [31, 17], [24, 27.6], [33, 27.6]]) ceilingLight(x, z, CEIL);
  for (const [x, z] of [[13, 16.5], [21, 16.5], [30, 16.5], [17, 27.6], [30, 27.6], [20, 22.2]]) ceilingLight(x, z, U + CEIL);
  for (const [x, z] of [[16, 18], [28, 18], [24, 27]]) ceilingLight(x, z, D + CEIL);
  const grp = B.finish(), nav = buildNav(B.solids, O, 44, 2, [D, 0, U]);
  // ---- the living-room TV: robots (or you) turn it on. It shows Robot TV.
  const tvC = document.createElement('canvas'); tvC.width = 256; tvC.height = 144; const tvT2 = new T3.CanvasTexture(tvC); tvT2.encoding = T3.sRGBEncoding;
  const tvM = new T3.Mesh(new T3.PlaneGeometry(1.5, 0.8), new T3.MeshBasicMaterial({map:tvT2})); tvM.position.set(13.4 + O.x, 1.0, 13.055 + O.z); tvM.visible = false; grp.add(tvM);
  const TICK = '   ROBOT NEWS: human seen ripping arms off again  ***  weather: oily  ***  today on Robot Cooking: bolts au gratin  ***  ';
  const drawTV = t => { const g = tvC.getContext('2d'), W = 256, Hh = 144, sc = Math.floor(t/8) % 3;
    g.fillStyle = ['#3a7bd5', '#f2a33a', '#47b36b'][sc]; g.fillRect(0, 0, W, Hh);
    if (sc === 0){ const x = 60 + Math.sin(t*2)*50, y = 70 - Math.abs(Math.sin(t*4))*30; g.fillStyle = '#f4f4f2'; g.fillRect(x - 18, y - 6, 36, 34); g.fillRect(x - 22, y - 40, 44, 34); g.fillStyle = '#0d1a2a'; g.fillRect(x - 17, y - 35, 34, 24);
      g.fillStyle = '#6fe8ff'; g.fillRect(x - 11, y - 28, 6, 8); g.fillRect(x + 5, y - 28, 6, 8); g.fillStyle = '#f4f4f2'; g.fillRect(x - 2, y - 52, 4, 12); g.fillStyle = '#ff6a5e'; g.beginPath(); g.arc(x, y - 54, 5, 0, 7); g.fill(); }
    else if (sc === 1){ g.fillStyle = '#fff'; g.font = 'bold 26px monospace'; g.textAlign = 'center'; g.fillText('ROBOT COOKING', W/2, 40); g.fillStyle = '#5a5e66'; g.beginPath(); g.ellipse(W/2, 92, 50, 16, 0, 0, 7); g.fill();
      for (let k=0;k<6;k++){ g.fillStyle = '#c9cdd2'; g.beginPath(); g.arc(W/2 - 30 + k*12, 86 - Math.abs(Math.sin(t*3 + k))*24, 5, 0, 7); g.fill(); } }
    else { g.fillStyle = '#fff'; g.font = 'bold 22px monospace'; g.textAlign = 'center'; g.fillText('BEEP BOOP FC  ' + (Math.floor(t) % 5) + ' - 3', W/2, 36); g.fillStyle = '#2f8a46'; g.fillRect(20, 50, W - 40, 60);
      const bx = W/2 + Math.sin(t*1.7)*90, by = 80 + Math.sin(t*3.1)*22; g.fillStyle = '#fff'; g.beginPath(); g.arc(bx, by, 6, 0, 7); g.fill(); }
    g.fillStyle = '#d8302a'; g.fillRect(0, Hh - 22, W, 22); g.fillStyle = '#fff'; g.font = 'bold 15px monospace'; g.textAlign = 'left'; const off = (t*40) % (TICK.length*9); g.fillText(TICK + TICK, -off, Hh - 6);
    tvT2.needsUpdate = true; };
  let tvOn = false, tvTime = 0, tvDraw = 0, tvLast = 0, tvCD = 0;
  const setTV = (on, local) => { if (tvOn === on) return; tvOn = on; tvM.visible = on; tvLast = clock; if (AC && lastPlayer.distanceTo(tvM.position) < 12) tone('square', on ? 900 : 300, on ? 1400 : 120, 0.12, 0.05); if (local && netGame) netSend('ev', {t:'mapev', m:'house', k:'tv', on}); };
  // ---- what robots do here: watch TV on the couch, nap in a bed, play the piano, take the stairs
  const HS = [{lo:1, hi:2, bottom:[9.3, 0, 22.9], pts:[[9.3, 0.25, 23.9], [9.3, 3, 31.2], [11.4, 3, 31.2]]},
              {lo:0, hi:1, bottom:[13.7, -3, 31.2], pts:[[11.75, -3, 31.2], [11.75, -0.25, 23.9], [11.75, 0, 22.9]]}];
  const busy = new Set(), V3 = (x, y, z) => new V(x + O.x, y, z + O.z);
  const seats = [[12.8, 21.75, Math.PI], [13.4, 21.75, Math.PI], [14.0, 21.75, Math.PI], [9.6, 19.0, Math.PI/2], [9.6, 19.6, Math.PI/2], [9.6, 20.2, Math.PI/2]].map(([x, z, yaw], i) => ({id:'seat' + i, x, z, yaw, y:0.45}));
  const beds = [{id:'bed0', x:11.5, z:15.2, ax:12.75, az:15.6, top:U + 0.55}, {id:'bed1', x:31.5, z:15.2, ax:30.35, az:15.6, top:U + 0.55}];
  const TWINKLE = [0, 0, 4, 4, 5, 5, 4, -1, 3, 3, 2, 2, 1, 1, 0];
  const sit = (bot, st, dur, watching) => { const r = bot.root, sk = r.szK || 1;
    return actDo(dur, (b, t) => { r.obj.position.set(st.x + O.x - Math.sin(st.yaw)*0.08, st.y + 0.2*sk, st.z + O.z - Math.cos(st.yaw)*0.08); botYaw(b, st.yaw);
      botLimbs(b, -1.45, j => 0.15 + (watching && t % 7 < 0.6 ? 1.6 : 0), 0); if (watching && tvOn) tvLast = clock;
      if (b.blinkT !== undefined){ b.blinkT -= 1/60; if (b.blinkT < 0) b.blinkT = 2 + R()*3; setFace(b, b.blinkT < 0.12 ? 'blink' : watching ? 'happy' : 'idle'); }
      if (watching && R() < 0.002) say(b, pick(['ha!','this show rules','more bolts please','beep boop!','shhh']));
    }, {cancel:(b) => busy.delete(st.id), then:(b) => actWalk(null, [V3(st.x + Math.sin(st.yaw)*0.75, 0, st.z + Math.cos(st.yaw)*0.75)], {cancel:() => busy.delete(st.id)})}); };
  const goSit = (bot, watching) => { const free = seats.filter(q => !busy.has(q.id)); if (!free.length) return null; const st = pick(free); busy.add(st.id);
    return actToLevel(HS, bot, 1, b => actWalk(V3(st.x + Math.sin(st.yaw)*0.75, 0, st.z + Math.cos(st.yaw)*0.75), [], {cancel:() => busy.delete(st.id), then:(b2, failed) => failed ? (busy.delete(st.id), null) : sit(b2, st, 15 + R()*20, watching)})); };
  const houseIdea = (bot, imp) => {
    const lvl = bot.cell ? bot.cell[2] : 1, r = R();
    if (imp || r < 0.25) return actStairs(HS, bot, lvl === 0 ? true : lvl === 2 ? false : R() < 0.5, null);
    if (r < 0.5){ // the TV: turn it on if it's off, then sit and watch
      if (!tvOn && !busy.has('tv')){ busy.add('tv'); return actToLevel(HS, bot, 1, b => actWalk(V3(13.4, 0, 13.95), [], {cancel:() => busy.delete('tv'), then:(b2, failed) => { busy.delete('tv'); if (failed) return null;
        return actDo(1.0, (b3, t) => { botYaw(b3, Math.PI); botLimbs(b3, 0, 0.3, t > 0.3 && t < 0.7 ? -1.5 : 0); if (t > 0.5 && !tvOn){ setTV(true, true); say(b3, pick(['TV time!','ooh my show','click'])); } }, {then:(b4) => goSit(b4, true)}); }})); }
      return goSit(bot, true); }
    if (r < 0.65) return goSit(bot, false);
    if (r < 0.85){ const free = beds.filter(q => !busy.has(q.id)); if (!free.length) return null; const bd = pick(free); busy.add(bd.id); const rel = () => busy.delete(bd.id);
      return actToLevel(HS, bot, 2, b => actWalk(V3(bd.ax, U, bd.az), [], {cancel:rel, then:(b2, failed) => failed ? (rel(), null) : actDo(18 + R()*20, (b3, t) => { const rr = b3.root, sk = rr.szK || 1;
        rr.obj.position.set(bd.x + O.x, bd.top + 0.17*sk, bd.z + O.z); rr.obj.quaternion.setFromEuler(new T3.Euler(-Math.PI/2, 0, 0, 'YXZ')); botLimbs(b3, 0, 0.15, 0); setFace(b3, 'blink');
        if (t > 1 && (t % 6) < 0.02) say(b3, 'z z z'); }, {cancel:rel, then:(b4) => actWalk(null, [V3(bd.ax, U, bd.az)], {cancel:rel})})})); }
    if (!busy.has('piano')){ busy.add('piano'); const rel = () => busy.delete('piano');
      return actToLevel(HS, bot, 1, b => actWalk(V3(33.5, 0, 29.55), [], {cancel:rel, then:(b2, failed) => { if (failed){ rel(); return null; } let n = -1;
        return actDo(TWINKLE.length*0.45 + 1, (b3, t) => { botYaw(b3, 0); const i = Math.floor(t/0.45); botLimbs(b3, 0, 0.35, j => -1.2 - (i % 2 === j && t % 0.45 < 0.15 ? 0.25 : 0));
          if (i !== n && i < TWINKLE.length){ n = i; if (TWINKLE[i] >= 0) piano.botPress(TWINKLE[i], true); } setFace(b3, 'happy'); }, {cancel:rel}); }})); }
    return null; };
  // ---- the robot vacuum: drives a fixed loop on the ground floor (timed by the clock, same for everyone) ----
  const route = [[11.5,16.8],[17.5,16.8],[22,16.8],[27.2,16.8],[27.6,14],[33.4,14],[33.4,22.6],[29.8,22.6],[29.8,25.1],[22,25.1],[22,22.4],[22,16.8],[17.5,16.8]].map(([x,z]) => new V(x + O.x, 0.06, z + O.z));
  const segs = route.map((p, i) => { const q = route[(i+1) % route.length]; return {p, q, len:p.distanceTo(q)}; }), total = segs.reduce((s, g) => s + g.len, 0);
  const vac = new T3.Group(); { const body = new T3.Mesh(new T3.CylinderGeometry(0.32, 0.33, 0.09, 20), lam(0x2a2c30)); body.position.y = 0.045; vac.add(body);
    const top = new T3.Mesh(new T3.CylinderGeometry(0.2, 0.2, 0.012, 16), lam(0x5a5e66)); top.position.y = 0.095; vac.add(top);
    vac.light = new T3.Mesh(new T3.SphereGeometry(0.025, 8, 6), new T3.MeshBasicMaterial({color:0x40ff80})); vac.light.position.set(0, 0.1, -0.22); vac.add(vac.light);
    const bump = new T3.Mesh(new T3.CylinderGeometry(0.335, 0.335, 0.05, 20, 1, true, -1.2, 2.4), lam(0x9aa0a6)); bump.position.y = 0.05; bump.rotation.y = Math.PI; vac.add(bump); }
  grp.add(vac); const vacBox = dynBox();
  let slurpT = 0;
  const slurp = () => { if (!AC) return; noiseHit(0.35, 900, 3, 0.3); tone('sine', 300, 1400, 0.3, 0.08); };
  const piano = pianoKeys(grp, O, {x0:32.8, x1:34.2, z0:30.025, z1:30.275, y:0.72}, 1, 'house');
  MAPS.house = {name:'HOUSE', group:grp, spawn:new V(22, 0, 6).add(O), yaw:Math.PI, nav, yMin:-8, yMax:18, props:B.props,
    sky:{bg:0xa9d2ee, fog:0xc4dbe8, near:14, far:55, hs:0xfffaf0, hg:0x7a6a50, hi:0.95, ac:0xfff4e0, ai:0.38},
    O, botIdea:houseIdea, keys:piano.keys, onEv(ev){ if (ev.k === 'note') piano.play(ev.i); else if (ev.k === 'tv') setTV(ev.on, false); },
    leave(){ setTV(false, false); busy.clear(); },
    update(dt, inGame){
      piano.update(dt, inGame);
      if (tvOn){ tvTime += dt; tvDraw -= dt; if (tvDraw <= 0){ tvDraw = 0.08; drawTV(tvTime); } if (clock - tvLast > 90 && !netGame) setTV(false, false); }
      // touch the TV screen to switch it on or off
      tvCD -= dt; if (inGame && tvCD <= 0) for (const i of [0, 1]){ const h = handW[i]; if (!me.lost[i] && Math.abs(h.x - tvM.position.x) < 0.75 && Math.abs(h.y - 1.0) < 0.4 && Math.abs(h.z - tvM.position.z) < 0.12){ tvCD = 1; setTV(!tvOn, true); pulse(i, 0.4, 40); break; } }
      let s = ((Date.now()/1000*0.7) % total + total) % total, seg = segs[0];
      for (const g of segs){ if (s <= g.len){ seg = g; break; } s -= g.len; }
      const dir = seg.q.clone().sub(seg.p).normalize(); vac.position.copy(seg.p).addScaledVector(dir, s);
      vac.rotation.y = Math.atan2(-dir.x, -dir.z); vac.light.visible = (clock*2 % 1) < 0.7;
      const vp = vac.position; setDyn(vacBox, vp.x - 0.3, 0, vp.z - 0.3, vp.x + 0.3, 0.11, vp.z + 0.3);
      if (!inGame) return;
      slurpT -= dt;
      for (const p of parts){
        if (p.parent || p.obj.userData.dead || p.mode === 'held' || p.stuck || !mine(p)) continue;
        const c = centerW(p); if (c.y > 0.6 || c.y < -0.2 || Math.hypot(c.x - vac.position.x, c.z - vac.position.z) > 0.42 + p.r*0.4) continue;
        if (p.name === 'mine'){ mineTrigger(p); continue; }
        if (p.bot && !p.bot.dead && p === p.bot.root){ if (p.mode === 'bot'){ p.mode = 'free'; p.asleep = false; p.v.copy(dir).multiplyScalar(2).add(new V(0, 2.5, 0)); p.w.set(R()-0.5, R()-0.5, R()-0.5).multiplyScalar(8); say(p.bot, pick(['hey! I am not dust','vacuum attack!!','rude'])); } continue; }
        if (p.r > 0.3 || p.name === 'prop') continue;
        removePart(p);                         // gulp (tells everyone)
        if (slurpT <= 0 && c.distanceTo(lastPlayer) < 12){ slurpT = 0.25; slurp(); }
        spawnSparks(vac.position.clone().add(new V(0, 0.1, 0)), 6, 1.5);
      }
    }};
}

// ======================= BACKROOMS quirk =======================
// Every minute or so the lights flicker... and go out. Only the robots' faces glow in the dark.
{
  let t = 50 + R()*30, st = 'on', k = 0;
  const darkSky = {bg:0x000000, fog:0x000000, near:0.5, far:9, hs:0x334455, hg:0x0, hi:0.22, ac:0x223040, ai:0.12};
  const lightCol = new T3.Color(0xfffbe2);
  const sndOff = () => { if (!AC) return; tone('sawtooth', 120, 30, 0.6, 0.12); noiseHit(0.15, 3000, 4, 0.2); };
  // the lights going out is the host's call (so everyone's in the dark together), and the dark lasts until
  // the monster is dead or it has got somebody
  let monT = 0, syncT = 0;
  const lightsOn = () => { st = 'on'; t = 50 + R()*40; lightsOut = false; lightMat.color.copy(lightCol); applySky('backrooms'); };
  const goDark = () => { st = 'dark'; t = 150; lightsOut = true; lightMat.color.setHex(0x0a0908); applySky(darkSky); sndOff(); showMsg('LIGHTS OUT... something is moving'); };
  const growl = () => { if (!AC) return; tone('sawtooth', 70, 45, 1.2, 0.08); noiseHit(1.0, 300, 0.5, 0.2); };
  const clearMonsters = () => { for (let i = bots.length - 1; i >= 0; i--){ const b = bots[i]; if (!b.mon) continue; if (!b.root.obj.userData.dead){ const c = centerW(b.root); emitAsh(c, 60, 0.4); for (const q of parts.slice()) if (q.bot === b && !q.obj.userData.dead && !q.parent) removePart(q, true); } bots.splice(i, 1); } };
  MAPS.backrooms.monsterDone = (why) => {
    if (curMap !== 'backrooms') return;
    if (why === 'killed'){ if (st === 'dark' && mode === 'game') showMsg('YOU KILLED IT! The lights come back on.'); for (const b of bots) if (b.mon) b.deadT = 0; }
    else { clearMonsters(); if (mode === 'game') showMsg(why === 'ate' ? 'It got someone... and vanished. The lights flicker back on.' : 'The lights come back on.'); }
    if (st !== 'on') lightsOn();
  };
  MAPS.backrooms.monEv = (ev) => {
    if (curMap !== 'backrooms') return;
    if (ev.k === 'flick' && st === 'on'){ st = 'flicker'; t = 1.6; }
    else if (ev.k === 'dark' && st !== 'dark') goDark();
    else if (ev.k === 'ate' || ev.k === 'off') MAPS.backrooms.monsterDone(ev.k === 'ate' ? 'ate' : 'off');
  };
  MAPS.backrooms.update = (dt, inGame) => {
    if (!inGame || impGame()){ if (st !== 'on') lightsOn(); clearMonsters(); return; }
    t -= dt;
    const boss = !netGame || isHost();
    if (st === 'on' && t <= 0 && boss){ st = 'flicker'; t = 1.6; if (netGame) netSend('ev', {t:'mon', k:'flick'}); }
    else if (st === 'flicker'){ k -= dt; if (k <= 0){ k = 0.05 + R()*0.15; const off = R() < 0.5; lightsOut = off; lightMat.color.setHex(off ? 0x1a1812 : 0xfffbe2); applySky(off ? darkSky : 'backrooms'); }
      if (t <= 0){ goDark(); if (boss){ if (netGame) netSend('ev', {t:'mon', k:'dark'});
        if (!bots.some(b => b.mon && !b.dead)){ const pos = farCell(lastPlayer), b = makeBot(0x1d1b26, pos, null, 'mon'); if (netGame) netSend('ev', {t:'spawn', k:'mon', b:b.id, c:b.color, x:r3(pos.x), y:r3(pos.y), z:r3(pos.z)}); } } } }
    else if (st === 'dark'){
      syncT -= dt; if (boss && netGame && syncT <= 0){ syncT = 3; netSend('ev', {t:'mon', k:'dark'}); }
      monT -= dt; if (monT <= 0){ monT = 6 + R()*8; const m = bots.find(b => b.mon && !b.dead); if (m && m.root.obj.position.distanceTo(lastPlayer) < 14) growl(); }
      const alive = bots.some(b => b.mon && !b.dead);
      if (t <= 0 || (boss && !alive && !bots.some(b => b.mon))){ if (boss && netGame) netSend('ev', {t:'mon', k:'off'}); MAPS.backrooms.monsterDone('off'); }
    }
    // a dead monster's leftovers melt away after a while
    for (const b of bots) if (b.mon && b.dead){ b.deadT += dt; if (b.deadT > 10){ clearMonsters(); break; } }
  };
  MAPS.backrooms.leave = () => { lightsOn(); clearMonsters(); };
}


// ======================= BACKROOMS extras =======================
// glass office partitions on top of some of the half walls, and stuff lying around
{
  mapSeed = 5150;
  for (const b of halfWalls){
    if (mr() > 0.45) continue;
    const thinX = b.max[0] - b.min[0] < b.max[2] - b.min[2], cx = (b.min[0] + b.max[0])/2, cz = (b.min[2] + b.max[2])/2;
    if (b.max[0] - b.min[0] > 6 || b.max[2] - b.min[2] > 6) continue;
    if (thinX) addWindow('backrooms', brGroup, [cx - 0.02, b.max[1], b.min[2] + 0.02], [cx + 0.02, H - 0.02, b.max[2] - 0.02]);
    else addWindow('backrooms', brGroup, [b.min[0] + 0.02, b.max[1], cz - 0.02], [b.max[0] - 0.02, H - 0.02, cz + 0.02]);
  }
  // the water-cooler jugs are glass too: smash them
  const jugGeo = new T3.CylinderGeometry(0.15, 0.15, 0.42, 14);
  for (const M of window.JUGS || []){ const c = new V().setFromMatrixPosition(M), q = new Q().setFromRotationMatrix(M), hx = 0.15, hy = 0.21, e = new V();
    const box = new T3.Box3().setFromCenterAndSize(new V(), new V(hx*2, hy*2, hx*2)).applyMatrix4(new M4().makeRotationFromQuaternion(q)), sz = box.getSize(e).multiplyScalar(0.45);
    const w = addWindow('backrooms', brGroup, [c.x - sz.x, c.y - sz.y, c.z - sz.z], [c.x + sz.x, c.y + sz.y, c.z + sz.z]);
    w.mesh.geometry.dispose(); w.mesh.geometry = jugGeo; w.mesh.quaternion.copy(q); w.mesh.position.copy(c); w.mesh.material.color.setHex(0x7fb6e0); w.mesh.material.emissive.setHex(0x10304a); w.base = 0.7; w.mesh.material.opacity = 0.7; w.jug = true; }
  const props = [];
  for (let k=0;k<16;k++){ const p = new V((Math.floor(mr()*N) + 0.5)*C, 0, (Math.floor(mr()*N) + 0.5)*C); props.push([['box','bottle','box','cone'][k % 4], p.x + (mr()-0.5)*1.5, 0, p.z + (mr()-0.5)*1.5]); }
  MAPS.backrooms.props = props;
}

// ======================= SEWERS =======================
// Brick tunnels with a stream of sewage down the middle. Quirk: the current drags anything in the
// water along (you too, unless you hang on) and every minute there's a FLUSH: the water rises and rushes.
{
  const O = new V(0, 0, 500), B = mapBuilder(O, 'sewer'); mapSeed = 6060;
  const brickT = tex(128, 128, (g,w,h) => { g.fillStyle = '#5b4a3c'; g.fillRect(0,0,w,h); for (let y=0;y<h;y+=16) for (let x=((y/16)%2)*16; x<w+32; x+=32){ g.fillStyle = `hsl(${18+R()*12},${25+R()*15}%,${26+R()*10}%)`; g.fillRect(x-30, y+1, 30, 14); } noiseFill(g, w, h, 1500, 'rgba(30,60,20,A)', 0.25, 3); });
  const concT = tex(128, 128, (g,w,h) => { g.fillStyle = '#6d6a5e'; g.fillRect(0,0,w,h); noiseFill(g, w, h, 3000, 'rgba(30,40,20,A)', 0.3, 2); noiseFill(g, w, h, 300, 'rgba(70,110,40,A)', 0.35, 6); });
  const grateT = canvasTex(64, 64, (g,w,h) => { g.fillStyle = '#2a2c2e'; g.fillRect(0,0,w,h); g.fillStyle = '#6a6e72'; for (let i=0;i<w;i+=8){ g.fillRect(i, 0, 3, h); g.fillRect(0, i, w, 3); } }, true);
  const waterTex = d => { const t = canvasTex(128, 128, (g,w,h) => { g.fillStyle = '#3f6a2a'; g.fillRect(0,0,w,h); for (let i=0;i<220;i++){ g.fillStyle = `rgba(${120+R()*80|0},${150+R()*60|0},${60+R()*40|0},${0.15+R()*0.3})`; g.fillRect(R()*w, R()*h, d ? 2 : 14, d ? 14 : 2); } }, true); return t; };
  const wX = waterTex(0), wZ = waterTex(1);
  B.mat('brick', lam(0xffffff, {map:brickT, vertexColors:true})).mat('conc', lam(0xffffff, {map:concT, vertexColors:true})).mat('grate', lam(0xffffff, {map:grateT, vertexColors:true}))
   .mat('pipe', lam(0x6f7a5e, {vertexColors:true})).mat('pipe2', lam(0x8a5a3a, {vertexColors:true})).mat('rung', lam(0x9aa0a6, {vertexColors:true})).mat('bulb', new T3.MeshBasicMaterial({color:0xfff0b0})).mat('dark', new T3.MeshBasicMaterial({color:0x050805}))
   .mat('shaft', new T3.MeshBasicMaterial({color:0xfffbe0, transparent:true, opacity:0.12, depthWrite:false, fog:false}));
  const CEN = [6, 22, 38], HW = 3.5, CHW = 1.2, TOPY = 4, BOT = -0.9;
  const X = [0, 4.8, 7.2, 20.8, 23.2, 36.8, 39.2, 44];
  B.box('conc', [-2, BOT - 1, -2], [46, BOT, 46], {us:2});
  for (let i=0;i<7;i+=2) for (let j=0;j<7;j+=2) B.box('conc', [X[i], BOT, X[j]], [X[i+1], 0, X[j+1]], {us:2});
  B.box('brick', [-2, TOPY, -2], [46, TOPY + 1, 46], {us:2});
  for (const [a, b] of [[[-1,BOT,-1],[0,TOPY,45]], [[44,BOT,-1],[45,TOPY,45]], [[0,BOT,-1],[44,TOPY,0]], [[0,BOT,44],[44,TOPY,45]]]) B.box('brick', a, b, {us:2});
  const BLK = [[0, 2.5], [9.5, 18.5], [25.5, 34.5], [41.5, 44]];
  const lamps = [];
  for (const [x0, x1] of BLK) for (const [z0, z1] of BLK){
    B.box('brick', [x0, 0, z0], [x1, TOPY, z1], {us:2});
    // pipes along the tunnel-facing sides
    if (x1 - x0 > 3){ for (const zz of [z0 - 0.16, z1 + 0.16]) if (zz > 0.5 && zz < 43.5){ const len = x1 - x0; B.geo(zz < z0 ? 'pipe' : 'pipe2', new T3.CylinderGeometry(0.15, 0.15, len, 10), (x0 + x1)/2, 3.0, zz, 0, 0, Math.PI/2); B.solids_(discBoxes(0, 0, 0.15, 0, 1, []).map(([lo, hi]) => [[x0, 3.0 + lo[0], zz + lo[2]], [x1, 3.0 + hi[0], zz + hi[2]]])); } }
    for (const [cx, cz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) if (cx > 0.5 && cx < 43.5 && cz > 0.5 && cz < 43.5 && mr() < 0.6){
      const ox = cx === x0 ? -0.12 : 0.12, oz = cz === z0 ? -0.12 : 0.12; lamps.push(new V(cx + ox, 3.4, cz + oz)); B.geo('bulb', new T3.SphereGeometry(0.07, 8, 6), cx + ox, 3.4, cz + oz); }
  }
  // bridges over the stream (grates), drains at the ends
  const bridges = [];
  for (const c of CEN) for (const m of [14, 30]){ B.box('grate', [m - 1.4, -0.12, c - 1.25], [m + 1.4, 0, c + 1.25], {us:1}); B.box('grate', [c - 1.25, -0.12, m - 1.4], [c + 1.25, 0, m + 1.4], {us:1}); }
  for (const c of CEN){ B.box('dark', [c - 1.0, BOT, 0], [c + 1.0, -0.1, 0.02], {solid:false}); B.box('dark', [c - 1.0, BOT, 43.98], [c + 1.0, -0.1, 44], {solid:false});
    B.box('dark', [0, BOT, c - 1.0], [0.02, -0.1, c + 1.0], {solid:false}); B.box('dark', [43.98, BOT, c - 1.0], [44, -0.1, c + 1.0], {solid:false}); }
  // a ladder up to a manhole with daylight coming down
  { const lx = 25.5 - 0.02, lz = 13;          // the tunnel wall is at x 25.5: the ladder stands just off it, in the tunnel
    for (let k=0;k<11;k++) B.box('rung', [lx - 0.12, 0.3 + k*0.35, lz - 0.3], [lx, 0.34 + k*0.35, lz + 0.3]);
    B.box('rung', [lx - 0.12, 0, lz - 0.34], [lx, TOPY, lz - 0.3]); B.box('rung', [lx - 0.12, 0, lz + 0.3], [lx, TOPY, lz + 0.34]);
    // daylight pouring down from the manhole in the ceiling right above the ladder
    const mx = lx - 0.5; B.geo('dark', new T3.CylinderGeometry(0.52, 0.52, 0.12, 18, 1, true), mx, TOPY - 0.06, lz);
    B.geo('bulb', new T3.CircleGeometry(0.45, 18), mx, TOPY - 0.02, lz, Math.PI/2); B.geo('shaft', new T3.CylinderGeometry(0.45, 1.0, TOPY - 0.05, 16, 1, true), mx, (TOPY - 0.05)/2, lz); lamps.push(new V(mx, 2, lz)); }
  // stuff floating around
  const props = [];
  for (let k=0;k<14;k++){ const c = CEN[k % 3], along = 2 + mr()*40, x = k % 2 ? along : c, z = k % 2 ? c : along; B.prop(k % 3 ? 'duck' : 'barrel', x, BOT, z); }
  for (let k=0;k<8;k++){ const c = CEN[k % 3], s = k % 2 ? 1 : -1, along = 3 + mr()*38; B.prop(['box','bottle','trashcan'][k % 3], k % 4 < 2 ? along : c + s*2.4, 0, k % 4 < 2 ? c + s*2.4 : along); }
  const light = (x, y, z) => { let r = 0.2, g = 0.24, b = 0.16;
    for (const t of lamps){ const d = Math.hypot(x - t.x - O.x, y - t.y, z - t.z - O.z), k = 1.3*Math.exp(-d/3.2); r += k; g += k*0.9; b += k*0.55; }
    return [r, g, b]; };
  const grp = B.finish(light), nav = buildNav(B.solids, O, 44, 2, [0]);
  // the water: one strip per channel, scrolling with the flow
  const wMat = [new T3.MeshLambertMaterial({map:wX, transparent:true, opacity:0.85, emissive:0x15240c}), new T3.MeshLambertMaterial({map:wZ, transparent:true, opacity:0.85, emissive:0x15240c})];
  wX.repeat.set(11, 0.6); wZ.repeat.set(0.6, 11);
  const waters = [];
  for (const c of CEN){
    const a = new T3.Mesh(new T3.PlaneGeometry(44, CHW*2), wMat[0]); a.rotation.x = -Math.PI/2; a.position.set(22 + O.x, 0, c + O.z); grp.add(a); waters.push([a, 0]);
    const b = new T3.Mesh(new T3.PlaneGeometry(CHW*2, 44), wMat[1]); b.rotation.x = -Math.PI/2; b.position.set(c + O.x, 0, 22 + O.z); grp.add(b); waters.push([b, 0.006]);
  }
  const inChan = (x, z) => { x -= O.x; z -= O.z; for (const c of CEN){ if (Math.abs(z - c) < CHW) return [new V(1, 0, 0), c, 'x']; if (Math.abs(x - c) < CHW) return [new V(0, 0, 1), c, 'z']; } return null; };
  let flushWas = false;
  const rumble = () => { if (!AC) return; noiseHit(3.5, 160, 0.5, 0.9); tone('sine', 55, 40, 3, 0.4); };
  const riverIdea = (bot, imp) => { if (imp || R() > 0.3) return null; const c = pick(CEN), u = pick([12, 14, 16, 28, 30, 32]), sd = R() < 0.5 ? -1 : 1, alongX = R() < 0.5;
    const bank = alongX ? new V(u, 0, c + sd*1.9) : new V(c + sd*1.9, 0, u), wat = alongX ? new V(u, -0.2, c) : new V(c, -0.2, u);
    return actWalk(bank.clone().add(O), [], {then:(b, failed) => { if (failed) return null; let t = 0; const from = b.root.obj.position.clone(), to = wat.clone().add(O); say(b, pick(['LAZY RIVER!','cannonball!','it is fine, I am waterproof','wheeee']));
      return {step(b2, dt){ t += dt; const k = Math.min(1, t/0.5), r = b2.root; r.obj.position.lerpVectors(from, to, k); r.obj.position.y += Math.sin(k*Math.PI)*0.8; botLimbs(b2, -0.5, 2.5, 0);
        if (k >= 1){ r.mode = 'free'; r.asleep = false; r.v.set(0, -1, 0); b2.noGetUp = clock + 6; return false; } return true; }}; }}); };
  MAPS.sewer = {name:'SEWERS', O, botIdea:riverIdea, group:grp, spawn:new V(24.4, 0, 14.5).add(O), yaw:Math.PI, nav, yMin:-6, yMax:TOPY + 1.5, props:B.props,
    sky:{bg:0x050805, fog:0x0c140a, near:3, far:24, hs:0xd8f0c0, hg:0x202a18, hi:0.55, ac:0xd0e8b0, ai:0.32},
    update(dt, inGame){
      const ph = (Date.now()/1000) % 60, flush = ph > 50 && ph < 58, k = flush ? Math.min(1, (ph - 50)/1.5)*Math.min(1, (58 - ph)/1.5) : 0;
      const wl = -0.45 + k*0.38, push = 1 + k*3;
      for (const [m, o] of waters) m.position.y = wl + o;
      wX.offset.x -= dt*0.25*push; wZ.offset.y += dt*0.25*push;
      if (flush && !flushWas && inGame){ rumble(); showMsg('FLUSH!'); }
      flushWas = flush;
      if (!inGame) return;
      // you, if you're standing (or swimming) in the stream and not holding on
      const h = loco.headPos(), ch = inChan(h.x, h.z);
      if (ch && h.y - 1.0 < wl + 0.2 && !loco.S.wasTouching.some(t => t)){ const v = loco.S.velocity, along = v.dot(ch[0]); if (along < 2.2*push) v.addScaledVector(ch[0], dt*5*push); }
      // floating pieces drift along, and go down the drain at the end (props come back at the other end)
      for (const p of parts){
        if (p.parent || p.obj.userData.dead || p.mode === 'held' || p.stuck || !mine(p)) continue;
        if (p.bot && !p.bot.dead && p === p.bot.root && p.mode === 'bot') continue;
        const c = centerW(p), cc = inChan(c.x, c.z); if (!cc || c.y > wl + 0.3) continue;
        p.mode = 'free'; p.asleep = false; p.still = 0;
        if (c.y < wl){ p.v.y += 22*dt*Math.min(1, (wl - c.y)/0.15); p.v.y *= 1 - 3*dt; }
        const along = p.v.dot(cc[0]); if (along < 1.3*push) p.v.addScaledVector(cc[0], dt*3*push);
        const side = cc[2] === 'x' ? new V(0, 0, 1) : new V(1, 0, 0), off = (cc[2] === 'x' ? c.z - O.z : c.x - O.x) - cc[1]; p.v.addScaledVector(side, -off*dt*2);
        const end = cc[2] === 'x' ? c.x - O.x : c.z - O.z;
        if (end > 43.3){ if (p.name === 'prop'){ p.obj.position[cc[2]] -= 41.5; p.v.set(0, 0, 0); } else removePart(p); }
      }
    }};
}

// ======================= SUPERMARKET =======================
// A grocery store with a parking lot. Aisles of shelves, produce, freezers, sliding doors.
// Quirk: the checkout belts. Put anything on a belt and it rides to the scanner and gets SOLD (+1 for you).
{
  const O = new V(0, 0, 600), B = mapBuilder(O, 'market'); mapSeed = 8080;
  const asph = tex(256, 256, (g,w,h) => { g.fillStyle = '#3d3f42'; g.fillRect(0,0,w,h); noiseFill(g, w, h, 8000, 'rgba(0,0,0,A)', 0.25); noiseFill(g, w, h, 3000, 'rgba(160,160,160,A)', 0.15); });
  const tile = tex(128, 128, (g,w,h) => { for (let y=0;y<4;y++) for (let x=0;x<4;x++){ g.fillStyle = (x + y) % 2 ? '#e9e6df' : '#d5d1c8'; g.fillRect(x*32, y*32, 32, 32); } noiseFill(g, w, h, 600, 'rgba(90,80,70,A)', 0.12, 2); });
  const wallT = tex(128, 128, (g,w,h) => { g.fillStyle = '#efe9da'; g.fillRect(0,0,w,h); g.fillStyle = '#3a9ad8'; g.fillRect(0, h*0.82, w, h*0.06); noiseFill(g, w, h, 500, 'rgba(90,80,70,A)', 0.08, 2); });
  const outT = tex(128, 128, (g,w,h) => { g.fillStyle = '#c9c2b2'; g.fillRect(0,0,w,h); for (let y=0;y<h;y+=16){ g.fillStyle = 'rgba(80,70,60,.25)'; g.fillRect(0, y, w, 2); } });
  const signT = canvasTex(1024, 160, (g,w,h) => { g.fillStyle = '#d8302a'; g.fillRect(0,0,w,h); g.fillStyle = '#fff'; g.font = 'bold 110px Rubik, sans-serif'; g.textAlign = 'center'; g.fillText('SUPER MART', w/2, 120); });
  const beltT = canvasTex(64, 64, (g,w,h) => { g.fillStyle = '#1c1d20'; g.fillRect(0,0,w,h); g.fillStyle = '#34373c'; for (let y=0;y<h;y+=16) g.fillRect(0, y, w, 6); }, true);
  const aisleT = k => canvasTex(128, 96, (g,w,h) => { g.fillStyle = '#2f62c8'; g.fillRect(0,0,w,h); g.fillStyle = '#fff'; g.font = 'bold 34px Rubik, sans-serif'; g.textAlign = 'center'; g.fillText('AISLE', w/2, 38); g.font = 'bold 44px Rubik, sans-serif'; g.fillText(String(k), w/2, 84); });
  B.mat('asph', lam(0xffffff, {map:asph})).mat('tile', lam(0xffffff, {map:tile})).mat('wall', lam(0xffffff, {map:wallT})).mat('out', lam(0xffffff, {map:outT})).mat('sign', new T3.MeshBasicMaterial({map:signT}))
   .mat('belt', lam(0xffffff, {map:beltT})).mat('paint', lam(0xf2f2ea)).mat('conc', lam(0xa9a59c)).mat('shelf', lam(0xd8dde2)).mat('shelfB', lam(0x8a929b)).mat('counter', lam(0x3a9ad8)).mat('dark', lam(0x222428))
   .mat('screen', new T3.MeshBasicMaterial({color:0x52e06a})).mat('fridge', lam(0xf4f6f8)).mat('fglass', lam(0x9fd8ff, {transparent:true, opacity:0.45})).mat('panel', new T3.MeshBasicMaterial({color:0xf8fbff})).mat('crate', lam(0x9a7448))
   .mat('green', lam(0x3f9a4a)).mat('hedge', lam(0x2f6b2a)).mat('ceilM', lam(0xf0eee8)).mat('pole', lam(0x4a5056)).mat('lamp', new T3.MeshBasicMaterial({color:0xfff6d8}));
  const prodCols = [0xd8302a, 0x2f62c8, 0xf2c230, 0x3f9a4a, 0xff8a1f, 0x9a4fc8, 0xf4f4f2, 0x8a5a32];
  prodCols.forEach((c, i) => B.mat('p' + i, lam(c)));
  for (let k=1;k<=6;k++) B.mat('a' + k, new T3.MeshBasicMaterial({map:aisleT(k), side:T3.DoubleSide}));
  B.box('asph', [-2, -1, -2], [46, 0, 46], {us:4});
  // lot edge: low wall and hedge, invisible above
  for (const [a, b] of [[[-1,0,-1],[0,1.0,45]], [[44,0,-1],[45,1.0,45]], [[0,0,-1],[44,1.0,0]], [[0,0,44],[44,1.0,45]]]){ B.box('hedge', a, b, {us:2}); B.solid([a[0],1.0,a[2]], [b[0],14,b[2]]); }
  for (let x=2;x<42;x+=3) if (x < 19 || x > 25) for (const z0 of [2, 9]) B.box('paint', [x, 0, z0], [x + 0.1, 0.006, z0 + 4.5], {solid:false});
  // parked cars
  const car = (x, z, c) => { B.mat('car' + c, B.bins['car' + c] ? B.bins['car' + c].m : lam(c)); B.box('car' + c, [x - 0.9, 0.25, z - 2.1], [x + 0.9, 0.95, z + 2.1]); B.box('car' + c, [x - 0.8, 0.95, z - 1.1], [x + 0.8, 1.5, z + 0.9]);
    B.box('fglass', [x - 0.81, 1.0, z - 1.05], [x + 0.81, 1.45, z + 0.85], {solid:false}); for (const [dx, dz] of [[-0.85,-1.35],[0.85,-1.35],[-0.85,1.35],[0.85,1.35]]) B.box('dark', [x + dx - 0.12, 0, z + dz - 0.33], [x + dx + 0.12, 0.6, z + dz + 0.33], {solid:false}); };
  car(3.6, 4.2, 0xd23a2a); car(12.6, 11.4, 0x2a62c8); car(30.6, 4.2, 0xeeeeee); car(39.6, 11.4, 0x2f9e55);
  for (const [x, z] of [[9, 7], [35, 7]]){ B.box('pole', [x - 0.08, 0, z - 0.08], [x + 0.08, 6, z + 0.08]); B.box('pole', [x - 0.6, 6, z - 0.15], [x + 0.6, 6.15, z + 0.15]); B.box('lamp', [x - 0.55, 5.97, z - 0.12], [x + 0.55, 6.0, z + 0.12]); }
  B.box('pole', [26, 0, 12], [29, 0.9, 12.06]); B.box('pole', [26, 0, 13.2], [29, 0.9, 13.26]); B.box('pole', [28.94, 0, 12], [29, 0.9, 13.26]);
  // ---- the store ----
  const X0 = 4, X1 = 40, Z0 = 16, Z1 = 42, HT = 5.5, T = 0.3;
  const front = [[20, 24, 0, 2.7], [5.5, 9.3, 0.4, 3.2, true], [9.6, 13.4, 0.4, 3.2, true], [13.7, 17.5, 0.4, 3.2, true], [26.5, 30.3, 0.4, 3.2, true], [30.6, 34.4, 0.4, 3.2, true], [34.7, 38.5, 0.4, 3.2, true]];
  B.wallRun(['wall'], 'x', X0, X1, Z0, Z0 + T, 0, HT, front, 2);
  B.wallRun(['out'], 'x', X0 - 0.03, X1 + 0.03, Z0 - 0.03, Z0, 0, HT + 1.2, front.map(h => h.slice(0, 4)), 2);
  B.box('wall', [X0, 0, Z1 - T], [X1, HT, Z1], {us:2}); B.box('wall', [X0, 0, Z0 + T], [X0 + T, HT, Z1 - T], {us:2}); B.box('wall', [X1 - T, 0, Z0 + T], [X1, HT, Z1 - T], {us:2});
  B.box('out', [X0 - 0.03, 0, Z0], [X0, HT + 1.2, Z1], {us:2}); B.box('out', [X1, 0, Z0], [X1 + 0.03, HT + 1.2, Z1], {us:2}); B.box('out', [X0, 0, Z1], [X1, HT + 1.2, Z1 + 0.03], {us:2});
  B.box('out', [X0, HT, Z0], [X1, HT + 1.2, Z1]); B.box('ceilM', [X0 + T, HT - 0.01, Z0 + T], [X1 - T, HT, Z1 - T], {solid:false});
  B.geo('sign', new T3.PlaneGeometry(9.6, 1.5), 22, 4.15, Z0 - 0.05, 0, Math.PI, 0);
  B.box('tile', [X0 + T, 0, Z0 + T], [X1 - T, 0.02, Z1 - T], {us:2});
  for (let x=7;x<38;x+=5) for (let z=19;z<41;z+=4) B.box('panel', [x - 0.9, HT - 0.03, z - 0.3], [x + 0.9, HT - 0.01, z + 0.3], {solid:false});
  // checkouts with belts
  const belts = [];
  for (const cx of [8, 13, 31, 36]){
    B.box('counter', [cx - 0.45, 0, 19.5], [cx + 0.45, 0.85, 23.6]); B.box('belt', [cx - 0.35, 0.85, 20.3], [cx + 0.35, 0.9, 23.5], {us:0.5});
    B.box('dark', [cx - 0.45, 0.85, 19.5], [cx + 0.45, 1.05, 20.25]); B.box('dark', [cx + 0.25, 1.05, 19.6], [cx + 0.45, 1.6, 19.75]); B.box('screen', [cx + 0.26, 1.2, 19.75], [cx + 0.44, 1.5, 19.76], {solid:false});
    B.box('pole', [cx - 0.02, 0.9, 23.55], [cx + 0.02, 2.0, 23.6]); B.box('lamp', [cx - 0.12, 2.0, 23.5], [cx + 0.12, 2.2, 23.65], {solid:false});
    belts.push({x:cx + O.x, z0:20.3 + O.z, z1:23.5 + O.z, top:0.9});
  }
  // aisles
  const shelves = [8.5, 13, 17.5, 26.5, 31, 35.5];
  shelves.forEach((cx, ai) => {
    B.box('shelfB', [cx - 0.3, 0, 26], [cx + 0.3, 2.2, 38], {solid:false}); B.solid([cx - 0.56, 0, 26], [cx + 0.56, 2.2, 38]);          // a thin back, shelves sticking out both sides
    B.box('shelfB', [cx - 0.56, 0, 25.94], [cx + 0.56, 2.2, 26], {solid:false}); B.box('shelfB', [cx - 0.56, 0, 38], [cx + 0.56, 2.2, 38.06], {solid:false}); B.box('shelfB', [cx - 0.56, 2.2, 25.94], [cx + 0.56, 2.24, 38.06], {solid:false});
    for (let lv=0;lv<4;lv++){ const y = 0.15 + lv*0.5;
      for (const sd of [-1, 1]){ B.box('shelf', [sd < 0 ? cx - 0.56 : cx + 0.3, y - 0.03, 26], [sd < 0 ? cx - 0.3 : cx + 0.56, y, 38], {solid:false});
        for (let z=26.15; z<37.8; z+=0.3){ const k = 'p' + Math.floor(mr()*8), ph = 0.18 + mr()*0.22, pw = 0.2 + mr()*0.06; const dep = 0.17 + mr()*0.05; B.box(k, [sd < 0 ? cx - 0.302 - dep : cx + 0.302, y + 0.002, z], [sd < 0 ? cx - 0.302 : cx + 0.302 + dep, y + ph, z + pw], {solid:false}); } } }
    B.geo('a' + (ai + 1), new T3.PlaneGeometry(0.8, 0.6), cx, 3.3, 26.4, 0, Math.PI, 0); B.box('pole', [cx - 0.01, 3.6, 26.38], [cx + 0.01, HT, 26.42], {solid:false});
    for (let k=0;k<3;k++){ const z = 27 + mr()*10, sd = k % 2 ? 1 : -1, lv = 1 + Math.floor(mr()*3); B.prop(['can','cereal','bottle'][k], cx + sd*0.42, 0.15 + lv*0.5, z); }
  });
  // produce
  for (const [z0, z1] of [[26, 30], [32, 36]]){ B.box('crate', [20, 0, z0], [24, 0.8, z1]); B.box('green', [20.1, 0.8, z0 + 0.1], [23.9, 0.84, z1 - 0.1], {solid:false}); }
  for (const [k, n, z] of [['melon', 4, 27], ['apple', 5, 29], ['orange', 5, 33], ['melon', 3, 35]]) for (let i=0;i<n;i++) B.prop(k, 20.5 + i*0.7, 0.84, z + (i % 2)*0.6);
  // freezers along the back
  B.box('fridge', [5, 0, 40.4], [39, 2.1, 41.7]); B.box('fglass', [5, 0.3, 40.36], [39, 2.0, 40.4], {solid:false});
  for (let x=5.2;x<39;x+=0.35) B.box('p' + Math.floor(mr()*8), [x, 0.4 + Math.floor(mr()*3)*0.5, 40.45], [x + 0.25, 0.7 + Math.floor(mr()*1)*0.5, 40.8], {solid:false});
  // carts out front
  for (const [x, z] of [[27, 12.6], [27.8, 12.6], [14, 13], [23, 10]]) B.prop('cart', x, 0, z);
  const grp = B.finish(), nav = buildNav(B.solids, O, 44, 2, [0]);
  // sliding front doors
  const doorMat = new T3.MeshLambertMaterial({color:0xbfe6ff, emissive:0x1d3442, transparent:true, opacity:0.35, depthWrite:false});
  const doors = [0, 1].map(i => { const m = new T3.Mesh(new T3.BoxGeometry(2, 2.7, 0.06), doorMat); m.position.set(21 + i*2 + O.x, 1.35, Z0 + T/2 + O.z); grp.add(m);
    const fr = new T3.Mesh(new T3.BoxGeometry(2, 0.08, 0.08), lam(0x4a5056)); fr.position.y = 1.31; m.add(fr); return {m, box:dynBox(), open:0}; });
  let saleT = 0, paT = 20;
  const PA = ['Attention shoppers. Robots are not for sale. Unless you put them on the belt.', 'Clean up on aisle three.', 'Reminder: please do not throw the melons.', 'Today only: robot parts, buy one get one free.', 'Would the owner of the robot leaking oil please return to the checkout.'];
  const sellBeep = () => { if (!AC) return; tone('square', 1800, 1800, 0.08, 0.12); setTimeout(() => tone('square', 2400, 2400, 0.12, 0.1), 100); };
  // ---- robots go shopping: grab a cart, push it round the aisles, take things off the shelves, pay, and send the cart rolling
  const AISLES = [[10.75, 8.5, 13], [15.25, 13, 17.5], [28.75, 26.5, 31], [33.25, 31, 35.5]];
  const cartItems = (cart, cols) => { for (const k of cart.obj.children.slice()) if (k.userData.cartItem) cart.obj.remove(k);
    cols.forEach((c, i) => { const m = new T3.Mesh(new T3.BoxGeometry(0.12 + (i % 3)*0.03, 0.14 + (i % 2)*0.06, 0.1), lam(prodCols[c])); m.userData.cartItem = true;
      m.position.set(-0.14 + (i % 3)*0.14, 0.12 + Math.floor(i/6)*0.12, -0.24 + (Math.floor(i/3) % 2)*0.22 + (i % 2)*0.1); m.rotation.y = i*0.7; cart.obj.add(m); }); cart.items = cols; };
  const setItems = (cart, cols) => { cartItems(cart, cols); if (netGame && cart.id) netSend('ev', {t:'mapev', m:'market', k:'ci', id:cart.id, cols}); };
  const pushCart = (cart) => null;     // (the cart is held in the robot's hands every frame: see update)
  // a held cart sits right in front of the robot's hands, every frame, whatever it's doing
  const holdCarts = (dt) => { for (const c of parts){ if (c.kind !== 'cart' || !c.pinned) continue; const b = c.holdBot;
      if (!b || b.dead || !b.act || b.root.mode !== 'bot' || c.obj.userData.dead || c.parent || c.mode === 'held'){ c.pinned = false; c.holdBot = null; c.asleep = false; continue; }
      const r = b.root, yaw = new T3.Euler().setFromQuaternion(r.obj.quaternion, 'YXZ').y, nx = r.obj.position.x + Math.sin(yaw)*0.8, nz = r.obj.position.z + Math.cos(yaw)*0.8;
      if (dt > 0) c.v.set((nx - c.obj.position.x)/dt, 0, (nz - c.obj.position.z)/dt); c.obj.position.set(nx, 0.32, nz); c.obj.quaternion.setFromEuler(new T3.Euler(0, yaw, 0)); c.w.set(0, 0, 0); c.calmT = clock + 1; } };
  const pushLimbs = (b, ph) => botLimbs(b, j => (j ? -1 : 1)*Math.sin(ph)*0.6, 0.15, -1.35);
  const shopIdea = (bot, imp) => { if (imp) return null;
    const carts = parts.filter(q => q.kind === 'cart' && !q.obj.userData.dead && !q.parent && q.mode !== 'held' && !q.shopper && mine(q));
    if (!carts.length) return null; const pos = bot.root.obj.position, cart = carts.sort((a, b) => a.obj.position.distanceTo(pos) - b.obj.position.distanceTo(pos))[0];
    cart.shopper = bot; const rel = () => { if (cart.shopper === bot){ cart.shopper = null; cart.pinned = false; cart.holdBot = null; cart.asleep = false; } };
    let stops = 2 + Math.floor(R()*3); const lane = cx => R() < 0.5 ? -1 : 1;
    const shelfStop = (b) => { const A = pick(AISLES), z = 27.5 + R()*9, sd = R() < 0.5 ? -1 : 1, sx = sd < 0 ? A[1] + 0.56 : A[2] - 0.56;
      return actWalk(new V(A[0] + O.x, 0, z + O.z), [new V(A[0] + sd*0.55 + O.x, 0, z + O.z)], {each:pushCart(cart), limbs:pushLimbs, cancel:rel, then:(b2, failed) => { if (failed){ rel(); return null; } let got = false;
        return actDo(1.4, (b3, t) => { botYaw(b3, sd < 0 ? -Math.PI/2 : Math.PI/2, 1/60); botLimbs(b3, 0, 0.3, j => (sd < 0) === (j === 0) && t > 0.3 && t < 1.0 ? -1.6 : 0);
          if (t > 0.7 && !got){ got = true; if (!cart.obj.userData.dead) setItems(cart, (cart.items || []).concat([Math.floor(R()*prodCols.length)])); if (R() < 0.3) say(b3, pick(['ooh, oil flakes','this one!','on sale!','two of these','nom'])); } },
          {cancel:rel, then:(b4) => --stops > 0 ? shelfStop(b4) : checkout(b4)}); }}); };
    const checkout = (b) => { const cx = pick([8, 13, 31, 36]);
      return actWalk(new V(cx - 1.2 + O.x, 0, 24.6 + O.z), [new V(cx - 1.0 + O.x, 0, 22 + O.z)], {each:pushCart(cart), limbs:pushLimbs, cancel:rel, then:(b2, failed) => { if (failed){ rel(); return null; } let k = 0;
        return actDo(0.6 + (cart.items || []).length*0.45, (b3, t) => { botYaw(b3, Math.PI/2, 1/60); botLimbs(b3, 0, 0.3, j => j === 1 && t % 0.45 < 0.25 ? -1.5 : 0);
          if (t > 0.5 + k*0.45 && cart.items && cart.items.length){ k++; setItems(cart, cart.items.slice(1)); if (b3.root.obj.position.distanceTo(lastPlayer) < 10) sellBeep(); } },
          {cancel:rel, then:(b4) => { say(b4, pick(['bye bye cart!','wheee go cart','free cart!'])); return actWalk(new V(22 + O.x, 0, 13.5 + O.z), [], {each:pushCart(cart), limbs:pushLimbs, cancel:rel,
            then:(b5) => { const yaw = new T3.Euler().setFromQuaternion(b5.root.obj.quaternion, 'YXZ').y; rel(); if (!cart.obj.userData.dead){ cart.v.set(Math.sin(yaw)*3.2, 0, Math.cos(yaw)*3.2); cart.asleep = false; } return null; }}); }}); }}); };
    return actWalk(cart.obj.position.clone().setY(0), [], {cancel:rel, ptsFn:(b) => { const c = cart.obj.position, d = new V(b.root.obj.position.x - c.x, 0, b.root.obj.position.z - c.z); if (d.lengthSq() < 1e-4) d.set(0, 0, -1); d.setLength(0.85); return [new V(c.x + d.x, 0, c.z + d.z)]; },
      then:(b, failed) => { if (failed || cart.obj.userData.dead){ rel(); return null; } cart.pinned = true; cart.holdBot = b; say(b, pick(['shopping time!','I need bolts','grocery run','where is the oil aisle'])); return shelfStop(b); }}); };
  MAPS.market = {name:'SUPERMARKET', O, botIdea:shopIdea, onEv(ev){ if (ev.k === 'ci'){ const c = partsById.get(ev.id); if (c) cartItems(c, ev.cols || []); } }, group:grp, spawn:new V(22, 0, 7).add(O), yaw:Math.PI, nav, yMin:-5, yMax:16, props:B.props,
    sky:{bg:0xa9d2ee, fog:0xc4dbe8, near:16, far:60, hs:0xffffff, hg:0x8a8070, hi:1.0, ac:0xffffff, ai:0.4},
    update(dt, inGame){
      holdCarts(dt);
      // doors open when anyone (or any robot) walks up
      const who = [lastPlayer]; for (const p of Object.values(NET.peers)) if (p.P) who.push(p.P.head); for (const b of bots) if (!b.dead) who.push(b.root.obj.position);
      const dc = new V(22 + O.x, 1, Z0 + O.z), near = who.some(p => Math.hypot(p.x - dc.x, p.z - dc.z) < 3.3);
      doors.forEach((d, i) => { d.open += ((near ? 1 : 0) - d.open)*Math.min(1, dt*4); const x = 21 + i*2 + (i ? 1 : -1)*d.open*1.9 + O.x; d.m.position.x = x;
        setDyn(d.box, x - 1, 0, Z0 + O.z + 0.12, x + 1, 2.7, Z0 + O.z + 0.18); });
      if (!inGame) return;
      paT -= dt; if (paT <= 0){ paT = 40 + R()*30; if (lastPlayer.z > O.z + 10) announce(pick(PA)); }
      saleT -= dt;
      for (const p of parts){
        if (p.parent || p.obj.userData.dead || p.mode === 'held' || p.stuck || !mine(p)) continue;
        if (p.bot && !p.bot.dead && p === p.bot.root) continue;
        const c = centerW(p);
        for (const bt of belts){
          if (Math.abs(c.x - bt.x) > 0.4 || c.z < bt.z0 - 0.1 || c.z > bt.z1 || c.y < bt.top - 0.05 || c.y > bt.top + 0.7) continue;
          if (p.name === 'mine'){ mineTrigger(p); continue; }
          p.obj.position.z -= 0.45*dt; p.v.multiplyScalar(0.8);
          if (c.z < bt.z0 + 0.05){
            spawnSparks(c, 14, 1.5); removePart(p); score++; if (saleT <= 0){ saleT = 0.3; sellBeep(); if (c.distanceTo(lastPlayer) < 8) showMsg('SOLD! +1'); }
          }
        }
      }
    }};
}

// ======================= SPACE STATION =======================
// Nine modules round a glowing reactor, big windows onto space. Quirk: LOW GRAVITY everywhere, and the
// AIRLOCK on the east side cycles every 40 s: whatever (whoever) is inside gets blown out into space.
// Out there you float with nothing to push on: grapple back in or you're lost in space.
{
  const O = new V(0, 0, 700), B = mapBuilder(O, 'station'); mapSeed = 7171;
  const floorT = tex(128, 128, (g,w,h) => { g.fillStyle = '#8d949c'; g.fillRect(0,0,w,h); g.strokeStyle = '#6a7078'; g.lineWidth = 3; g.strokeRect(2,2,w-4,h-4); g.strokeRect(w/2,2,1,h-4);
    for (let i=0;i<16;i++){ g.fillStyle = '#a9b0b8'; g.beginPath(); g.arc(8 + (i%4)*36, 8 + Math.floor(i/4)*36, 2, 0, 7); g.fill(); } noiseFill(g, w, h, 800, 'rgba(40,40,40,A)', 0.12, 2); });
  const wallT = tex(128, 128, (g,w,h) => { g.fillStyle = '#e8ecf0'; g.fillRect(0,0,w,h); g.strokeStyle = '#b9c0c8'; g.lineWidth = 3; g.strokeRect(2,2,w-4,h-4); g.fillStyle = '#c9d0d8'; g.fillRect(10, 54, w-20, 20); noiseFill(g, w, h, 300, 'rgba(80,90,100,A)', 0.08, 2); });
  const hazT = tex(64, 64, (g,w,h) => { g.fillStyle = '#1c1d20'; g.fillRect(0,0,w,h); g.fillStyle = '#f2c230'; for (let i=-2;i<4;i++){ g.beginPath(); g.moveTo(i*32, 0); g.lineTo(i*32+16, 0); g.lineTo(i*32+16+64, h); g.lineTo(i*32+64, h); g.fill(); } });
  const scrT = canvasTex(128, 64, (g,w,h) => { g.fillStyle = '#04121c'; g.fillRect(0,0,w,h); g.strokeStyle = '#38e0ff'; g.lineWidth = 2; g.beginPath(); for (let x=0;x<w;x+=4) g.lineTo(x, 32 + Math.sin(x*0.15)*14*Math.cos(x*0.03)); g.stroke(); g.fillStyle = '#7fffa0'; g.font = '12px monospace'; g.fillText('O2 98%  PWR OK', 6, 60); });
  B.mat('floor', lam(0xffffff, {map:floorT, vertexColors:true})).mat('wall', lam(0xffffff, {map:wallT, vertexColors:true})).mat('haz', lam(0xffffff, {map:hazT, vertexColors:true}))
   .mat('trim', lam(0x2f62c8, {vertexColors:true})).mat('dark', lam(0x2a2e34, {vertexColors:true})).mat('glass', new T3.MeshBasicMaterial({color:0x9fd8ff, transparent:true, opacity:0.12, depthWrite:false}))
   .mat('screen', new T3.MeshBasicMaterial({map:scrT})).mat('glow', new T3.MeshBasicMaterial({color:0x6ad0ff})).mat('panel', new T3.MeshBasicMaterial({color:0xf4f8ff})).mat('leaf', lam(0x3f9a4a, {vertexColors:true}))
   .mat('pot', lam(0x6a5040, {vertexColors:true})).mat('bunk', lam(0x5a6a8a, {vertexColors:true})).mat('crate', lam(0xc8a060, {vertexColors:true})).mat('pipe', lam(0xa9b0b8, {vertexColors:true}))
   .mat('tank', new T3.MeshLambertMaterial({color:0x7fffa0, emissive:0x1a6a30, transparent:true, opacity:0.6})).mat('red', new T3.MeshBasicMaterial({color:0x661010}));
  const HT = 7, T = 0.3;
  B.box('floor', [-1, -1, -1], [44, 0, 45], {us:2}); B.box('floor', [44, -1, -1], [50, -0.05, 19.2], {us:2}); B.box('floor', [44, -1, 24.8], [50, -0.05, 45], {us:2});
  B.box('wall', [-1, HT, -1], [50, HT + 0.6, 45], {us:2});
  for (let x=3;x<44;x+=5) for (let z=3;z<44;z+=5) B.box('panel', [x - 0.8, HT - 0.02, z - 0.3], [x + 0.8, HT, z + 0.3], {solid:false});
  // hull with long windows onto space; the east side has the airlock door
  const win = []; for (let a=2.5;a<40;a+=6) win.push([a, a + 4, 1.4, 4.8]);
  const glassIn = (axis, t0, t1) => { for (const [a0, a1, y0, y1] of win) if (axis === 'x') B.box('glass', [a0, y0, t0], [a1, y1, t1], {}); else B.box('glass', [t0, y0, a0], [t1, y1, a1], {}); };
  B.wallRun(['wall'], 'x', 0, 44, 0, T, 0, HT, win, 2); glassIn('x', 0.1, 0.2);
  B.wallRun(['wall'], 'x', 0, 44, 44 - T, 44, 0, HT, win, 2); glassIn('x', 43.8, 43.9);
  B.wallRun(['wall'], 'z', T, 44 - T, 0, T, 0, HT, win, 2); glassIn('z', 0.1, 0.2);
  B.wallRun(['wall'], 'z', T, 44 - T, 44 - T, 44, 0, HT, [[19.5, 24.5, 0, 3.6]], 2);
  // inside: walls between the modules, with doorways
  const D = [[5, 9.5, 0, 3.2], [19.8, 24.2, 0, 3.2], [34.5, 39, 0, 3.2]];
  for (const c of [14.5, 29.5]){ B.wallRun(['wall'], 'z', T, 44 - T, c - 0.15, c + 0.15, 0, HT, D, 2); B.wallRun(['wall'], 'x', T, 44 - T, c - 0.15, c + 0.15, 0, HT, D, 2); }
  for (const c of [14.5, 29.5]) for (const k of [0, 1]){ // the band sits above the doorway tops (3.2) and its ends tuck into the hull, so it never shares a face
    const y0 = 3.24 + k*0.006; B.box('trim', k ? [c - 0.16, y0, T - 0.05] : [T - 0.05, y0, c - 0.16], k ? [c + 0.16, y0 + 0.2, 44 - T + 0.05] : [44 - T + 0.05, y0 + 0.2, c + 0.16], {solid:false}); }
  // the reactor in the middle
  B.cyl('dark', 1.6, 1.6, 0.5, 22, 0, 22, 16); B.cyl('glow', 1.15, 1.15, HT, 22, 0, 22, 16);
  for (const y of [1.2, 2.6, 4.0, 5.4]) B.geo('trim', new T3.TorusGeometry(1.2, 0.07, 6, 18), 22, y, 22, Math.PI/2);
  for (let k=0;k<10;k++){ const a = k/10*Math.PI*2; B.box('pipe', [22 + Math.cos(a)*2.6 - 0.05, 0, 22 + Math.sin(a)*2.6 - 0.05], [22 + Math.cos(a)*2.6 + 0.05, 1.0, 22 + Math.sin(a)*2.6 + 0.05]); }
  // NW command: consoles at the windows
  for (let x=2;x<13;x+=2.6){ B.box('dark', [x, 0, 0.6], [x + 2.2, 1.0, 1.4]); B.box('screen', [x + 0.2, 1.0, 0.7], [x + 2.0, 1.6, 0.8]); B.box('trim', [x + 0.6, 0, 2.6], [x + 1.6, 0.5, 3.4]); }
  B.box('trim', [6, 0, 7], [8, 0.8, 8.2]); B.box('dark', [6, 0.8, 7], [8, 1.8, 7.2]);
  // N lab: benches, glowing tanks
  for (const z of [4, 9]){ B.box('wall', [16.5, 0, z], [27.5, 0.95, z + 1.2]); }
  for (const [x, z] of [[17.5, 1.5], [21, 1.5], [24.5, 1.5], [27.8, 12.5]]){ B.cyl('dark', 0.55, 0.55, 0.3, x, 0, z, 12); B.cyl('tank', 0.45, 0.45, 2.0, x, 0.3, z, 12); B.cyl('dark', 0.55, 0.55, 0.15, x, 2.3, z, 12); }
  // NE crew quarters: bunks
  for (let x=31;x<43;x+=3){ for (const y of [0.4, 1.6]) B.box('bunk', [x + 0.1, y, 0.52], [x + 2.1, y + 0.3, 1.58]); B.box('dark', [x, 0, 0.5], [x + 0.1, 2.4, 1.6]); B.box('dark', [x + 2.1, 0, 0.5], [x + 2.2, 2.4, 1.6]); }
  for (let x=31;x<43;x+=1.2) B.box('trim', [x, 0, 13.2], [x + 1.0, 2.2, 14.2]);
  // W greenhouse
  for (const z of [17, 21, 25]) { B.box('pot', [2, 0, z], [12, 0.7, z + 1.6]); for (let x=2.6;x<12;x+=1.3){ B.geo('leaf', new T3.ConeGeometry(0.35, 1.1, 7), x, 1.2, z + 0.8); B.solids_(coneBoxes(x + 0, z + 0.8, 0.35, 0.65, 1.1)); } }
  // SW storage crates
  for (const [x, z, n] of [[2, 31, 3], [5, 31, 2], [2, 35, 2], [9, 40, 3], [11.5, 40, 1], [2, 40, 1]]) for (let k=0;k<n;k++) B.box('crate', [x, k*1.1, z], [x + 2, k*1.1 + 1.05, z + 2]);
  // S rec room: tables
  for (const [x, z] of [[19, 34], [25, 34], [22, 39]]){ B.cyl('trim', 0.12, 0.12, 0.75, x, 0, z, 8); B.cyl('wall', 0.9, 0.9, 0.06, x, 0.75, z, 16); }
  // SE engineering: generators and pipes
  for (const [x, z] of [[33, 33], [33, 38], [39, 33], [39, 38]]){ B.cyl('pipe', 1.0, 1.0, 2.2, x, 0, z, 14); B.cyl('glow', 0.3, 0.3, 0.1, x, 2.2, z, 10); }
  for (const z of [31, 36, 41]) B.geo('pipe', new T3.CylinderGeometry(0.15, 0.15, 13, 8), 37, 6.2, z, 0, 0, Math.PI/2);
  // E: the airlock room and chamber
  B.box('haz', [30, 0.001, 19.5], [44, 0.012, 24.5], {solid:false, us:1});
  const AX0 = 44, AX1 = 49, AZ0 = 19.5, AZ1 = 24.5, AH = 3.6;
  B.box('haz', [AX0, -0.3, AZ0], [AX1, 0, AZ1], {us:1}); B.box('wall', [AX0, AH, AZ0 - T], [AX1 + T, AH + T, AZ1 + T]);
  B.box('wall', [AX0, 0, AZ0 - T], [AX1 + T, AH, AZ0]); B.box('wall', [AX0, 0, AZ1], [AX1 + T, AH, AZ1 + T]);
  B.box('glass', [AX0 + 1, 1.2, AZ0 - 0.2], [AX1 - 1, 2.8, AZ0 - 0.1], {solid:false});
  const warnL = [[43.6, 3.9, 19.2], [43.6, 3.9, 24.8]]; for (const [x, y, z] of warnL) B.box('red', [x - 0.15, y - 0.15, z - 0.15], [x + 0.15, y + 0.15, z + 0.15], {solid:false});
  // props, floating gently in the low gravity
  for (const [k, x, z] of [['mug', 3, 2], ['bottle', 9, 1], ['crystal', 19, 4.5], ['bottle', 23, 9.5], ['crystal', 26, 4.5], ['pillow', 32, 1], ['book', 36, 1], ['pillow', 38, 1.9],
    ['apple', 4, 17.8], ['orange', 8, 21.8], ['apple', 10, 25.8], ['box', 3, 31], ['box', 6, 33.5], ['can', 10, 36], ['barrel', 12, 33], ['ball', 22, 36], ['ball', 18, 40], ['mug', 25, 34], ['block', 35, 36], ['cone', 41, 41], ['box', 33, 22], ['box', 38, 20.5]])
    B.prop(k, x, k === 'pillow' || k === 'book' ? 1.6 : 0, z);
  const light = (x, y, z) => { x -= O.x; z -= O.z; let r = 0.75, g = 0.78, b = 0.85; const d = Math.hypot(x - 22, z - 22); const k = 0.7*Math.exp(-d/5); r += k*0.4; g += k*0.9; b += k*1.2;
    if (x > 29.5 && z > 18 && z < 26){ const a = 0.25; r += a; g -= a*0.3; b -= a*0.3; } return [r*(0.75 + 0.25*y/HT), g*(0.75 + 0.25*y/HT), b*(0.75 + 0.25*y/HT)]; };
  const grp = B.finish(light), nav = buildNav(B.solids, O, 44, 2, [0]);
  // airlock doors (slide up), the stars and the planet (they follow you, like a sky)
  const doorMat = lam(0xc9d0d8), doorFr = lam(0xf2c230);
  const mkDoor = (x) => { const g = new T3.Group(); const m = new T3.Mesh(new T3.BoxGeometry(0.2, AH, AZ1 - AZ0), doorMat); g.add(m); const s = new T3.Mesh(new T3.BoxGeometry(0.22, 0.3, AZ1 - AZ0), doorFr); s.position.y = -AH/2 + 0.2; g.add(s);
    g.position.set(x + O.x, AH/2, (AZ0 + AZ1)/2 + O.z); grp.add(g); return {g, box:dynBox(), x}; };
  const inner = mkDoor(AX0 - 0.15), outer = mkDoor(AX1 + 0.15);
  const sky = new T3.Group(); grp.add(sky);
  { const n = 1400, pos = new Float32Array(n*3); for (let i=0;i<n;i++){ const v = new V(R()*2-1, R()*2-1, R()*2-1).normalize().multiplyScalar(70); pos[i*3] = v.x; pos[i*3+1] = v.y; pos[i*3+2] = v.z; }
    const gs = new T3.BufferGeometry(); gs.setAttribute('position', new T3.BufferAttribute(pos, 3));
    sky.add(new T3.Points(gs, new T3.PointsMaterial({color:0xffffff, size:2, sizeAttenuation:false, fog:false})));
    const planetT = canvasTex(256, 128, (g,w,h) => { g.fillStyle = '#1d5fb8'; g.fillRect(0,0,w,h); for (let i=0;i<26;i++){ g.fillStyle = i % 3 ? '#3f9a4a' : '#c9b070'; g.beginPath(); g.ellipse(R()*w, 20 + R()*(h-40), 8 + R()*26, 5 + R()*14, R()*3, 0, 7); g.fill(); } for (let i=0;i<40;i++){ g.fillStyle = 'rgba(255,255,255,.6)'; g.fillRect(R()*w, R()*h, 10 + R()*40, 2 + R()*3); } });
    const pl = new T3.Mesh(new T3.SphereGeometry(30, 32, 20), new T3.MeshLambertMaterial({map:planetT, fog:false, emissive:0x0a1a30})); pl.position.set(25, -38, 40); sky.add(pl);
    const sun = new T3.Mesh(new T3.SphereGeometry(3, 16, 10), new T3.MeshBasicMaterial({color:0xfff4d0, fog:false})); sun.position.set(-50, 30, -35); sky.add(sun); sky.userData.planet = pl; }
  const P0 = 40, inside = p => p.x > O.x - 0.2 && p.x < O.x + AX1 + 0.3 && p.z > O.z - 0.2 && p.z < O.z + 44.2 && p.y > -0.5 && p.y < HT + 0.6;
  const inLock = p => p.x > O.x + AX0 - 0.1 && p.x < O.x + AX1 + 0.3 && p.z > O.z + AZ0 && p.z < O.z + AZ1 && p.y < AH + 0.5;
  let lostT = 0, warned = false, phWas = 0;
  const alarm = () => { if (!AC) return; tone('square', 880, 660, 0.25, 0.06); };
  const whoosh = () => { if (!AC) return; noiseHit(2.5, 900, 0.4, 1.0); noiseHit(1.5, 3000, 0.6, 0.4); };
  const moonIdea = (bot, imp) => { if (imp || !bot.cell || R() > 0.4) return null; const [cx, cz, l] = bot.cell, opts = [];
    for (const [dx, dz] of [[2,0],[-2,0],[0,2],[0,-2],[1,1],[-1,1],[1,-1],[-1,-1]]) if (NAV.ok(cx + dx, cz + dz, l) && NAV.ok(cx + Math.sign(dx), cz + Math.sign(dz), l)) opts.push([cx + dx, cz + dz, l]);
    if (!opts.length) return null; const c = pick(opts), to = cellPos(...c); let t = 0, from = null; const H_ = 2.2 + R()*1.2, T_ = 1.8;
    return {step(b, dt){ const r = b.root, sk = r.szK || 1; if (!from){ from = r.obj.position.clone(); say(b, pick(['one small step','moon jump!','floaty floaty','I can fly (kind of)'])); }
      t += dt; const k = Math.min(1, t/T_); r.obj.position.set(from.x + (to.x - from.x)*k, NAV.lv[l] + STAND*sk + Math.sin(k*Math.PI)*H_, from.z + (to.z - from.z)*k); botYaw(b, yawOf(to.clone().sub(from)), dt);
      botLimbs(b, j => -0.3 + Math.sin(t*3 + j)*0.3, j => 1.8 + Math.sin(t*4 + j*2)*0.6, 0); setFace(b, 'happy'); if (k >= 1){ b.cell = c; return false; } return true; }}; };
  MAPS.station = {name:'SPACE STATION', O, botIdea:moonIdea, group:grp, spawn:new V(22, 0, 17).add(O), yaw:Math.PI, nav, yMin:-60, yMax:80, props:B.props, g:0.3,
    sky:{bg:0x01020a, fog:0x01020a, near:40, far:80, hs:0xf4f8ff, hg:0x60708a, hi:0.9, ac:0xffffff, ai:0.35},
    update(dt, inGame){
      sky.position.copy(lastPlayer); sky.rotation.y += dt*0.004;
      const ph = (Date.now()/1000) % P0, warn = ph > 29 && ph < 33, open = ph >= 33 && ph < 38.5;
      const ik = ph < 30 ? 0 : ph < 31.5 ? (ph - 30)/1.5 : ph < 39 ? 1 : ph < 40 ? 1 - (ph - 39) : 0;
      const ok = ph < 33 ? 0 : ph < 33.5 ? (ph - 33)/0.5 : ph < 38 ? 1 : ph < 38.6 ? 1 - (ph - 38)/0.6 : 0;
      inner.g.position.y = AH/2 + (1 - ik)*(AH - 0.15); outer.g.position.y = AH/2 + ok*(AH - 0.15);
      for (const d of [inner, outer]){ const y0 = d.g.position.y - AH/2; setDyn(d.box, d.x + O.x - 0.12, y0, AZ0 + O.z, d.x + O.x + 0.12, y0 + AH, AZ1 + O.z); }
      B.bins.red.m.color.setHex(warn || open ? ((ph*4) % 1 < 0.5 ? 0xff2010 : 0x330606) : 0x661010);
      if (inGame && warn && (ph*2.5) % 1 < (phWas*2.5) % 1 && lastPlayer.distanceTo(new V(O.x + 44, 1, O.z + 22)) < 20) alarm();
      if (inGame && ph > 29 && phWas <= 29 && lastPlayer.distanceTo(new V(O.x + 44, 1, O.z + 22)) < 25) announce('Airlock cycling. Clear the airlock.');
      if (inGame && open && phWas < 33 && lastPlayer.distanceTo(new V(O.x + 44, 1, O.z + 22)) < 25) whoosh();
      phWas = ph;
      if (!inGame){ window.gravK = gravK = 0.3; lostT = 0; return; }
      // you: low gravity inside, none outside; sucked out when the outer door opens
      const h = loco.headPos(), body = h.clone().add(new V(0, -0.6, 0)), isIn = inside(body);
      window.gravK = gravK = isIn ? 0.3 : 0;
      if (!isIn){ loco.S.velocity.multiplyScalar(1 - 0.3*dt); }
      if (open && inLock(body)){ const v = loco.S.velocity; v.x = Math.max(v.x, 7); v.y += (R()-0.4)*dt*6; pulse(0, 0.6, 30); pulse(1, 0.6, 30); }
      if (!isIn){ lostT += dt; if (!warned){ warned = true; showMsg('LOST IN SPACE! Grapple back to the station!'); } if (lostT > 12){ lostT = 0; warned = false; die('the vacuum of space'); } }
      else { lostT = 0; warned = false; }
      // pieces: the same rules, and the ones far out in space are gone
      for (const p of parts){
        if (p.parent || p.obj.userData.dead || !mine(p) || p.mode === 'held' || p.stuck) continue;
        if (p.bot && p.mode === 'bot' && impGame()) continue;          // imposter: robots never get spaced (they don't come back)
        const c = centerW(p), pin = inside(c);
        if (pin){ if (p.grav === 0) p.grav = undefined; } else p.grav = 0;
        if (open && inLock(c)){ if (p.bot && p === p.bot.root && p.mode === 'bot'){ p.mode = 'free'; p.bot.stunT = 3; say(p.bot, pick(['NOOOOO','I can see my house from here','goodbye cruel station'])); }
          p.mode = 'free'; p.asleep = false; p.v.x = Math.max(p.v.x, 10 + R()*4); p.v.y += (R()-0.5)*3*dt; p.w.add(new V(R()-0.5, R()-0.5, R()-0.5).multiplyScalar(dt*20)); }
        if (!pin){ p.asleep = false; if (c.distanceTo(new V(O.x + 22, 3, O.z + 22)) > 70) removePart(p); }
      }
    },
    leave(){ window.gravK = gravK = 1; }};
}

// ======================= FACTORY =======================
// A robot factory. Conveyor belts carry anything (and anyone) that lands on them. Feed scrap into the
// ASSEMBLER's belt and every 5 pieces it builds a brand-new robot. The middle line runs under a CRUSHER
// and ends in the furnace. Catwalks up top.
{
  const O = new V(0, 0, 800), B = mapBuilder(O, 'factory'); mapSeed = 8181;
  const concT = tex(256, 256, (g,w,h) => { g.fillStyle = '#7a7872'; g.fillRect(0,0,w,h); noiseFill(g, w, h, 6000, 'rgba(30,30,30,A)', 0.2, 2); noiseFill(g, w, h, 200, 'rgba(60,40,20,A)', 0.2, 10); });
  const corrT = tex(128, 128, (g,w,h) => { for (let x=0;x<w;x+=16){ const gr = g.createLinearGradient(x,0,x+16,0); gr.addColorStop(0,'#5d6a74'); gr.addColorStop(0.5,'#8a98a3'); gr.addColorStop(1,'#5d6a74'); g.fillStyle = gr; g.fillRect(x,0,16,h); } noiseFill(g, w, h, 400, 'rgba(90,50,20,A)', 0.2, 3); });
  const hazT = tex(64, 64, (g,w,h) => { g.fillStyle = '#1c1d20'; g.fillRect(0,0,w,h); g.fillStyle = '#f2c230'; for (let i=-2;i<4;i++){ g.beginPath(); g.moveTo(i*32, 0); g.lineTo(i*32+16, 0); g.lineTo(i*32+16+64, h); g.lineTo(i*32+64, h); g.fill(); } });
  const beltX = canvasTex(64, 64, (g,w,h) => { g.fillStyle = '#1c1d20'; g.fillRect(0,0,w,h); g.fillStyle = '#3a3d42'; for (let x=0;x<w;x+=16) g.fillRect(x, 0, 6, h); }, true);
  const grateT = canvasTex(64, 64, (g,w,h) => { g.fillStyle = '#20242a'; g.fillRect(0,0,w,h); g.fillStyle = '#8a929b'; for (let i=0;i<w;i+=8){ g.fillRect(i, 0, 2, h); g.fillRect(0, i, w, 2); } }, true);
  const signT = canvasTex(512, 128, (g,w,h) => { g.fillStyle = '#f2c230'; g.fillRect(0,0,w,h); g.fillStyle = '#1c1d20'; g.font = 'bold 54px Rubik, sans-serif'; g.textAlign = 'center'; g.fillText('ROBOT ASSEMBLER', w/2, 62); g.font = '30px Rubik, sans-serif'; g.fillText('feed scrap on the belt', w/2, 106); });
  const crushT = canvasTex(256, 64, (g,w,h) => { g.fillStyle = '#d8302a'; g.fillRect(0,0,w,h); g.fillStyle = '#fff'; g.font = 'bold 40px Rubik, sans-serif'; g.textAlign = 'center'; g.fillText('DANGER', w/2, 46); });
  B.mat('conc', lam(0xffffff, {map:concT, vertexColors:true})).mat('corr', lam(0xffffff, {map:corrT, vertexColors:true})).mat('haz', lam(0xffffff, {map:hazT, vertexColors:true}))
   .mat('belt', lam(0xffffff, {map:beltX, vertexColors:true})).mat('grate', lam(0xffffff, {map:grateT, vertexColors:true, transparent:true, opacity:0.95})).mat('steel', lam(0x8a929b, {vertexColors:true}))
   .mat('yellow', lam(0xf2c230, {vertexColors:true})).mat('blue', lam(0x2f62c8, {vertexColors:true})).mat('dark', lam(0x2a2c30, {vertexColors:true})).mat('rust', lam(0x8a4a2a, {vertexColors:true}))
   .mat('sign', new T3.MeshBasicMaterial({map:signT})).mat('crushS', new T3.MeshBasicMaterial({map:crushT})).mat('lamp', new T3.MeshBasicMaterial({color:0xfff0c0})).mat('sky', new T3.MeshBasicMaterial({color:0xd8e8f4}))
   .mat('fire', new T3.MeshBasicMaterial({color:0xff6a10})).mat('green', lam(0x3f9a4a, {vertexColors:true})).mat('crate', lam(0xb08850, {vertexColors:true}));
  const HT = 9, T = 0.3, BT = 0.6;
  B.box('conc', [-1, -1, -1], [45, 0, 45], {us:3});
  for (const [a, b] of [[[-0.5,0,-0.5],[0,HT,44.5]], [[44,0,-0.5],[44.5,HT,44.5]], [[0,0,-0.5],[44,HT,0]], [[0,0,44],[44,HT,44.5]]]) B.box('corr', a, b, {us:3});
  B.box('steel', [-1, HT, -1], [45, HT + 0.4, 45], {us:2});
  for (let x=4;x<44;x+=8) B.box('sky', [x, HT - 0.02, 2], [x + 3, HT, 42], {solid:false});
  for (let x=2;x<44;x+=4) B.box('dark', [x, HT - 0.7, 0], [x + 0.25, HT, 44], {solid:false});
  // floor markings
  for (const z of [8, 12, 20, 24, 32, 36]) B.box('yellow', [1, 0, z], [43, 0.006, z + 0.12], {solid:false});
  // belts: [x0, x1, zc, dir]
  const belts = [{x0:3, x1:24, z:10, d:1, k:'in'}, {x0:31, x1:41.5, z:10, d:1, k:'out'}, {x0:2.5, x1:40.5, z:22, d:1, k:'crush'}, {x0:3, x1:41, z:34, d:-1, k:'loop'}];
  for (const bt of belts){
    B.box('dark', [bt.x0, 0, bt.z - 0.65], [bt.x1, BT - 0.05, bt.z + 0.65]); B.box('belt', [bt.x0, BT - 0.05, bt.z - 0.6], [bt.x1, BT, bt.z + 0.6], {us:0.5});
    for (const s of [-1, 1]) B.box('yellow', [bt.x0, BT, bt.z + s*0.62 - 0.03], [bt.x1, BT + 0.12, bt.z + s*0.62 + 0.03]);
    for (let x=bt.x0 + 1; x<bt.x1; x+=3) for (const s of [-1, 1]) B.box('steel', [x, 0, bt.z + s*0.66 - 0.05], [x + 0.1, BT - 0.05, bt.z + s*0.66 + 0.05], {solid:false});
  }
  // the assembler
  const AS = [24, 31, 6, 14];
  B.box('blue', [AS[0], 0, AS[2]], [AS[1], 4.2, 9.2]); B.box('blue', [AS[0], 0, 10.8], [AS[1], 4.2, AS[3]]); B.box('blue', [AS[0], 1.6, 9.2], [AS[1], 4.2, 10.8]); B.box('dark', [AS[0] + 0.5, 0, 9.2], [AS[1] - 0.5, 1.6, 10.8], {solid:false, skip:['x+','x-','y+','y-']}); B.box('yellow', [AS[0] - 0.03, 3.6, AS[2] - 0.03], [AS[1] + 0.03, 4.17, AS[3] + 0.03], {solid:false});
  B.box('dark', [AS[0] + 1.5, 0, 9.2], [AS[0] + 1.6, 1.6, 10.8], {solid:false}); B.box('dark', [AS[1] - 1.6, 0, 9.2], [AS[1] - 1.5, 1.6, 10.8], {solid:false});
  B.geo('sign', new T3.PlaneGeometry(4.4, 1.1), 27.5, 2.6, AS[2] - 0.015, 0, Math.PI, 0); B.geo('sign', new T3.PlaneGeometry(4.4, 1.1), 27.5, 2.6, AS[3] + 0.015, 0, 0, 0);
  for (const x of [25, 30]) B.cyl('steel', 0.4, 0.4, 1.5, x, 4.2, 10, 12);
  // the crusher over the middle line
  const CX = 21.5, CW = 1.4;
  for (const s of [-1, 1]){ B.box('haz', [CX - CW - 0.4, 0, 22 + s*1.05 - 0.2], [CX - CW, 4.8, 22 + s*1.05 + 0.2]); B.box('haz', [CX + CW, 0, 22 + s*1.05 - 0.2], [CX + CW + 0.4, 4.8, 22 + s*1.05 + 0.2]); }
  B.box('steel', [CX - CW - 0.4, 4.8, 20.75], [CX + CW + 0.4, 5.4, 23.25]); B.geo('crushS', new T3.PlaneGeometry(2.4, 0.6), CX, 5.1, 20.74, 0, Math.PI, 0);
  // the furnace at the end of the middle line
  B.box('rust', [40.6, 0, 19.8], [43.8, 3, 20.2]); B.box('rust', [40.6, 0, 23.8], [43.8, 3, 24.2]); B.box('rust', [43.4, 0, 20.2], [43.8, 3, 23.8]); B.box('rust', [40.6, 2.4, 20.2], [43.4, 3, 23.8]);
  B.box('fire', [40.7, 0.01, 20.3], [43.3, 0.05, 23.7], {solid:false});
  // catwalk along the back wall with stairs up the west side
  const CY = 3.6;
  B.box('grate', [0, CY - 0.12, 40], [44, CY, 44], {us:1}); for (let x=0;x<44;x+=2) if (x !== 30 && x !== 32) B.box('steel', [x, CY, 39.95], [x + 0.06, CY + 1.05, 40.01], {solid:false}); for (const [a, b] of [[0, 30], [32, 44]]) B.box('yellow', [a, CY + 1.0, 39.95], [b, CY + 1.06, 40.05]);
  B.solid([2, CY, 39.9], [30, CY + 1.06, 40.05]); B.solid([32, CY, 39.9], [44, CY + 1.06, 40.05]);
  for (let i=0;i<12;i++) B.box('steel', [0.4, 0, 28 + i], [2, (i + 1)*CY/12, 29 + i]);
  B.box('grate', [0.4, CY - 0.12, 39.9], [2, CY, 40]);
  // a second catwalk across the middle, over the crusher line, reached from the back one
  B.box('grate', [30, CY - 0.12, 17], [32, CY, 40], {us:1}); for (const x of [30, 32]) B.box('yellow', [x - 0.03, CY + 1.0, 17], [x + 0.03, CY + 1.06, 40]);
  // the open end of the middle catwalk gets the rail instead (the back one now has a gap where they meet)
  B.box('yellow', [30, CY + 1.0, 16.97], [32, CY + 1.06, 17.03]); for (const x of [30, 31, 31.94]) B.box('steel', [x, CY, 16.97], [x + 0.06, CY + 1.0, 17.03], {solid:false}); B.solid([30, CY, 16.9], [32, CY + 1.06, 17.03]);
  for (const z of [17, 27]) for (const x of [30.1, 31.8]) B.box('steel', [x, 0, z], [x + 0.1, CY - 0.12, z + 0.1]);
  // stuff: tanks, crates, barrels, shelves
  for (const [x, z] of [[4, 2], [8, 2], [12, 2]]){ B.cyl('steel', 1.3, 1.3, 4.5, x, 0, z + 0.3, 16); B.cyl('dark', 1.35, 1.35, 0.2, x, 4.5, z + 0.3, 16); }
  for (const [x, z, n] of [[36, 2, 3], [39, 2, 2], [42, 2, 1], [36, 14.5, 1], [6, 27, 2], [9, 27, 1]]) for (let k=0;k<n;k++) B.box('crate', [x, k*1.0, z], [x + 1.8, k*1.0 + 0.95, z + 1.8]);
  for (let x=12;x<26;x+=3.5){ B.box('steel', [x, 0, 42.6], [x + 3, 0.05, 43.8]); for (const y of [1.2, 2.4]) B.box('steel', [x, y, 42.6], [x + 3, y + 0.05, 43.8]); for (const xx of [x, x + 2.9]) B.box('steel', [xx, 0, 42.6], [xx + 0.1, 3, 43.8]); }
  for (let k=0;k<3;k++) B.box('lamp', [8 + k*14, HT - 1.2, 21.6], [9 + k*14, HT - 1.1, 22.4], {solid:false});
  for (const [k, x, z] of [['box', 5, 10], ['box', 8, 10], ['barrel', 2, 17], ['barrel', 3, 18], ['cone', 19, 19], ['cone', 24, 19], ['can', 14, 22], ['bottle', 13, 34], ['box', 20, 34], ['box', 30, 34],
    ['block', 37, 9], ['block', 38, 12], ['barrel', 40, 28], ['cone', 15, 15], ['trashcan', 42, 16], ['box', 13, 42.8]]) B.prop(k, x, k === 'box' && z === 34 || (z === 10 && x < 20) ? BT : 0, z);
  const lamps = []; for (let x=4;x<44;x+=8) for (const z of [6, 18, 30, 40]) lamps.push([x, HT - 1, z]);
  const light = (x, y, z) => { x -= O.x; z -= O.z; let r = 0.42, g = 0.43, b = 0.46; for (const [lx, ly, lz] of lamps){ const d = Math.hypot(x - lx, y - ly, z - lz), k = 0.9*Math.exp(-d/6); r += k; g += k*0.95; b += k*0.82; }
    const f = Math.hypot(x - 42, z - 22); if (f < 6){ const k = 1.2*Math.exp(-f/2); r += k; g += k*0.45; b += k*0.1; } return [r, g, b]; };
  const grp = B.finish(light), nav = buildNav(B.solids, O, 44, 2, [0]);
  // moving parts: crusher head, robot arms, the assembler's counter
  const head = new T3.Mesh(new T3.BoxGeometry(CW*2 - 0.1, 1.0, 1.7), lam(0x50555c)); grp.add(head); const plate = new T3.Mesh(new T3.BoxGeometry(CW*2 - 0.05, 0.12, 1.75), lam(0x2a2c30)); plate.position.y = -0.5; head.add(plate);
  const headBox = dynBox();
  const siren = new T3.Mesh(new T3.CylinderGeometry(0.18, 0.2, 0.3, 12), new T3.MeshBasicMaterial({color:0x400404})); siren.position.set(CX + O.x, 5.55, 22 + O.z); grp.add(siren);
  const sirenL = new T3.Mesh(new T3.ConeGeometry(0.9, 3, 12, 1, true), new T3.MeshBasicMaterial({color:0xff2010, transparent:true, opacity:0.18, depthWrite:false, side:T3.DoubleSide})); sirenL.geometry.translate(0, -1.5, 0); sirenL.rotation.z = 0; sirenL.position.copy(siren.position); sirenL.visible = false;
  const beam = new T3.Group(); beam.position.copy(siren.position); grp.add(beam); sirenL.position.set(0, 0, 0); sirenL.rotation.x = Math.PI/2.6; beam.add(sirenL); Object.defineProperty(sirenL, '_b', {value:beam});
  let sirenWas = false;
  const scrC = document.createElement('canvas'); scrC.width = 256; scrC.height = 96; const scrT = new T3.CanvasTexture(scrC); scrT.encoding = T3.sRGBEncoding;
  const scr = new T3.Mesh(new T3.PlaneGeometry(1.6, 0.6), new T3.MeshBasicMaterial({map:scrT})); scr.position.set(AS[0] - 0.03 + O.x, 2.6, 7.6 + O.z); scr.rotation.y = -Math.PI/2;      // on the assembler's west wall grp.add(scr);
  const scr2 = scr.clone(); scr2.position.set(27.5 + O.x, 1.4, AS[2] - 0.03 + O.z); scr2.rotation.y = Math.PI; grp.add(scr2);
  let scrap = 0, need = 5, rejectT = 0;
  const drawScr = () => { const g = scrC.getContext('2d'); g.fillStyle = '#04121c'; g.fillRect(0,0,256,96); g.fillStyle = '#7fffa0'; g.font = 'bold 40px monospace'; g.textAlign = 'center'; g.fillText('SCRAP ' + scrap + '/' + need, 128, 58); scrT.needsUpdate = true; };
  drawScr();
  const arms = [];
  for (const [x, z, s] of [[14, 11.6, 1], [18, 8.4, -1], [35, 11.6, 1], [11, 23.6, 1], [28, 20.4, -1]]){
    const base = new T3.Group(); base.position.set(x + O.x, 0, z + O.z); grp.add(base);
    const m1 = new T3.Mesh(new T3.CylinderGeometry(0.35, 0.45, 0.5, 12), lam(0xf2c230)); m1.position.y = 0.25; base.add(m1);
    const sh = new T3.Group(); sh.position.y = 0.5; base.add(sh); const up = new T3.Mesh(new T3.BoxGeometry(0.22, 1.2, 0.22), lam(0xf2c230)); up.position.y = 0.6; sh.add(up);
    const el = new T3.Group(); el.position.y = 1.2; sh.add(el); const fo = new T3.Mesh(new T3.BoxGeometry(0.18, 0.9, 0.18), lam(0x2a2c30)); fo.position.y = 0.45; el.add(fo);
    const tip = new T3.Mesh(new T3.SphereGeometry(0.09, 8, 6), new T3.MeshBasicMaterial({color:0x6ad0ff})); tip.position.y = 0.95; el.add(tip);
    arms.push({base, sh, el, s, ph:R()*6}); }
  const sndHiss = () => { if (!AC) return; noiseHit(0.4, 4000, 0.8, 0.25); };
  const sndBang = (v) => { if (!AC) return; noiseHit(0.35, 300, 0.8, 0.9*v); tone('sine', 80, 30, 0.4, 0.6*v); noiseHit(0.1, 2000, 2, 0.4*v); };
  const ding = () => { if (!AC) return; tone('sine', 1320, 1320, 0.25, 0.15); setTimeout(() => tone('sine', 1760, 1760, 0.4, 0.15), 180); };
  const onBelt = (c, bt, pad) => c.x > bt.x0 + O.x - pad && c.x < bt.x1 + O.x + pad && Math.abs(c.z - bt.z - O.z) < 0.65 + pad;
  let slamWas = false, crushedT = -9;
  const crushZone = c => Math.abs(c.x - CX - O.x) < CW - 0.05 && Math.abs(c.z - 22 - O.z) < 0.9;
  const addScrap = (n) => { scrap += n; if (netGame) netSend('ev', {t:'mapev', m:'factory', k:'n', n:scrap});
    if (scrap >= need){ scrap = 0; if (netGame) netSend('ev', {t:'mapev', m:'factory', k:'n', n:0});
      const pos = new V(42.4 + O.x, 0.5, 12.5 + O.z), b = makeBot(pick(BOT_COLORS), pos);
      if (netGame) netSend('ev', {t:'spawn', b:b.id, c:b.color, x:r3(pos.x), y:r3(pos.y), z:r3(pos.z)});
      say(b, pick(['hello world','I am new here','fresh off the line','who made me?'])); spawnSparks(pos.clone().add(new V(0, 1, 0)), 60, 3); flash(pos.clone().add(new V(0, 1, 0)), 1.0); ding();
      if (lastPlayer.distanceTo(pos) < 30) showMsg('NEW ROBOT ASSEMBLED!'); }
    drawScr(); };
  // robots think the crusher belt is a ride: they hop on, surf it, and either jump off just in time... or don't
  const surfIdea = (bot, imp) => { if (imp || R() > 0.3) return null; const bt = belts[2], x0 = bt.x0 + 1.5 + R()*8, side = R() < 0.5 ? -1 : 1, zs = bt.z + side*1.6, chicken = R() < 0.4;
    return actWalk(new V(x0 + O.x, 0, zs + O.z), [], {then:(b, failed) => { if (failed) return null; let t = 0, ph = 0, from = b.root.obj.position.clone();
      say(b, pick(['conveyor surfing!!','watch this','wheee','hold my oil'])); setFace(b, 'happy');
      return {step(b2, dt){ t += dt; const r = b2.root, pos = r.obj.position, sk = r.szK || 1;
        if (ph === 0){ const k = Math.min(1, t/0.5); pos.set(from.x, 0, from.z).lerp(new V(x0 + O.x, 0, bt.z + O.z), k); pos.y = BT + (STAND*sk)*k + (1 - k)*STAND*sk - (1 - k)*BT + Math.sin(k*Math.PI)*0.7; botYaw(b2, Math.PI/2*bt.d); botLimbs(b2, -0.4, 2.4, 0); if (k >= 1){ ph = 1; t = 0; } return true; }
        if (ph === 1){ pos.x += bt.d*1.3*dt; pos.y = BT + STAND*sk + Math.sin(t*9)*0.02; botLimbs(b2, j => (j ? 1 : -1)*0.25, j => 1.5 + Math.sin(t*6 + j*3)*0.5, 0); botYaw(b2, Math.PI/2*bt.d);
          if (chicken && pos.x > CX - CW - 3.2 + O.x){ ph = 2; t = 0; from = pos.clone(); say(b2, pick(['NOPE','too spicy','not today crusher'])); }
          if (!chicken && pos.x > CX - CW - 0.6 + O.x){ say(b2, pick(['uh oh','wait no','I regret this'])); setFace(b2, 'scared'); r.mode = 'free'; r.asleep = false; r.v.set(bt.d*1.3, 0, 0); b2.noGetUp = clock + 8; return false; }
          return true; }
        const k = Math.min(1, t/0.5); pos.set(from.x, 0, from.z).lerp(new V(from.x + 0.6, 0, bt.z + side*1.7 + O.z), k); pos.y = BT + STAND*sk + (0 - BT)*k + Math.sin(k*Math.PI)*0.7; botLimbs(b2, -0.4, 2.4, 0); return k < 1; }}; }}); };
  MAPS.factory = {name:'FACTORY', O, botIdea:surfIdea, group:grp, spawn:new V(10, 0, 16).add(O), yaw:Math.PI*0.5, nav, yMin:-5, yMax:HT + 2, props:B.props,
    sky:{bg:0x2a2c30, fog:0x3a3c40, near:16, far:55, hs:0xfff4e0, hg:0x4a4a50, hi:0.8, ac:0xffffff, ai:0.3},
    onEv(ev){ if (ev.k === 'scrap' && isHost()) addScrap(ev.n || 1); else if (ev.k === 'n'){ scrap = ev.n; drawScr(); } },
    update(dt, inGame){
      const t = Date.now()/1000, ph = t % 4;          // up, siren, then it drops
      const hy = ph < 2.6 ? 3.05 : ph < 2.78 ? 3.05 - (ph - 2.6)/0.18*2.4 : ph < 3.3 ? 0.65 : 0.65 + (ph - 3.3)/0.7*2.4;
      const warn = ph > 1.0 && ph < 3.3, on = warn && (t*3) % 1 < 0.5;
      siren.material.color.setHex(warn ? (on ? 0xff1a10 : 0x400404) : 0x400404); sirenL.visible = warn; beam.rotation.y = t*7;
      if (warn && on !== sirenWas && on && inGame && lastPlayer.distanceTo(head.position) < 18 && AC) tone('square', 760, 560, 0.25, 0.05); sirenWas = on;
      head.position.set(CX + O.x, hy + 0.5, 22 + O.z); setDyn(headBox, CX - CW + 0.05 + O.x, hy, 21.15 + O.z, CX + CW - 0.05 + O.x, hy + 1.0, 22.85 + O.z);
      const slam = ph >= 2.72 && ph < 3.3;
      if (slam && !slamWas){ const d = lastPlayer.distanceTo(head.position); sndBang(Math.min(1, 4/(1 + d))); spawnSparks(new V(CX + O.x, BT + 0.1, 22 + O.z), 30, 3); }
      if (ph > 3.3 && ph < 3.36) sndHiss();
      slamWas = slam;
      for (const a of arms){ const k = t*1.3 + a.ph; a.base.rotation.y = Math.sin(k*0.7)*1.2; a.sh.rotation.z = a.s*(0.5 + Math.sin(k)*0.35); a.el.rotation.z = a.s*(0.9 + Math.sin(k*1.4)*0.4); }
      if (!inGame) return;
      if (lastPlayer.distanceTo(new V(42 + O.x, 0.5, 22 + O.z)) < 16 && R() < 0.8) emitFire(new V(41 + R()*2.2 + O.x, 0.1, 20.6 + R()*2.8 + O.z), new V((R()-0.5)*0.3, 1 + R()*0.8, (R()-0.5)*0.3), 0.1 + R()*0.08, 0.5 + R()*0.3);
      const hd = loco.headPos(), fy = floorBelow(hd), feet = hd.clone().setY(fy);
      // you ride the belts
      let carried = false;
      for (const bt of belts){ if (onBelt(feet, bt, -0.1) && Math.abs(fy - BT) < 0.12 && hd.y - fy < 2.4) carried = bt;
        for (const i of [0,1]) if (!carried && !me.lost[i] && onBelt(handW[i], bt, 0.05) && handW[i].y > BT - 0.15 && handW[i].y < BT + 0.1) carried = bt; if (carried) break; }
      if (carried){ const dx = carried.d*1.3*dt; rig.position.x += dx; for (const i of [0,1]) if (onBelt(loco.S.lastHand[i], carried, 0.1) && Math.abs(loco.S.lastHand[i].y - BT) < 0.25) loco.S.lastHand[i].x += dx; }
      if (slam && hy < 1.6 && crushZone(hd) && hd.y < hy + 2.2 && hd.y > -1 && clock - crushedT > 3){ crushedT = clock;
        // one big CRUNCH, not a stream of sparks
        const at = hd.clone().setY(BT + 0.2); sndBang(1); if (AC){ noiseHit(0.6, 180, 0.6, 1.0); tone('sawtooth', 220, 40, 0.5, 0.25); noiseHit(0.25, 1400, 1.5, 0.5); }
        debris(at, 0x3c4048); debris(at, 0x26292e); flash(at, 1.2); pulse(0, 1, 400); pulse(1, 1, 400); die('the crusher'); }
      if (feet.x > 40.7 + O.x && feet.x < 43.3 + O.x && feet.z > 20.3 + O.z && feet.z < 23.7 + O.z && hd.y < 2.2) igniteMe('torso', 'the furnace');
      for (const p of parts.slice()){
        if (p.parent || p.obj.userData.dead || !mine(p) || p.mode === 'held' || p.stuck) continue;
        const c = centerW(p);
        if (slam && hy < 1.4 && crushZone(c) && c.y < 1.7){
          const root = p, all = subtree(root); quietFx = true; for (const q of all.slice().reverse()) if (q.parent) detach(q, new V((R()-0.5)*4, 2, (R()-0.5)*4));
          for (const q of all) if (!q.obj.userData.dead && q.name !== 'mine'){ if (q.r >= 0.05) shatter(q, false, Array.from({length:3}, (_, k) => ({id:q.id ? q.id + 'x' + k : null, s:0.03 + R()*0.03})), new V(0, 2, 0)); else removePart(q); }
          quietFx = false; if (root.bot && !root.bot.dead) killBot(root.bot); continue;
        }
        if (c.x > AS[0] - 0.15 + O.x && c.x < AS[1] - 0.2 + O.x && Math.abs(c.z - 10 - O.z) < 0.85 && c.y < 1.7 && (p.name === 'chunk' || (p.planes && p.planes.length))){
          // only whole parts count: chainsaw halves and smashed bits get spat out as smoke (and don't pile up)
          emitAsh(c, 8, 0.3); removePart(p); if (clock > rejectT && c.distanceTo(lastPlayer) < 14){ rejectT = clock + 4; if (AC) tone('square', 160, 90, 0.25, 0.08); showMsg('ASSEMBLER: whole parts only! (no chopped or smashed bits)'); } continue; }
        if (c.x > AS[0] - 0.15 + O.x && c.x < AS[1] - 0.2 + O.x && Math.abs(c.z - 10 - O.z) < 0.85 && c.y < 1.7){ spawnSparks(c, 20, 2); if (p.bot && !p.bot.dead) killBot(p.bot); removePart(p); if (!netGame || isHost()) addScrap(1); else netSend('ev', {t:'mapev', m:'factory', k:'scrap', n:1}); continue; }
        if (p.bot && !p.bot.dead && p === p.bot.root && p.mode === 'bot') continue;
        if (c.x > 40.7 + O.x && c.x < 43.3 + O.x && c.z > 20.3 + O.z && c.z < 23.7 + O.z && c.y < 1.0){ for (let k=0;k<6;k++) emitFire(c.clone(), new V((R()-0.5), 1.5 + R(), (R()-0.5)), 0.08, 0.5); removePart(p); continue; }
        for (const bt of belts){
          if (!onBelt(c, bt, 0) || c.y < BT - 0.1 || c.y > BT + 0.9) continue;
          if (p.name === 'mine'){ mineTrigger(p); break; }
          p.mode = 'free'; p.asleep = false; p.obj.position.x += bt.d*1.3*dt; p.obj.position.z += (bt.z + O.z - c.z)*dt*1.5; p.v.x *= 0.9; p.v.z *= 0.9;
          if (bt.k === 'loop' && c.x < bt.x0 + O.x + 0.4 && p.name === 'prop'){ p.obj.position.x += 37; p.v.set(0, 0, 0); }
          break;
        }
      }
    }};
}

// ======================= HAUNTED MANSION =======================
// A dark old mansion in a graveyard, lit by candles and lightning. Quirk: GHOST ROBOTS haunt the back
// rooms, and you can only see them in the MIRRORS. They creep up behind you, knock things over, and
// their touch is freezing cold.
{
  const O = new V(0, 0, 1000), B = mapBuilder(O, 'mansion'); mapSeed = 1313;
  const paperT = tex(128, 128, (g,w,h) => { g.fillStyle = '#3a2440'; g.fillRect(0,0,w,h); g.fillStyle = 'rgba(160,120,170,.22)';
    for (let y=0;y<h;y+=32) for (let x=((y/32)%2)*16; x<w; x+=32){ g.beginPath(); g.moveTo(x, y + 4); g.quadraticCurveTo(x + 12, y + 16, x, y + 28); g.quadraticCurveTo(x - 12, y + 16, x, y + 4); g.fill(); } noiseFill(g, w, h, 600, 'rgba(0,0,0,A)', 0.2, 2); });
  const floorT = tex(128, 128, (g,w,h) => { for (let y=0;y<h;y+=16) for (let x=((y/16)%2)*32; x<w+64; x+=64){ g.fillStyle = `hsl(${24+R()*6},${35+R()*10}%,${22+R()*6}%)`; g.fillRect(x - 64, y, 63, 15); } noiseFill(g, w, h, 800, 'rgba(0,0,0,A)', 0.2, 2); });
  const grassT = tex(128, 128, (g,w,h) => { g.fillStyle = '#2a3020'; g.fillRect(0,0,w,h); noiseFill(g, w, h, 3000, 'rgba(70,80,40,A)', 0.4, 2); noiseFill(g, w, h, 800, 'rgba(10,10,5,A)', 0.4, 3); });
  const stoneT = tex(128, 128, (g,w,h) => { g.fillStyle = '#5a5a60'; g.fillRect(0,0,w,h); for (let y=0;y<h;y+=24) for (let x=((y/24)%2)*24; x<w+48; x+=48){ g.fillStyle = `hsl(240,4%,${30+R()*10}%)`; g.fillRect(x - 47, y + 1, 46, 22); } noiseFill(g, w, h, 700, 'rgba(40,60,30,A)', 0.3, 3); });
  const booksT = tex(128, 128, (g,w,h) => { g.fillStyle = '#2a1a10'; g.fillRect(0,0,w,h); for (let y=0;y<h;y+=32){ let x = 0; while (x < w){ const bw = 4 + R()*6; g.fillStyle = `hsl(${R()*360},${30+R()*30}%,${20+R()*20}%)`; g.fillRect(x, y + 4 + R()*6, bw - 1, 26 - R()*6); x += bw; } g.fillStyle = '#4a3020'; g.fillRect(0, y + 29, w, 3); } });
  const portT = canvasTex(128, 160, (g,w,h) => { g.fillStyle = '#c9a030'; g.fillRect(0,0,w,h); g.fillStyle = '#14101a'; g.fillRect(10,10,w-20,h-20); g.fillStyle = '#4a4a58'; g.fillRect(34, 40, 60, 50); g.fillRect(44, 90, 40, 50);
    g.fillStyle = '#ff2a1a'; g.fillRect(46, 56, 10, 8); g.fillRect(72, 56, 10, 8); g.fillStyle = '#222'; g.fillRect(50, 76, 28, 4); });
  // old black-and-white paintings of robots (drawn from boxes, like the robots themselves)
  const oldBotT = v => canvasTex(160, 200, (g, w, h) => {
    const bg = g.createRadialGradient(w/2, h*0.4, 8, w/2, h/2, w*0.85); bg.addColorStop(0, '#9a9488'); bg.addColorStop(1, '#2a2722'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, h*0.72, w, h*0.28);                      // a floor line behind them
    const bot = (cx, by, sc, hat, mono) => { const r = (c, x, y, ww, hh) => { g.fillStyle = c; g.fillRect(cx + x*sc, by + y*sc, ww*sc, hh*sc); }, o = (c, x, y, rr) => { g.fillStyle = c; g.beginPath(); g.arc(cx + x*sc, by + y*sc, rr*sc, 0, 7); g.fill(); };
      r('#33312c', -42, -52, 84, 70); r('#4e4b44', -36, -46, 72, 12); r('#262420', -14, -30, 28, 20); for (let k=0;k<3;k++) o('#77736a', -8 + k*8, -20, 2.5);   // body, chest plate, dial panel
      r('#3a3832', -54, -50, 12, 50); r('#3a3832', 42, -50, 12, 50);                    // arms
      r('#262420', -7, -64, 14, 13);                                                     // neck
      r('#6c685e', -30, -114, 60, 52); r('#57534b', -30, -114, 60, 7); r('#57534b', -30, -69, 60, 7);   // head
      o('#4a4740', -32, -88, 5); o('#4a4740', 32, -88, 5);                               // ear bolts
      for (const ex of [-13, 13]){ o('#2a2824', ex, -92, 9); o('#ece8dc', ex, -92, 6.5); o('#111', ex, -92, 2.6); }
      if (mono){ g.strokeStyle = '#d8d0b0'; g.lineWidth = 2*sc; g.beginPath(); g.arc(cx + 13*sc, by - 92*sc, 10*sc, 0, 7); g.stroke(); r('#d8d0b0', 22, -90, 1.5, 26); }
      r('#2a2824', -15, -80, 30, 6); for (let k=0;k<5;k++) r('#6c685e', -13 + k*6, -79, 2, 4);   // mouth grille
      if (hat){ r('#141310', -36, -120, 72, 7); r('#141310', -24, -158, 48, 40); r('#3a3530', -24, -128, 48, 5); }
      else { r('#33312c', -2, -134, 4, 20); o('#d8d4c8', 0, -137, 5); } };
    if (v === 0) bot(80, 205, 1.05, false, false);
    else if (v === 1){ bot(52, 200, 0.72, true, false); bot(118, 200, 0.5, false, false); }
    else bot(80, 210, 0.95, true, true);
    noiseFill(g, w, h, 1400, 'rgba(20,16,10,A)', 0.25, 2); noiseFill(g, w, h, 500, 'rgba(230,220,200,A)', 0.12, 1);
    g.strokeStyle = 'rgba(10,8,6,.22)'; g.lineWidth = 1; for (let k=0;k<26;k++){ let x = R()*w, y = R()*h; g.beginPath(); g.moveTo(x, y); for (let j=0;j<4;j++){ x += (R()-0.5)*30; y += (R()-0.5)*30; g.lineTo(x, y); } g.stroke(); }   // cracked old paint
    const vg = g.createRadialGradient(w/2, h/2, w*0.3, w/2, h/2, w*0.8); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.6)'); g.fillStyle = vg; g.fillRect(0, 0, w, h); });
  const paintT = [0, 1, 2].map(oldBotT);
  const defMats = (BB) => BB.mat('paper', lam(0xffffff, {map:paperT, vertexColors:true})).mat('floor', lam(0xffffff, {map:floorT, vertexColors:true})).mat('grass', lam(0xffffff, {map:grassT, vertexColors:true}))
    .mat('stone', lam(0xffffff, {map:stoneT, vertexColors:true})).mat('books', lam(0xffffff, {map:booksT, vertexColors:true})).mat('wood', lam(0x4a2e1c, {vertexColors:true})).mat('trim', lam(0x6b4a2b, {vertexColors:true}))
    .mat('gold', lam(0xc9a030, {vertexColors:true})).mat('dark', lam(0x15121a, {vertexColors:true})).mat('red', lam(0x6a1a1e, {vertexColors:true})).mat('sheet', lam(0xd8d4cc, {vertexColors:true})).mat('iron', lam(0x2a2a30, {vertexColors:true}))
    .mat('tree', lam(0x3a2e26, {vertexColors:true})).mat('wax', lam(0xf0e8d0, {vertexColors:true})).mat('port', new T3.MeshBasicMaterial({map:portT, color:0x6a6a6a})).mat('ceil', lam(0x2a2030, {vertexColors:true}));
  for (let i=0;i<3;i++) B.mat('paint' + i, new T3.MeshBasicMaterial({map:paintT[i], color:0xa8a298}));
  defMats(B);
  // a painting: gold frame on the wall, picture just in front. ry 0 faces +z, PI/2 faces +x
  const painting = (v, x, y, z, w, h, ry) => { const ax = Math.abs(Math.sin(ry)) > 0.5, fw = 0.09, t = 0.04;
    if (ax) B.box('gold', [x - t, y - h/2 - fw, z - w/2 - fw], [x, y + h/2 + fw, z + w/2 + fw], {solid:false}); else B.box('gold', [x - w/2 - fw, y - h/2 - fw, z - t], [x + w/2 + fw, y + h/2 + fw, z], {solid:false});
    B.geo('paint' + v, new T3.PlaneGeometry(w, h), ax ? x + 0.004 : x, y, ax ? z : z + 0.004, 0, ry, 0); };
  const HT = 5, T = 0.3, ZM = 43.6, candles = [];
  // the back rooms (bedroom, ballroom): built twice, once for real and once behind the mirrors
  const backRooms = (BB, real) => {
    BB.box('floor', [4, -0.3, 29], [40, 0, ZM], {us:2}); BB.box('ceil', [4, HT, 29], [40, HT + 0.3, ZM], {us:2});
    BB.box('paper', [4 - T, 0, 29], [4, HT, ZM], {us:2}); BB.box('paper', [40, 0, 29], [40 + T, HT, ZM], {us:2}); BB.box('paper', [15.85, 0, 29.15], [16.15, HT, ZM], {us:2});
    BB.wallRun(['paper'], 'x', 4, 40, 28.85, 29.15, 0, HT, [[9, 11, 0, 2.6], [27, 29, 0, 2.6]], 2);
    for (const [x0, x1] of [[4, 15.85], [16.15, 40]]) BB.box('wood', [x0, 0, ZM - 0.05], [x1, 0.25, ZM], {solid:false});
    // bedroom
    BB.box('wood', [5, 0, 36], [7.4, 0.5, 39.6]); BB.box('sheet', [5.05, 0.5, 36.05], [7.35, 0.65, 39.55]); BB.box('wood', [5, 0, 39.6], [7.4, 1.5, 39.8]); BB.box('red', [5.05, 0.5, 36.05], [7.35, 0.68, 37.6], {solid:false});
    for (const x of [5.4, 6.6]) BB.box('sheet', [x - 0.35, 0.65, 38.9], [x + 0.35, 0.8, 39.45]);
    BB.box('wood', [13.4, 0, 39.4], [15.8, 2.5, 41.2]); BB.box('gold', [14.55, 1.1, 39.37], [14.65, 1.4, 39.4], {solid:false});
    BB.box('wood', [7.8, 0, 39.6], [8.6, 0.6, 40.4]); BB.box('red', [5, 0.002, 32], [11, 0.01, 35], {solid:false});
    // ballroom: columns, piano, chairs, chandelier
    for (const [x, z] of [[18, 31], [38, 31], [18, 41.6], [38, 41.6]]){ BB.cyl('stone', 0.35, 0.35, HT, x, 0, z, 14); BB.cyl('gold', 0.45, 0.45, 0.3, x, 0, z, 14); }
    // grand piano: the keyboard faces +z (you sit on the bench at z 33 looking -z), the curved tail runs back to z 29.7
    { const out = [[0, 0], [1.7, 0], [1.7, -0.8], [1.45, -1.25], [0.95, -1.65], [0.6, -2.05], [0.3, -2.2], [0.06, -2.14], [0, -1.95]];   // (x from 35.4, z from 31.9)
      const shp = (inset) => { const sh = new T3.Shape(), cx = 0.85, cz = -1.0; out.forEach(([x, z], i) => { const px = cx + (x - cx)*(1 - inset), pz = cz + (z - cz)*(1 - inset); i ? sh.lineTo(px, pz) : sh.moveTo(px, pz); }); sh.closePath(); return sh; };
      const slab = (inset, d, hole) => { const sh = shp(inset); if (hole != null){ const hp = new T3.Path(shp(hole).getPoints().reverse()); sh.holes.push(hp); } const g = new T3.ExtrudeGeometry(sh, {depth:d, bevelEnabled:false}); g.rotateX(Math.PI/2); return g; };
      BB.geo('dark', slab(0, 0.3, 0.05), 35.4, 1.02, 31.9);                       // the rim
      BB.geo('dark', slab(0, 0.04, null), 35.4, 0.76, 31.9);                     // underside
      BB.geo('trim', slab(0.06, 0.02, null), 35.4, 0.9, 31.9);                   // soundboard
      BB.geo('gold', slab(0.14, 0.03, 0.3), 35.4, 0.95, 31.9);                   // the iron frame
      for (let k=0;k<14;k++){ const x = 35.55 + k*0.1, L = 0.75 + 1.2*Math.max(0, 1 - k/14); BB.box('sheet', [x, 0.93, 31.85 - L], [x + 0.008, 0.94, 31.85], {solid:false}); }   // strings
      const lid = new T3.ExtrudeGeometry(shp(0), {depth:0.025, bevelEnabled:false}); lid.rotateX(Math.PI/2); BB.geo('dark', lid, 35.4, 1.045, 31.9, 0, 0, 0.55);   // the lid, propped open
      BB.box('iron', [36.75, 1.02, 31.2], [36.78, 1.86, 31.23], {solid:false});    // the prop stick
      BB.solids_([[[35.4, 0.72, 30.1], [37.1, 1.02, 31.9]], [[35.4, 0.72, 29.7], [36.3, 1.02, 30.1]]]);
      for (const [x, z] of [[35.55, 31.75], [36.95, 31.75], [35.75, 29.95]]){ BB.cyl('dark', 0.08, 0.06, 0.72, x, 0, z, 10); BB.cyl('gold', 0.085, 0.085, 0.05, x, 0, z, 10); }
      BB.box('dark', [36.2, 0.1, 31.65], [36.3, 0.72, 31.75]); for (const dx of [-0.09, 0, 0.09]) BB.box('gold', [36.23 + dx, 0.06, 31.75], [36.27 + dx, 0.08, 31.9], {solid:false});   // lyre and pedals
      BB.box('dark', [35.4, 0.62, 31.9], [37.1, 0.72, 32.25]); for (const x of [35.4, 36.97]) BB.box('dark', [x, 0.72, 31.9], [x + 0.13, 0.86, 32.25]);   // key bed and cheeks
      BB.box('dark', [35.53, 0.72, 31.82], [36.97, 0.9, 31.92]); BB.box('gold', [35.53, 0.78, 31.92], [36.97, 0.8, 31.925], {solid:false});   // fallboard
      BB.geo('dark', new T3.BoxGeometry(0.9, 0.34, 0.02), 36.25, 1.2, 31.72, -0.28); BB.geo('sheet', new T3.BoxGeometry(0.4, 0.27, 0.004), 36.04, 1.2, 31.745, -0.28); BB.geo('sheet', new T3.BoxGeometry(0.4, 0.27, 0.004), 36.46, 1.2, 31.745, -0.28);   // music stand and music
      if (!real){ BB.box('sheet', [35.55, 0.72, 31.95], [36.95, 0.77, 32.2], {solid:false}); for (let k=1;k<15;k++) if (![3, 7, 10, 14].includes(k)) BB.box('dark', [35.55 + k*0.0933 - 0.026, 0.77, 31.95], [35.55 + k*0.0933 + 0.026, 0.8, 32.1], {solid:false}); }
      BB.box('dark', [35.65, 0, 32.6], [36.85, 0.42, 33.0]); BB.box('red', [35.65, 0.42, 32.6], [36.85, 0.48, 33.0]); }
    for (let x=19;x<34;x+=2.2) for (const z of [30.0, 42.6]){ BB.box('red', [x, 0.4, z - 0.25], [x + 0.6, 0.48, z + 0.25]); BB.box('wood', [x, 0, z - 0.25], [x + 0.06, 0.4, z + 0.25]); BB.box('wood', [x + 0.54, 0, z - 0.25], [x + 0.6, 0.4, z + 0.25]); BB.box('wood', [x, 0.48, z > 40 ? z + 0.19 : z - 0.25], [x + 0.6, 1.1, z > 40 ? z + 0.25 : z - 0.19]); }
    BB.geo('gold', new T3.TorusGeometry(1.0, 0.05, 6, 18), 28, 3.8, 36.3, Math.PI/2, 0, 0); BB.box('iron', [27.98, 3.8, 36.28], [28.02, HT, 36.32], {solid:false});
    // candles (stands)
    for (const [x, z] of [[8.2, 40], [19.2, 33.5], [36.8, 33.5], [19.2, 40], [36.8, 40]]){ if (z !== 40 || x !== 8.2){ BB.box('iron', [x - 0.05, 0, z - 0.05], [x + 0.05, 1.3, z + 0.05]); BB.cyl('iron', 0.15, 0.15, 0.05, x, 1.3, z, 8); } const y = x === 8.2 ? 0.6 : 1.35; BB.cyl('wax', 0.04, 0.04, 0.2, x, y, z, 6); if (real) candles.push([x, y + 0.26, z]); }
    for (let k=0;k<8;k++){ const a = k/8*Math.PI*2; BB.cyl('wax', 0.03, 0.03, 0.14, 28 + Math.cos(a), 3.8, 36.3 + Math.sin(a), 6); if (real) candles.push([28 + Math.cos(a), 4.0, 36.3 + Math.sin(a)]); }
  };
  backRooms(B, true);
  // the back wall: the mirrors are holes onto the rooms built behind it
  const mirrors = [[8, 12, 0.4, 2.6], [23, 33, 0.3, 3.8]];
  B.wallRun(['paper'], 'x', 4 - T, 40 + T, ZM, ZM + 0.4, 0, HT, mirrors, 2);
  for (const [a0, a1, y0, y1] of mirrors){ B.solid([a0, y0, ZM], [a1, y1, ZM + 0.4]); const f = 0.14;
    for (const [lo, hi] of [[[a0 - f, y0 - f, ZM - 0.06], [a1 + f, y0, ZM]], [[a0 - f, y1, ZM - 0.06], [a1 + f, y1 + f, ZM]], [[a0 - f, y0, ZM - 0.06], [a0, y1, ZM]], [[a1, y0, ZM - 0.06], [a1 + f, y1, ZM]]]) B.box('gold', lo, hi); }
  // front: floor, walls, rooms
  B.box('floor', [4, -0.3, 14], [40, 0, 29], {us:2}); B.box('ceil', [4, HT, 14], [40, HT + 0.3, 29], {us:2});
  B.box('stone', [3, HT + 0.3, 13.5], [41, HT + 0.8, 44.4], {us:2});
  for (let k=0;k<4;k++){ B.box('dark', [4 + k*1.2, HT + 0.8 + k*0.9, 14 + k*1.4], [40 - k*1.2, HT + 1.7 + k*0.9, 44 - k*0.2]); }
  const fw = [[21, 23, 0, 3.0], [6, 9, 1.0, 3.4, true], [11, 14, 1.0, 3.4, true], [30, 33, 1.0, 3.4, true], [35, 38, 1.0, 3.4, true]];
  B.wallRun(['stone'], 'x', 4 - T, 40 + T, 14 - T, 14, 0, HT + 0.3, fw, 2); B.wallRun(['paper'], 'x', 4, 40, 14, 14.02, 0, HT, fw.map(h => h.slice(0, 4)), 2);
  B.wallRun(['stone'], 'z', 14, 29, 4 - T - 0.02, 4 - T, 0, HT + 0.3, [], 2); B.box('paper', [4 - T, 0, 14], [4, HT, 29], {us:2});
  B.wallRun(['stone'], 'z', 14, 29, 40 + T, 40 + T + 0.02, 0, HT + 0.3, [], 2); B.box('paper', [40, 0, 14], [40 + T, HT, 29], {us:2});
  B.box('stone', [4 - T - 0.02, 0, 29], [4 - T, HT + 0.3, 44.4]); B.box('stone', [40 + T, 0, 29], [40 + T + 0.02, HT + 0.3, 44.4]);
  B.wallRun(['paper'], 'z', 14, 25.85, 15.85, 16.15, 0, HT, [[19, 21, 0, 2.6]], 2); B.wallRun(['paper'], 'z', 14, 25.85, 27.85, 28.15, 0, HT, [[19, 21, 0, 2.6]], 2);
  B.wallRun(['paper'], 'x', 4, 40, 25.85, 26.15, 0, HT, [[9, 11, 0, 2.6], [21, 23, 0, 2.6], [33, 35, 0, 2.6]], 2);
  const doorGaps = {14.02:[[21, 23]], 26.15:[[9, 11], [21, 23], [33, 35]], 28.85:[[9, 11], [27, 29]]};
  for (const z of [14.02, 26.15, 28.85]){ let x = 4; for (const [a, b] of doorGaps[z].concat([[40, 40]])){ if (a > x) B.box('wood', [x, 0, z - (z === 28.85 ? 0.05 : 0)], [a, 0.25, z + (z === 28.85 ? 0 : 0.05)], {solid:false}); x = b; } }
  // library: shelves, armchairs, fireplace
  B.box('books', [4.2, 0, 14.1], [15.8, 2.6, 14.55], {us:1.2}); for (const [a, b] of [[4.2, 8.85], [11.15, 15.8]]) B.box('books', [a, 0, 25.25], [b, 2.6, 25.85], {us:1.2});   // (the doorway at x 9-11 stays open)
  B.box('books', [15.3, 0, 14.6], [15.8, 2.6, 18.6], {us:1.2}); B.box('books', [15.3, 0, 21.4], [15.8, 2.6, 25.2], {us:1.2});
  // fireplace: an open firebox (sooty inside) with logs on an iron grate, a hearth slab, a mantel, and a painting over it
  B.box('stone', [4, 0, 18], [4.3, 1.6, 21]); B.box('stone', [4.3, 0, 18], [4.9, 1.6, 18.6]); B.box('stone', [4.3, 0, 20.4], [4.9, 1.6, 21]); B.box('stone', [4.3, 1.1, 18.6], [4.9, 1.6, 20.4]);
  B.box('dark', [4.3, 0.04, 18.6], [4.34, 1.1, 20.4], {solid:false}); B.box('dark', [4.34, 1.06, 18.6], [4.9, 1.1, 20.4], {solid:false}); for (const z of [18.6, 20.36]) B.box('dark', [4.34, 0.04, z], [4.9, 1.06, z + 0.04], {solid:false});
  B.box('stone', [4.3, 0, 17.8], [5.6, 0.07, 21.2]); B.box('dark', [4.34, 0.07, 18.64], [4.86, 0.08, 20.36], {solid:false});
  for (const z of [18.9, 20.1]) B.box('iron', [4.45, 0.08, z - 0.03], [4.85, 0.12, z + 0.03], {solid:false}); for (const x of [4.5, 4.8]) B.box('iron', [x - 0.02, 0.12, 18.85], [x + 0.02, 0.15, 20.15], {solid:false});
  for (const [x, y, ry] of [[4.55, 0.22, 0.12], [4.75, 0.22, -0.1], [4.64, 0.34, 0.02]]) B.geo('trim', new T3.CylinderGeometry(0.075, 0.075, 1.15, 8), x, y, 19.5, Math.PI/2, ry, 0);
  B.box('stone', [4, 1.6, 17.8], [5.1, 1.75, 21.2]); B.box('iron', [5.0, 0.07, 20.9], [5.05, 0.9, 20.95], {solid:false}); painting(2, 4.04, 2.85, 19.5, 1.25, 1.55, Math.PI/2);
  for (const z of [17, 22]){ B.box('red', [7, 0, z], [8, 0.45, z + 1]); B.box('red', [7, 0.45, z], [7.2, 1.1, z + 1]); B.box('red', [7.2, 0.45, z], [8, 0.7, z + 0.15]); B.box('red', [7.2, 0.45, z + 0.85], [8, 0.7, z + 1]); }
  // dining room: long table, chairs, candelabras
  B.box('wood', [30, 0.75, 19.2], [38, 0.82, 20.8]); for (const [x, z] of [[30.2, 19.4], [37.8, 19.4], [30.2, 20.6], [37.8, 20.6]]) B.box('wood', [x - 0.06, 0, z - 0.06], [x + 0.06, 0.75, z + 0.06]);
  for (let x=30.6;x<38;x+=1.4) for (const s of [-1, 1]){ const z = 20 + s*1.25; B.box('wood', [x - 0.22, 0.42, z - 0.22], [x + 0.22, 0.48, z + 0.22]); B.box('wood', [x - 0.22, 0, z - 0.03], [x + 0.22, 0.42, z + 0.03], {solid:false}); B.box('wood', [x - 0.22, 0.48, z + s*0.2 - 0.03], [x + 0.22, 1.1, z + s*0.2 + 0.03]); }
  for (const x of [32, 36]){ B.cyl('gold', 0.03, 0.03, 0.35, x, 0.82, 20, 6); B.box('gold', [x - 0.25, 1.15, 19.98], [x + 0.25, 1.18, 20.02], {solid:false}); for (const dx of [-0.25, 0, 0.25]){ B.cyl('wax', 0.025, 0.025, 0.14, x + dx, 1.17, 20, 6); candles.push([x + dx, 1.38, 20]); } }
  // foyer: a suit of robot armour, a clock, a rug
  B.box('red', [20.5, 0.002, 15], [23.5, 0.01, 25.5], {solid:false});
  B.box('iron', [17, 0, 24.6], [17.8, 0.3, 25.4]); B.box('iron', [17.15, 0.3, 24.75], [17.65, 1.3, 25.25]); B.box('iron', [17.2, 1.3, 24.8], [17.6, 1.7, 25.2]);
  B.box('wood', [26.6, 0, 24.9], [27.6, 2.4, 25.6]); B.box('gold', [26.85, 1.7, 24.88], [27.35, 2.2, 24.9], {solid:false});
  // hallway portraits
  for (let x=5.5;x<39;x+=5) if (Math.abs(x - 10) > 1.2 && Math.abs(x - 22) > 1.2 && Math.abs(x - 34) > 1.2) painting(Math.round(x) % 2, x, 2.05, 26.19, 0.9, 1.15, 0);
  for (const [x, z] of [[12, 27.5], [32, 27.5]]){ B.cyl('wax', 0.04, 0.04, 0.2, x, 1.4, z, 6); B.box('iron', [x - 0.12, 1.3, z - 0.12], [x + 0.12, 1.4, z + 0.12], {solid:false}); B.box('iron', [x - 0.04, 0, z - 0.04], [x + 0.04, 1.3, z + 0.04]); candles.push([x, 1.66, z]); }
  // the grounds: dead grass, a graveyard, dead trees, an iron fence
  B.box('grass', [-1, -1, -1], [45, -0.02, 45], {us:3});
  B.box('stone', [20.5, 0, 0.5], [23.5, 0.02, 14], {solid:false, us:1.5});
  for (const [a, b] of [[[-0.5,0,-0.5],[0,1.6,44.6]], [[44,0,-0.5],[44.5,1.6,44.6]], [[0,0,-0.5],[20,1.6,0]], [[24,0,-0.5],[44,1.6,0]]]){ B.box('iron', a, b, {us:2}); B.solid([a[0], 1.6, a[2]], [b[0], 14, b[2]]); }
  for (const [a, b] of [[[0, 0, 43.6], [4 - T - 0.02, 6, 44.6]], [[40 + T + 0.02, 0, 43.6], [44, 6, 44.6]]]) B.box('stone', a, b);
  B.box('iron', [20, 0, -0.5], [20.15, 2.4, 0]); B.box('iron', [23.85, 0, -0.5], [24, 2.4, 0]); B.solid([20, 0, -0.5], [24, 14, -0.2]);
  for (let k=0;k<16;k++){ const x = 2 + (k % 8)*2.2 + (k % 8 > 3 ? 10.5 : 0), z = 3 + Math.floor(k/8)*4.5 + mr()*1.0, w = 0.6 + mr()*0.3, h = 0.8 + mr()*0.5, tilt = (mr()-0.5)*0.25;
    B.geo('stone', new T3.BoxGeometry(w, h, 0.18), x, h/2, z, 0, tilt, 0); B.solid([x - w/2 + 0.08, 0, z - 0.06], [x + w/2 - 0.08, h - 0.1, z + 0.06]); B.geo('stone', new T3.CylinderGeometry(w/2, w/2, 0.18, 10, 1, false, Math.PI/2, Math.PI), x, h, z, Math.PI/2, 0, 0); }
  for (const [x, z] of [[3, 11], [41, 10], [16, 9], [30, 4], [2, 30], [42, 26]]){ B.cyl('tree', 0.25, 0.15, 4.5, x, 0, z, 7);
    for (let k=0;k<4;k++){ const a = k*1.7 + x, L = 1.4 + mr(); B.geo('tree', new T3.CylinderGeometry(0.04, 0.08, L, 5), x + Math.cos(a)*L*0.4, 3 + k*0.4, z + Math.sin(a)*L*0.4, Math.sin(a)*0.9, 0, -Math.cos(a)*0.9); } }
  for (const x of [19, 25]){ B.box('iron', [x - 0.06, 0, 1.2 - 0.06], [x + 0.06, 2.2, 1.2 + 0.06]); B.box('iron', [x - 0.15, 2.2, 1.05], [x + 0.15, 2.5, 1.35]); candles.push([x, 2.36, 1.2]); }
  for (const [k, x, y, z] of [['book', 10, 0, 16], ['book', 12, 0, 23], ['pillow', 6, 0.65, 38], ['mug', 34, 0.82, 19.6], ['bottle', 31, 0.82, 20.4], ['orange', 20, 0, 3], ['orange', 26, 0, 6],
    ['block', 25, 0, 35], ['ball', 31, 0, 39], ['book', 35.8, 1.05, 30.6], ['block', 9, 0, 33], ['bottle', 14, 0, 28], ['pillow', 8, 0, 20], ['mug', 37, 0.82, 20.3]]) B.prop(k, x, y, z);
  const fireAt = [new V(4.55 + O.x, 0.3, 19.5 + O.z)];
  const light = (x, y, z) => { x -= O.x; z -= O.z; const out = z < 13.9 || x < 3.7 || x > 40.3; let r = out ? 0.3 : 0.16, g = out ? 0.33 : 0.14, b = out ? 0.48 : 0.2;
    for (const [lx, ly, lz] of candles){ const d = Math.hypot(x - lx, y - ly, z - lz), k = 1.4*Math.exp(-d/1.9); r += k; g += k*0.7; b += k*0.35; }
    const f = Math.hypot(x - 4.6, y - 0.5, z - 19.5), k = 2.2*Math.exp(-f/2.2); r += k; g += k*0.5; b += k*0.15; return [r, g, b]; };
  const grp = B.finish(light), nav = buildNav(B.solids, O, 44, 2, [0]);
  const piano = pianoKeys(grp, O, {x0:35.55, x1:36.95, z0:31.95, z1:32.2, y:0.72}, -1, 'mansion');
  // behind the mirrors: the same back rooms reflected, with your reflection and the ghosts in them
  const mh = new T3.Group(); mh.scale.z = -1; mh.position.z = 2*(ZM + O.z); grp.add(mh);
  const MB = mapBuilder(O, 'mansionM', true); defMats(MB); backRooms(MB, false); MB.finish(light, mh);
  const sheen = new T3.MeshBasicMaterial({color:0xcfd8ff, transparent:true, opacity:0.06, depthWrite:false});
  for (const [a0, a1, y0, y1] of mirrors){ const m = new T3.Mesh(new T3.PlaneGeometry(a1 - a0, y1 - y0), sheen); m.position.set((a0 + a1)/2 + O.x, (y0 + y1)/2, ZM - 0.005 + O.z); m.rotation.y = Math.PI; grp.add(m); }
  // candle flames (here and in the mirror)
  const flameMat = new T3.MeshBasicMaterial({color:0xffb040}), flameGeo = new T3.ConeGeometry(0.025, 0.08, 6), flames = [];
  for (const [x, y, z] of candles) for (const par of z > 29 ? [grp, mh] : [grp]){ const f = new T3.Mesh(flameGeo, flameMat); f.position.set(x + O.x, y, z + O.z); par.add(f); flames.push(f); }
  // ghost robots
  const wispMat = new T3.ShaderMaterial({transparent:true, depthWrite:false, depthTest:false, blending:T3.AdditiveBlending, uniforms:{uT:{value:0}, uA:{value:1}},
    vertexShader:`uniform float uT; varying vec3 vN; varying vec3 vV; varying float vY; void main(){ vec3 p = position; p.x += sin(p.y*9.0 + uT*3.0)*0.04; p.z += cos(p.y*7.0 + uT*2.3)*0.04;
      vec4 w = modelMatrix*vec4(p, 1.0); vY = position.y; vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader:`uniform float uT; uniform float uA; varying vec3 vN; varying vec3 vV; varying float vY; void main(){ float fr = 1.0 - abs(dot(normalize(vN), normalize(vV)));
      float flick = 0.6 + 0.4*sin(uT*5.0 + vY*20.0); float fade = smoothstep(-0.75, 0.2, vY);
      gl_FragColor = vec4(mix(vec3(0.25, 0.6, 1.0), vec3(0.9, 0.98, 1.0), fr)*(0.25 + 0.75*fr)*flick*fade*uA, 1.0); }`});
  // the mirror ghosts are the same wisps, just very faint (thermal goggles show them clearly)
  const wispFaint = wispMat.clone(); wispFaint.uniforms.uA.value = 0.22; wispFaint.depthTest = true; wispFaint.side = T3.DoubleSide;
  const eyeMat = new T3.MeshBasicMaterial({color:0x0a1030});
  const mkWisp = (mat, parent) => { const g = new T3.Group(); const hd = new T3.Mesh(new T3.SphereGeometry(0.2, 12, 10), mat); hd.position.y = 0.35; g.add(hd);
    const body = new T3.Mesh(new T3.ConeGeometry(0.26, 1.1, 12, 4, true), mat); body.rotation.x = Math.PI; body.position.y = -0.3; g.add(body);
    for (const sx of [-1, 1]){ const e = new T3.Mesh(new T3.SphereGeometry(0.035, 6, 4), mat === wispMat ? eyeMat : new T3.MeshBasicMaterial({color:0x9fdcff, transparent:true, opacity:0.25, depthWrite:false})); e.position.set(sx*0.07, 0.38, -0.18); g.add(e); }
    parent.add(g); return g; };
  const mkGhost = () => mkWisp(wispFaint, mh);
  const rooms = [[4.6, 15.4, 29.6, 43.1], [16.6, 39.4, 29.6, 43.1]];
  const ghosts = [[0], [1], [1]].map(([r]) => { const R0 = rooms[r]; const p = new V(R0[0] + R() *(R0[1] - R0[0]), 1.2, R0[2] + R()*(R0[3] - R0[2])).add(O); return {g:mkGhost(), r, p, tgt:p.clone(), t:0, near:0, flee:0, pushT:0}; });
  const wisps = ghosts.map(() => { const g = mkWisp(wispMat, grp); g.userData.thKeep = true; g.visible = false; return g; });
  const inRoom = (p, r) => { const R0 = rooms[r]; return p.x > R0[0] + O.x && p.x < R0[1] + O.x && p.z > R0[2] + O.z && p.z < R0[3] + O.z; };
  const randIn = r => { const R0 = rooms[r]; return new V(R0[0] + R()*(R0[1] - R0[0]), 0.9 + R()*0.8, R0[2] + R()*(R0[3] - R0[2])).add(O); };
  // your reflection (and your friends')
  let mAv = null; const peerAv = {};
  const showAv = (av, on) => { av.head.visible = av.torso.visible = on; av.arms.forEach(a => a.visible = on); av.claws.forEach(a => a.visible = on); };
  const DARK = {bg:0x07060c, fog:0x07060c, near:3, far:20, hs:0x8090c0, hg:0x101018, hi:0.45, ac:0x9a90b0, ai:0.18}, FLASH = {bg:0xc8d0ff, fog:0x8890b0, near:8, far:50, hs:0xffffff, hg:0x8090a0, hi:1.8, ac:0xffffff, ai:0.7};
  let boltT = 12, flashSeq = [], thunderT = -1, oooT = 0;
  const thunder = () => { if (!AC) return; noiseHit(3.0, 110, 0.4, 1.0); noiseHit(1.2, 400, 0.6, 0.4); tone('sine', 50, 30, 2.5, 0.4); };
  const ooo = (v) => { if (!AC) return; const o = AC.createOscillator(), l = AC.createOscillator(), lg = AC.createGain(), gg = AC.createGain(), t = AC.currentTime; o.type = 'sine'; o.frequency.value = 330; l.frequency.value = 5; lg.gain.value = 18; l.connect(lg); lg.connect(o.frequency);
    gg.gain.setValueAtTime(0.001, t); gg.gain.linearRampToValueAtTime(0.06*v, t + 0.6); gg.gain.linearRampToValueAtTime(0.001, t + 2.2); o.frequency.linearRampToValueAtTime(220, t + 2.2); o.connect(gg); gg.connect(AC.destination); o.start(t); l.start(t); o.stop(t + 2.3); l.stop(t + 2.3); };
  let pianoBusy = false; const ELISE = [9, 21, 9, 21, 9, 6, 8, 7, 5, -1, 0, 2, 5, 6, -1, 2, 18, 6, 7];
  const mansionIdea = (bot, imp) => { if (imp || pianoBusy || R() > 0.5) return null; pianoBusy = true; const rel = () => { pianoBusy = false; };
    return actWalk(new V(36.25 + O.x, 0, 33.55 + O.z), [], {cancel:rel, then:(b, failed) => { if (failed){ rel(); return null; } let n = -1;
      return actDo(ELISE.length*0.38 + 1.2, (b2, t) => { const r = b2.root, sk = r.szK || 1; r.obj.position.set(36.25 + O.x, 0.48 + 0.2*sk, 32.8 + O.z); botYaw(b2, Math.PI);
        const i = Math.floor((t - 0.6)/0.38); botLimbs(b2, -1.45, 0.35, j => -1.25 - (i % 2 === j && (t - 0.6) % 0.38 < 0.12 ? 0.25 : 0)); setFace(b2, 'happy');
        if (t > 0.6 && i !== n && i < ELISE.length){ n = i; if (ELISE[i] >= 0) piano.botPress(ELISE[i], true); } },
        {cancel:rel, then:(b3) => (rel(), actWalk(null, [new V(36.25 + O.x, 0, 33.6 + O.z)]))}); }}); };
  MAPS.mansion = {name:'HAUNTED MANSION', O, botIdea:mansionIdea, group:grp, spawn:new V(22, 0, 5).add(O), yaw:Math.PI, nav, yMin:-5, yMax:14, props:B.props, sky:DARK,
    pose(P, inGame){
      if (!mAv){ mAv = makeScary(mh, true); mAv.lost = me.lost; } showAv(mAv, inGame); if (inGame) poseAvatar(mAv, P);
      if (!!mAv.isCute !== impCute(NET.id)) setSkin(mAv, impCute(NET.id), 0x3aa0ff);
      for (const [id, p] of Object.entries(NET.peers)){
        const on = inGame && p.P && p.g === netGame && p.m === 'game' && !p.headless && !impHidden(id);     // a disguised hider has no reflection
        if (on && !peerAv[id]){ peerAv[id] = makeScary(mh, true); }
        if (peerAv[id]){ showAv(peerAv[id], !!on); if (on){ peerAv[id].lost = p.lost; poseAvatar(peerAv[id], p.P); if (!!peerAv[id].isCute !== (impCute(id) || p.sk === 'cute')) setSkin(peerAv[id], impCute(id) || p.sk === 'cute', 0x3aa0ff); } }
      }
    },
    leave(){ applySky(DARK); }, onEv(ev){ if (ev.k === 'note') piano.play(ev.i); },
    update(dt, inGame){
      piano.update(dt, inGame);
      for (const f of flames){ const k = 0.8 + R()*0.45; f.scale.set(k, 0.8 + R()*0.6, k); }
      if (R() < 0.6) emitFire(fireAt[0].clone().add(new V((R()-0.5)*0.15, 0, (R()-0.5)*0.9)), new V((R()-0.5)*0.2, 0.7 + R()*0.5, (R()-0.5)*0.2), 0.08 + R()*0.06, 0.5 + R()*0.3);
      // lightning
      boltT -= dt;
      if (boltT <= 0){ boltT = 14 + R()*22; flashSeq = [0.07, 0.12, 0.05, 0.1, 0.09]; thunderT = 0.8 + R()*1.2; }
      if (flashSeq.length){ flashSeq[0] -= dt; if (flashSeq[0] <= 0){ flashSeq.shift(); applySky(flashSeq.length % 2 ? FLASH : DARK); } else if (flashSeq.length === 5 && flashSeq[0] > 0.06) applySky(FLASH); }
      if (thunderT > 0){ thunderT -= dt; if (thunderT <= 0 && inGame) thunder(); }
      wispMat.uniforms.uT.value = wispFaint.uniforms.uT.value = clock; ghosts.forEach((gh, i) => { const w = wisps[i]; w.visible = inGame && TH.wasOn; if (w.visible){ w.position.copy(gh.p); w.position.y += Math.sin(clock*2 + gh.r)*0.06; w.rotation.y = gh.g.rotation.y; } });
      if (!inGame){ for (const gh of ghosts) gh.g.visible = false; return; }
      fireHazard(dt, fireAt, 0.45);
      const head = loco.headPos(), fwd = new V(0, 0, -1).applyAxisAngle(UP, io.yaw + io.headYaw);
      oooT -= dt;
      for (const gh of ghosts){
        gh.g.visible = true; gh.t -= dt; gh.flee -= dt;
        const here = inRoom(head, gh.r);
        if (here && gh.flee <= 0){ gh.tgt.copy(head).addScaledVector(fwd, -0.55); gh.tgt.y = head.y - 0.15; }
        else if (gh.t <= 0){ gh.t = 3 + R()*4; gh.tgt.copy(randIn(gh.r)); }
        const to = gh.tgt.clone().sub(gh.p), d = to.length(), sp = here && gh.flee <= 0 ? 1.1 : 0.7;
        if (d > 0.02) gh.p.addScaledVector(to, Math.min(1, sp*dt/d));
        const R0 = rooms[gh.r]; gh.p.x = Math.max(R0[0] + O.x, Math.min(R0[1] + O.x, gh.p.x)); gh.p.z = Math.max(R0[2] + O.z, Math.min(R0[3] + O.z, gh.p.z));
        gh.g.position.copy(gh.p); gh.g.position.y += Math.sin(clock*2 + gh.r)*0.06;
        const look = (here && gh.flee <= 0 ? head : gh.tgt).clone().sub(gh.p); gh.g.rotation.y = Math.atan2(-look.x, -look.z);
        // it touched you: ice cold
        if (here && gh.p.distanceTo(head) < 0.75){ gh.near += dt; if (gh.near > 1.4){ gh.near = 0; gh.flee = 7; gh.tgt.copy(randIn(gh.r)); freezeMe(1.1); showMsg('Something ice cold touched you...'); ooo(1); pulse(0, 0.7, 200); pulse(1, 0.7, 200); } } else gh.near = Math.max(0, gh.near - dt);
        if (here && oooT <= 0 && gh.p.distanceTo(head) < 3){ oooT = 6 + R()*6; ooo(0.6); }
        // and it knocks things about
        gh.pushT -= dt;
        if (gh.pushT <= 0) for (const p of parts){ if (p.parent || p.obj.userData.dead || !mine(p) || p.mode !== 'free' || p.stuck) continue; const c = centerW(p); if (c.distanceTo(gh.p) < 0.8){ gh.pushT = 1.5; p.asleep = false; p.v.add(to.clone().setLength(1.8).add(new V(0, 1.5, 0))); p.w.add(new V(R()-0.5, R()-0.5, R()-0.5).multiplyScalar(6)); break; } }
      }
    }};
}

// ======================= VOLCANO =======================
// Inside a volcano: a round rock floor ringed by cliffs, with rocky ledges sticking out of the walls and
// rock pillars from the floor, climbing all the way up. Every 100 s the volcano RUMBLES (everything
// shakes), then LAVA rises and swallows the lower half of the ledges. Touch it and you burn up (~3 s),
// and being pulled out doesn't put the fire out. Then it drains away again.
{
  const O = new V(0, 0, 900), B = mapBuilder(O, 'volcano'); mapSeed = 4242;
  const rockT = tex(128, 128, (g,w,h) => { g.fillStyle = '#4a3a34'; g.fillRect(0,0,w,h); noiseFill(g, w, h, 4000, 'rgba(20,12,10,A)', 0.5, 3); noiseFill(g, w, h, 1200, 'rgba(110,80,64,A)', 0.4, 2); noiseFill(g, w, h, 60, 'rgba(10,6,5,A)', 0.6, 10); });
  const floorT = tex(256, 256, (g,w,h) => { g.fillStyle = '#3a2c28'; g.fillRect(0,0,w,h); noiseFill(g, w, h, 6000, 'rgba(15,8,6,A)', 0.5, 3); noiseFill(g, w, h, 1500, 'rgba(90,64,50,A)', 0.3, 2);
    g.strokeStyle = '#ff6a1a'; g.shadowColor = '#ff8a2a'; g.shadowBlur = 6; g.lineWidth = 2; for (let k=0;k<10;k++){ g.beginPath(); let x = R()*w, y = R()*h; g.moveTo(x, y); for (let j=0;j<6;j++){ x += (R()-0.5)*50; y += (R()-0.5)*50; g.lineTo(x, y); } g.stroke(); } });
  B.mat('rock', lam(0xffffff, {map:rockT, vertexColors:true})).mat('wall', lam(0xffffff, {map:rockT, vertexColors:true, side:T3.BackSide})).mat('floor', lam(0xffffff, {map:floorT, vertexColors:true}))
   .mat('dark', lam(0x2a201c, {vertexColors:true})).mat('glow', new T3.MeshBasicMaterial({color:0xff7a2a})).mat('ledge', lam(0xffd0b8, {map:rockT, vertexColors:true, emissive:0x2a1208}));
  const CX = 22, CZ = 22, RC = 20.4, TOP = 24, LAVA_TOP = 6.5;
  B.box('floor', [-2, -1, -2], [46, 0, 46], {us:4});
  // the crater wall: a craggy cylinder you see from inside, solid all the way round (and up past the rim)
  const wallN = (a, y) => 1 + 0.05*Math.sin(a*7) + 0.03*Math.sin(a*13 + 1) + 0.008*Math.sin(y*0.9 + a*5), wallR = (a, y) => (RC + 2.5*y/TOP)*wallN(a, y);
  { const geo = new T3.CylinderGeometry(RC + 2.5, RC, TOP, 220, 16, true), pos = geo.attributes.position, v = new V();
    for (let i=0;i<pos.count;i++){ v.fromBufferAttribute(pos, i); const a = Math.atan2(v.z, v.x), n = wallN(a, v.y + TOP/2); v.x *= n; v.z *= n; pos.setXYZ(i, v.x, v.y, v.z); }
    const uv = geo.attributes.uv; for (let i=0;i<uv.count;i++) uv.setXY(i, uv.getX(i)*24, uv.getY(i)*5);
    geo.computeVertexNormals(); B.geo('wall', geo, CX, TOP/2, CZ);
    // the wall is solid exactly along its craggy inside face: small boxes, each pushed out to the face
    const SEG = 700, YB = 0.8;
    for (let s=0;s<SEG;s++){ const a0 = s/SEG*Math.PI*2, a1 = (s + 1)/SEG*Math.PI*2; let run = null;
      for (let y0 = 0; y0 < TOP; y0 += YB){ let rmin = 1e9; for (const a of [a0, (a0 + a1)/2, a1]) for (const y of [y0, y0 + YB/2, Math.min(TOP, y0 + YB)]) rmin = Math.min(rmin, wallR(a, y));
        const pts = [a0, a1].map(a => [CX + Math.cos(a)*rmin, CZ + Math.sin(a)*rmin]), back = [a0, a1].map(a => [CX + Math.cos(a)*(rmin + 0.15), CZ + Math.sin(a)*(rmin + 0.15)]), all = pts.concat(back);
        const bx = [Math.min(...all.map(p => p[0])), Math.max(...all.map(p => p[0])), Math.min(...all.map(p => p[1])), Math.max(...all.map(p => p[1]))];
        if (run && Math.abs(run.rmin - rmin) < 0.04){ run.y1 = y0 + YB; continue; }
        if (run) B.solid([run.b[0], run.y0, run.b[2]], [run.b[1], run.y1, run.b[3]]); run = {rmin, b:bx, y0, y1:y0 + YB}; }
      if (run) B.solid([run.b[0], run.y0, run.b[2]], [run.b[1], 40, run.b[3]]); } }
  // ledges up the walls, spiralling up, plus a few more across
  const ledges = [];
  for (let k=0;k<16;k++){ const a = k*0.47 + 0.3, h = 1.4 + k*1.12, w = 3.0 + (k % 3)*0.4, d = 3.0; ledges.push([a, h, w, d]); }
  for (const [a, h] of [[2.6, 9.0], [4.4, 12.5], [0.9, 15.5], [3.7, 19.0], [5.6, 6.0]]) ledges.push([a, h, 3.2, 3.2]);
  for (const [a, h, w, d] of ledges){
    const r = RC - d*0.5 + 0.2, x = CX + Math.cos(a)*r, z = CZ + Math.sin(a)*r, th = 0.8;
    B.meshSolid('ledge', rockGeo(w, th, d, a*31 + h), x, h - th/2, z, 0.25);
    // a rocky support going back into the wall underneath, so nothing floats
    const r2 = RC - 0.6, x2 = CX + Math.cos(a)*r2, z2 = CZ + Math.sin(a)*r2;
    B.meshSolid('rock', rockGeo(2.0, 2.0, 2.0, a*17 + h), x2, h - th - 0.8, z2, 0.25);
  }
  const column = (k, r0, r1, h, x, z, seg) => { B.geo(k, new T3.CylinderGeometry(r1, r0, h, seg), x, h/2, z); const ap = Math.cos(Math.PI/seg), n = Math.max(2, Math.ceil(h/0.4));
    for (let i=0;i<n;i++){ const y0 = h*i/n, y1 = h*(i + 1)/n, r = (r0 + (r1 - r0)*(y0 + y1)/2/h)*(1 + ap)/2; B.solids_(discBoxes(x, z, r, y0, y1, [])); } };
  // pillars from the floor
  for (const [x, z, r, h] of [[22, 22, 1.8, 3.2], [16, 18, 1.3, 1.6], [27, 15, 1.4, 2.4], [29, 26, 1.5, 4.6], [17, 28, 1.3, 3.8], [12, 23, 1.1, 2.0], [24, 31, 1.2, 5.4], [32, 20, 1.2, 1.4]]){
    column('rock', r*1.15, r, h, x, z, 18); B.meshSolid('ledge', rockGeo(r*1.6, 0.45, r*1.6, x*3 + z), x, h - 0.07, z, 0.25); }
  // tall rock spires out in the middle, high enough to stay above the lava
  for (const [x, z, r, h] of [[15, 13, 1.3, 9.5], [31, 31, 1.4, 11], [13, 31, 1.2, 13.5], [33, 14, 1.3, 8.2], [22, 36, 1.2, 15.5], [22, 7.5, 1.1, 12]]){
    column('rock', r*1.3, r*0.85, h, x, z, 18); B.meshSolid('ledge', rockGeo(r*2.4, 0.5, r*2.4, x*5 + z*3), x, h - 0.1, z, 0.25); }
  // rubble
  for (let k=0;k<26;k++){ const a = mr()*6.3, rr = 5 + mr()*13, x = CX + Math.cos(a)*rr, z = CZ + Math.sin(a)*rr, s = 0.25 + mr()*0.45; B.meshSolid('rock', rockGeo(s*2, s*1.1, s*2, x*7 + z), x, s*0.55, z, 0.2); }
  // lava vents in the floor: every so often they spit lava
  const vents = [[20, 24.6], [31.6, 17.2], [14.4, 24.6], [26, 10], [9.5, 27]];
  for (const [x, z] of vents){ B.geo('glow', new T3.CircleGeometry(0.42, 14), x, 0.012, z, -Math.PI/2); B.geo('dark', new T3.TorusGeometry(0.55, 0.14, 6, 14), x, 0.04, z, Math.PI/2); }
  for (const [k, x, z] of [['rock', 20, 14], ['rock', 25, 28], ['crystal', 18, 25], ['crystal', 30, 18], ['stick', 15, 20], ['cone', 26, 22], ['rock', 12, 18], ['barrel', 23, 12]]) B.prop(k, x, 0, z);
  const light = (x, y, z) => { x -= O.x; z -= O.z; let r = 0.85 + 0.5*Math.exp(-y/5), g = 0.62 + 0.2*Math.exp(-y/6), b = 0.52; r += 0.3*(y/TOP); g += 0.3*(y/TOP); b += 0.3*(y/TOP); return [r, g, b]; };
  // robots only walk (and spawn) inside the crater, never in the gap behind its wall
  const grp = B.finish(light), nav = buildNav(B.solids, O, 44, 2, [0], (x, z) => { const dx = x - CX - O.x, dz = z - CZ - O.z; return Math.hypot(dx, dz) < wallR(Math.atan2(dz, dx), 0.5) - 0.8; });
  // the lava: a glowing disc that rises and falls (always there, just under the floor when it's calm)
  const lavaC = document.createElement('canvas'); lavaC.width = lavaC.height = 128; const lg = lavaC.getContext('2d');
  lg.fillStyle = '#d0380a'; lg.fillRect(0,0,128,128); for (let k=0;k<40;k++){ const x = R()*128, y = R()*128, r = 10 + R()*22, gr = lg.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,220,90,0.8)'); gr.addColorStop(1, 'rgba(255,120,20,0)'); lg.fillStyle = gr; for (const dx of [-128, 0, 128]) for (const dy of [-128, 0, 128]) lg.fillRect(x - r + dx, y - r + dy, r*2, r*2); }
  const lavaT = new T3.CanvasTexture(lavaC); lavaT.wrapS = lavaT.wrapT = T3.RepeatWrapping; lavaT.repeat.set(3, 3); lavaT.anisotropy = 4; lavaT.encoding = T3.sRGBEncoding;
  const lava = new T3.Mesh(new T3.CircleGeometry(RC + 3, 48), new T3.MeshBasicMaterial({map:lavaT, fog:false})); lava.rotation.x = -Math.PI/2; lava.position.set(CX + O.x, -0.5, CZ + O.z); grp.add(lava); lava.userData.thHot = true;
  // rock rafts: they sit on the floor, and float up on the lava when it rises
  const rafts = [[19, 17, 2.6, 2.2], [26, 25, 2.4, 2.6], [17, 26, 2.2, 2.2], [28, 18, 2.4, 2.0], [22, 13, 2.0, 2.4], [24, 30, 2.6, 2.0], [11, 17, 2.0, 2.0], [33, 25, 2.2, 2.2]].map(([x, z, w, d], i) => {
    const mesh = new T3.Mesh(rockGeo(w, 0.6, d, i*13 + 7), new T3.MeshLambertMaterial({map:rockT, color:0x6a4a40, emissive:0x1a0804})); mesh.position.set(x + O.x, 0.3, z + O.z); grp.add(mesh);
    return {mesh, box:dynBox(), x:x + O.x, z:z + O.z, w, d, ph:i*1.7, y:0.3, riders:new Set()}; });
  const P = 100, CALM = 55, RUMBLE = 6, RISE = 15, HOLD = 14;
  const levelAt = ph => ph < CALM + RUMBLE ? -0.5 : ph < CALM + RUMBLE + RISE ? -0.5 + (LAVA_TOP + 0.5)*((ph - CALM - RUMBLE)/RISE) : ph < CALM + RUMBLE + RISE + HOLD ? LAVA_TOP : -0.5 + (LAVA_TOP + 0.5)*Math.max(0, 1 - (ph - CALM - RUMBLE - RISE - HOLD)/(P - CALM - RUMBLE - RISE - HOLD));
  let warned = false, rumbleT = 0, bubbleT = 0;
  const inCrater = p => Math.hypot(p.x - CX - O.x, p.z - CZ - O.z) < RC + 1;
  // ---- lava spurts: a blob fountain out of a vent (when it's calm) or out of the lava (when it's up). Timed off the
  // clock with a seeded random, so everyone sees the same spurts.
  const SL = 2.3, GV = 9.8, hsh = (n, k) => { const x = Math.sin(n*12.9898 + k*78.233)*43758.5453; return x - Math.floor(x); };
  const blobMat = new T3.MeshBasicMaterial({color:0xff8a28, fog:false}), blobGeo = new T3.IcosahedronGeometry(0.1, 0), blobs = [];
  for (let i=0;i<40;i++){ const m = new T3.Mesh(blobGeo, blobMat); m.visible = false; grp.add(m); blobs.push(m); }
  const spurtOf = slot => { const t0 = slot*SL + hsh(slot, 1)*0.8, lv = levelAt(((t0 % P) + P) % P); let x, z, y;
    if (lv > 0.2){ let k = 0; do { const a = hsh(slot, 2 + k*90)*6.283, rr = 3 + hsh(slot, 3 + k*90)*(RC - 6); x = CX + Math.cos(a)*rr; z = CZ + Math.sin(a)*rr; k++; } while (k < 8 && rafts.some(r => Math.abs(r.x - O.x - x) < r.w/2 + 1.5 && Math.abs(r.z - O.z - z) < r.d/2 + 1.5)); if (k >= 8) return null; y = lv; }
    else if (lv < -0.3 && hsh(slot, 4) < 0.55){ [x, z] = vents[Math.floor(hsh(slot, 5)*vents.length)]; y = 0.02; } else return null;
    const n = 9 + Math.floor(hsh(slot, 6)*5), up = 4.5 + hsh(slot, 7)*3, bl = [];
    for (let k=0;k<n;k++){ const a = hsh(slot, 10 + k)*6.283, sp = 0.3 + hsh(slot, 30 + k)*1.1; bl.push([Math.cos(a)*sp, up*(0.7 + hsh(slot, 50 + k)*0.4), Math.sin(a)*sp]); }
    return {t0, p:new V(x + O.x, y, z + O.z), bl}; };
  let lastSpurt = -1;
  const spurts = (dt, inGame) => {
    const now = Date.now()/1000, cur = Math.floor(now/SL), live = []; let bi = 0;
    for (let sl = cur - 1; sl <= cur; sl++){ const sp = spurtOf(sl); if (!sp) continue; const t = now - sp.t0; if (t < 0) continue;
      if (sl !== lastSpurt && t < 0.5 && sl === cur){ lastSpurt = sl; const d = sp.p.distanceTo(lastPlayer); if (d < 22){ if (AC) noiseHit(0.5/(1 + d*0.2), 260, 0.35, 0.4); emitFire(sp.p.clone(), new V(0, 2.5, 0), 0.3, 0.7); } }
      for (const [vx, vy, vz] of sp.bl){ const y = sp.p.y + vy*t - 0.5*GV*t*t; if (y < sp.p.y - 0.05 || bi >= blobs.length) continue;
        const m = blobs[bi++]; m.visible = true; m.position.set(sp.p.x + vx*t, y, sp.p.z + vz*t); m.rotation.set(t*7, t*5, 0); live.push(m.position); } }
    for (let i=bi;i<blobs.length;i++) blobs[i].visible = false;
    if (!inGame || !live.length) return;
    const head = loco.headPos(), body = head.clone().setY(head.y - 0.5);
    if (live.some(b => b.distanceTo(head) < 0.32 || b.distanceTo(body) < 0.42 || [0, 1].some(i => !me.lost[i] && b.distanceTo(handW[i]) < 0.22))) igniteMe('torso', 'a lava spurt', 3);
    for (const p of parts){ if (p.parent || p.obj.userData.dead || !mine(p) || p.mode === 'held' || p.fire) continue; const c = centerW(p);
      if (live.some(b => b.distanceTo(c) < p.r + 0.12)){ if (p.name === 'mine') mineTrigger(p); else ignitePart(p); } } };
  // ---- robots: when it rumbles they run for the rafts and hop on (some trip and don't make it), ride the lava up,
  // and hop back off once it has drained away
  const botCtl = (bot, dt) => {
    const ph = (Date.now()/1000) % P, lv = levelAt(ph), root = bot.root, pos = root.obj.position, sk = root.szK || 1;
    const alarm = ph > CALM && ph < CALM + RUMBLE + RISE;
    let v = bot.vk;
    if (!v){ if (!alarm || pos.y > NAV.lv[0] + STAND*sk + 0.4) return false; v = bot.vk = {s:'run', r:null, t:0, last:clock, path:null, pi:0}; }
    if (clock - v.last > 0.3 && v.s !== 'gaveup' && v.s !== 'run') v.s = 'gaveup';          // got grabbed or knocked off: no second try
    v.last = clock; v.t += dt;
    const legs = bot.legs.filter(l => l.parent === root).length;
    const anim = (run, up) => { const a = bot.t*11*Math.max(0.3, run); bot.legs.forEach((l, j) => { if (l.parent === root) l.obj.rotation.x = (j ? -1 : 1)*Math.sin(a)*0.8*Math.min(1, run); });
      bot.ups.forEach((u, j) => { if (u.parent === root) u.obj.rotation.z = (j ? 1 : -1)*(up ? 2.6 + Math.sin(a*1.3 + j)*0.5 : 0.3 + Math.sin(a)*0.2); }); };
    const face = (to) => { const want = Math.atan2(to.x, to.z), e = new T3.Euler().setFromQuaternion(root.obj.quaternion, 'YXZ'); let d = want - e.y; d = Math.atan2(Math.sin(d), Math.cos(d)); root.obj.quaternion.setFromEuler(new T3.Euler(0, e.y + d*Math.min(1, dt*10), 0)); };
    const land = (c) => { bot.cell = c; bot.target = cellPos(...c); bot.prev = null; };
    const quit = () => { if (v.r) v.r.riders.delete(bot); bot.vk = null; const c = reachableCell(pos) || cellOf(pos); land(c); return false; };
    if (v.s === 'gaveup'){ if (v.r) v.r.riders.delete(bot); v.r = null; if (!alarm && lv < -0.3) bot.vk = null; return false; }
    if (v.s === 'run'){
      if (!alarm || legs === 0){ if (legs === 0) v.s = 'gaveup'; else return quit(); return false; }
      if (!v.r){ let best = null, bd = 1e9; for (const r of rafts){ const d = Math.hypot(r.x - pos.x, r.z - pos.z) + (r.riders.size >= 3 ? 30 : 0); if (d < bd){ bd = d; best = r; } }
        v.r = best; best.riders.add(bot); setFace(bot, 'scared'); bot.faceT = 30; if (R() < 0.6) say(bot, pick(['RUN!!','lava lava lava','to the rocks!','not today, lava','EVERYBODY ON THE ROCKS','hot hot hot'])); }
      const r = v.r, dr = Math.hypot(r.x - pos.x, r.z - pos.z);
      if (dr < Math.max(r.w, r.d)/2 + 0.8){                      // close enough: jump on
        v.s = 'hop'; v.t = 0; v.from = pos.clone(); v.ox = (R() - 0.5)*(r.w - 0.9); v.oz = (R() - 0.5)*(r.d - 0.9); v.trip = R() < 0.2; return true; }
      if (!v.path || v.pi >= v.path.length){ const goal = reachableCell(new V(r.x, NAV.lv[0], r.z)) || cellOf(new V(r.x, 0, r.z)); v.path = navPath(bot.cell || cellOf(pos), goal) || []; v.pi = 0; }
      const wp = v.pi < v.path.length ? cellPos(...v.path[v.pi]) : new V(r.x, 0, r.z), to = wp.sub(pos); to.y = 0;
      const spd = bot.speed*2.6*(legs === 2 ? 1 : 0.55)*Math.sqrt(sk)*dt;
      if (to.length() < spd + 0.05 && v.pi < v.path.length){ bot.cell = v.path[v.pi]; v.pi++; } else { pos.addScaledVector(to.normalize(), Math.min(to.length(), spd)); face(to); }
      pos.y = NAV.lv[0] + STAND*sk + Math.abs(Math.sin(bot.t*13))*0.1*sk; anim(1.3, true); bot.target = pos.clone(); return true;
    }
    if (v.s === 'hop' || v.s === 'off'){
      const r = v.r, k = Math.min(1, v.t/0.55), to = v.s === 'hop' ? new V(r.x + v.ox, r.y + 0.3 + STAND*sk, r.z + v.oz) : v.to;
      if (v.s === 'hop' && v.trip && v.t > 0.12){                // tripped: falls flat, short of the raft
        const dir = to.clone().sub(pos); dir.y = 0; dir.normalize(); root.mode = 'free'; root.asleep = false; root.v.copy(dir).multiplyScalar(1.1).add(new V(0, 1.2, 0)); root.w.set(4 + R()*3, R() - 0.5, R() - 0.5);
        say(bot, pick(['whoa-','NOOO','my foot!','tell my toaster I love it'])); v.s = 'gaveup'; r.riders.delete(bot); return true; }
      pos.lerpVectors(v.from, to, k); pos.y += Math.sin(k*Math.PI)*0.9; face(to.clone().sub(v.from)); anim(0.6, true);
      if (k >= 1){ if (v.s === 'hop'){ v.s = 'ride'; v.t = 0; } else { land(v.cell); bot.vk = null; setFace(bot, 'happy'); bot.faceT = 2; if (R() < 0.5) say(bot, pick(['phew','made it','that was fun actually','again! again!'])); } }
      return true;
    }
    if (v.s === 'ride'){
      const r = v.r; pos.set(r.x + v.ox, r.y + 0.3 + STAND*sk, r.z + v.oz); anim(0.15, lv > 0.3);
      if (lv > 0.3 && R() < dt*0.05) say(bot, pick(['this is fine','I can see my house','hold on!','is it getting hot in here']));
      if (lv < -0.35 && !alarm){                                  // drained: hop off onto the floor
        const out = new V(pos.x - CX - O.x, 0, pos.z - CZ - O.z).normalize().multiplyScalar(1.8 + Math.max(r.w, r.d)/2), c = reachableCell(new V(r.x + out.x, NAV.lv[0], r.z + out.z)) || reachableCell(new V(r.x - out.x, NAV.lv[0], r.z - out.z));
        if (!c){ v.s = 'gaveup'; return false; }
        v.s = 'off'; v.t = 0; v.from = pos.clone(); v.cell = c; v.to = cellPos(...c); v.to.y = NAV.lv[0] + STAND*sk; r.riders.delete(bot); }
      return true;
    }
    return false;
  };
  const top = ledges[15], tr = RC - top[3]*0.5 + 0.2, spawnP = new V(CX + Math.cos(top[0])*tr, top[1] + 0.05, CZ + Math.sin(top[0])*tr);
  MAPS.volcano = {name:'VOLCANO', group:grp, spawn:spawnP.add(O), yaw:Math.atan2(-(CX - (spawnP.x - O.x)), -(CZ - (spawnP.z - O.z))), nav, yMin:-5, yMax:45, props:B.props, level:() => lava.position.y,
    sky:{bg:0x2a1410, fog:0x3a1a12, near:18, far:70, hs:0xffc8a0, hg:0x502010, hi:0.9, ac:0xffd8c0, ai:0.3}, botCtl,
    update(dt, inGame){
      spurts(dt, inGame);
      const ph = (Date.now()/1000) % P, lv = levelAt(ph), shaking = ph > CALM && ph < CALM + RUMBLE + RISE*0.4;
      lava.position.y = lv;
      for (const r of rafts){ r.py = r.y; r.y = Math.max(0.3, lv + 0.18 + Math.sin(Date.now()/900 + r.ph)*(lv > 0.3 ? 0.06 : 0));
        r.mesh.position.y = r.y; r.mesh.rotation.z = lv > 0.3 ? Math.sin(Date.now()/1300 + r.ph)*0.04 : 0; setDyn(r.box, r.x - r.w/2, r.y - 0.3, r.z - r.d/2, r.x + r.w/2, r.y + 0.3, r.z + r.d/2); } lavaT.offset.x = (Date.now()/1000)*0.01; lavaT.offset.y = Math.sin(Date.now()/4000)*0.05;
      lava.material.color.setRGB(1, 0.85 + 0.15*Math.sin(Date.now()/400), 0.8 + 0.2*Math.sin(Date.now()/700));
      // the whole place shakes while it's rumbling
      grp.position.set(shaking ? (R()-0.5)*0.05 : 0, shaking ? (R()-0.5)*0.03 : 0, shaking ? (R()-0.5)*0.05 : 0);
      if (!inGame){ warned = false; return; }
      if (ph > CALM && ph < CALM + 1 && !warned){ warned = true; showMsg('THE VOLCANO IS RUMBLING! GET UP HIGH!'); }
      if (ph < CALM) warned = false;
      // standing (or hanging on) on a raft: you go up and down with it, like you're part of it
      { const h = loco.headPos();
        for (const r of rafts){ const dy = r.y - (r.py == null ? r.y : r.py), top = r.y + 0.3; if (!dy) continue;
          const over = q => Math.abs(q.x - r.x) < r.w/2 + 0.25 && Math.abs(q.z - r.z) < r.d/2 + 0.25;
          const onIt = (over(h) && h.y - top > 0.2 && h.y - top < 2.4 && floorBelow(h) > top - 0.15) || [0, 1].some(i => !me.lost[i] && loco.S.wasTouching && loco.S.wasTouching[i] && over(loco.S.lastHand[i]) && Math.abs(loco.S.lastHand[i].y - top) < 0.25);
          if (onIt){ rig.position.y += dy; for (const i of [0, 1]) if (loco.S.lastHand[i]) loco.S.lastHand[i].y += dy; break; } } }
      if (shaking){ rumbleT -= dt; if (rumbleT <= 0){ rumbleT = 0.35; if (AC) noiseHit(0.6, 90, 0.4, 0.5); pulse(0, 0.5, 120); pulse(1, 0.5, 120);
          const a = R()*6.3, rr = 6 + R()*13; emitAsh(new V(CX + Math.cos(a)*rr + O.x, 14 + R()*8, CZ + Math.sin(a)*rr + O.z), 8, 0.4); } }
      if (lv > 0){ bubbleT -= dt; if (bubbleT <= 0){ bubbleT = 0.08; const a = R()*6.3, rr = R()*RC, p = new V(CX + Math.cos(a)*rr + O.x, lv + 0.05, CZ + Math.sin(a)*rr + O.z); if (p.distanceTo(lastPlayer) < 14) emitFire(p, new V(0, 1 + R(), 0), 0.12 + R()*0.1, 0.6); } }
      // you in the lava: you catch fire and burn up fast. Pulled out or not, you're toast.
      const head = loco.headPos(), feetY = head.y - 1.0;
      const fy = floorBelow(head);                       // standing on a raft or ledge above the lava is safe
      const dipped = performance.now() - gameJoinT > 1500 && inCrater(head) && (head.y - 0.25 < lv || (fy < lv - 0.05 && feetY < lv) ||
        [0,1].some(i => !me.lost[i] && handW[i].distanceTo(head) < 1.6 && handW[i].y < lv + 0.02 && floorBelow(handW[i].clone().setY(handW[i].y + 0.1)) < lv - 0.05));
      if (dipped && lv > 0){ igniteMe('torso', 'the lava', 3); }
      // pieces and robots burn and sink
      for (const p of parts){
        if (p.parent || p.obj.userData.dead || !mine(p) || p.mode === 'held' || p.stuck) continue;
        const c = centerW(p); if (c.y - p.r > lv || !inCrater(c) || lv <= 0) continue;
        if (!p.fire && p.name !== 'mine') ignitePart(p); if (p.name === 'mine') mineTrigger(p);
        if (p.bot && p === p.bot.root && p.mode === 'bot'){ p.bot.burning = true; }
        if (p.mode === 'free'){ p.asleep = false; p.v.multiplyScalar(1 - 2*dt); p.v.y = Math.max(p.v.y, -0.6); }
      }
    }};
}

// ======================= CLOCK TOWER =======================
// The inside of a huge old clock tower. Climb the turning GEARS up the south wall, hop up the spinning
// platforms in the middle shaft, dodge (or ride) the giant PENDULUM, and ring the BELL at the top.
// The clock face shows the real time.
{
  const O = new V(0, 0, 1100), B = mapBuilder(O, 'clock'); mapSeed = 1212;
  const stoneT = tex(256, 256, (g,w,h) => { g.fillStyle = '#8a7a66'; g.fillRect(0,0,w,h); for (let y=0;y<h;y+=32){ const off = (y/32) % 2 ? 32 : 0; for (let x=-64;x<w;x+=64){ g.fillStyle = `rgb(${120 + Math.random()*30|0},${105 + Math.random()*25|0},${88 + Math.random()*20|0})`; g.fillRect(x + off + 2, y + 2, 60, 28); } } noiseFill(g, w, h, 3000, 'rgba(40,30,20,A)', 0.15, 2); });
  const woodT = tex(256, 256, (g,w,h) => { for (let x=0;x<w;x+=32){ g.fillStyle = `rgb(${110 + Math.random()*25|0},${70 + Math.random()*15|0},${40 + Math.random()*10|0})`; g.fillRect(x, 0, 32, h); g.fillStyle = 'rgba(30,15,5,0.6)'; g.fillRect(x, 0, 2, h); } noiseFill(g, w, h, 2500, 'rgba(50,25,10,A)', 0.2, 2); });
  const HT = 30, T = 0.6, X0 = 8, X1 = 36, Z0 = 8, Z1 = 36, L1 = 8, L2 = 16, L3 = 23;
  B.mat('stone', lam(0xffffff, {map:stoneT, vertexColors:true})).mat('wood', lam(0xffffff, {map:woodT, vertexColors:true})).mat('iron', lam(0x3a3c40, {vertexColors:true}))
   .mat('brass', lam(0xc8a048, {vertexColors:true})).mat('sky', new T3.MeshBasicMaterial({color:0xffb070, fog:false})).mat('dark', lam(0x2a221c, {vertexColors:true}));
  // ground, outside plaza and the roof
  B.box('stone', [X0 - T, -1, Z0 - T], [X1 + T, 0, Z1 + T], {us:3});
  B.box('stone', [-1, -2.2, -1], [45, -1.2, 45], {us:3});                              // the square outside is lower: robots stay in the tower
  for (let i=0;i<3;i++) B.box('stone', [19.5, -1.2, 7.4 - (i + 1)*0.45], [24.5, -0.3 - i*0.3, 7.4 - i*0.45]);          // steps up to the door: highest by the door
  B.box('stone', [X0 - T, HT, Z0 - T], [X1 + T, HT + 0.6, Z1 + T], {us:3});
  // walls with tall windows at every level (the low sills stop you falling out, mostly)
  const wins = y => [[13, 15, y + 1.2, y + 5], [21, 23, y + 1.2, y + 5], [29, 31, y + 1.2, y + 5]];
  const holes = (lvls, extra) => lvls.flatMap(wins).concat(extra || []);
  B.wallRun(['stone'], 'x', X0 - T, X1 + T, Z0 - T, Z0, 0, HT, holes([0, L1, L2]).filter(h => !(h[0] === 21 && h[2] < 2)).concat([[20, 24, 0, 3.2]]), 3);       // north (door on the ground floor)
  B.wallRun(['stone'], 'x', X0 - T, X1 + T, Z1, Z1 + T, 0, HT, holes([L3]), 3);                                     // south: the gear wall
  B.wallRun(['stone'], 'z', Z0, Z1, X0 - T, X0, 0, HT, holes([0, L1, L2, L3]), 3);
  B.wallRun(['stone'], 'z', Z0, Z1, X1, X1 + T, 0, HT, holes([0, L1, L2, L3]), 3);
  // floors: boards with holes (the middle shaft, the stairwells, the gear wall)
  const floor = (y, cut) => { const cell = 0.5, nx = (X1 - X0)/cell, nz = (Z1 - Z0)/cell, on = (i, j) => { const x = X0 + (i + 0.5)*cell, z = Z0 + (j + 0.5)*cell; return !cut.some(([a, b, c, d]) => x > a && x < b && z > c && z < d); };
    const rows = []; for (let j=0;j<nz;j++){ let i = 0; while (i < nx){ if (!on(i, j)){ i++; continue; } let k = i; while (k < nx && on(k, j)) k++; rows.push([i, k, j]); i = k; } }
    const used = new Set(); for (let r=0;r<rows.length;r++){ if (used.has(r)) continue; const [a, b, j0] = rows[r]; let j1 = j0 + 1;
      for (;;){ const n = rows.findIndex((q, ix) => !used.has(ix) && q[0] === a && q[1] === b && q[2] === j1); if (n < 0) break; used.add(n); j1++; }
      B.box('wood', [X0 + a*cell, y - 0.3, Z0 + j0*cell], [X0 + b*cell, y, Z0 + j1*cell], {us:2}); } };
  const GEARWALL = [11, 33, 32.6, 36];
  const LIFT = [30.4, 33.6, 8, 12.2];
  floor(L1, [[17, 27, 17, 27], [8.5, 11.5, 11.5, 25.5], GEARWALL, LIFT]);
  floor(L2, [[18, 26, 18, 26], [32.5, 35.5, 18.5, 31.5], GEARWALL, LIFT]);
  floor(L3, [[19.5, 24.5, 19.5, 24.5], [11.5, 25.5, 8, 11.5], [11, 33, 34.4, 36], LIFT]);
  // railings round the holes (low, so you can still jump over)
  for (const [y, a, b, c, d] of [[L1, 17, 27, 17, 27], [L2, 18, 26, 18, 26]]){ for (const [p0, p1] of [[[a, y + 0.85, c - 0.08], [b, y + 0.95, c]], [[a, y + 0.85, d], [b, y + 0.95, d + 0.08]], [[a - 0.08, y + 0.85, c], [a, y + 0.95, d]], [[b, y + 0.85, c], [b + 0.08, y + 0.95, d]]]) B.box('iron', p0, p1);
    for (const [x, z] of [[a, c], [b, c], [a, d], [b, d], [(a + b)/2, c], [(a + b)/2, d], [a, (c + d)/2], [b, (c + d)/2]]) B.box('iron', [x - 0.05, y, z - 0.05], [x + 0.05, y + 0.85, z + 0.05]); }
  // stairs: ground -> L1 (west wall), L1 -> L2 (east wall), L2 -> top (north wall)
  for (let i=0;i<16;i++) B.box('wood', [9, 0, 11.5 + i*0.875], [11, (i + 1)*0.5, 12.375 + i*0.875], {us:1});
  for (let i=0;i<16;i++) B.box('wood', [33, L1, 31.5 - (i + 1)*0.8], [35, L1 + (i + 1)*0.5, 31.5 - i*0.8], {us:1});
  for (let i=0;i<14;i++) B.box('wood', [11.5 + i, L2, 9], [12.5 + i, L2 + (i + 1)*0.5, 11], {us:1});
  // big beams and posts holding it all up
  for (const [x, z] of [[14, 14], [30, 14], [14, 30], [30, 30]]) B.box('dark', [x - 0.3, 0, z - 0.3], [x + 0.3, L3, z + 0.3], {us:2});
  for (const y of [L1, L2, L3]) for (const z of [14, 30]) B.box('dark', [X0, y - 0.6, z - 0.2], [X1, y - 0.3, z + 0.2], {solid:false});
  // the bell's frame up top
  B.box('dark', [20.5, L3, 28.6], [21, 26.4, 29.1]); B.box('dark', [27, L3, 28.6], [27.5, 26.4, 29.1]); B.box('dark', [20.5, 26.4, 28.5], [27.5, 26.9, 29.2]);
  // sky in the windows
  for (const [a, c] of [[[X0 - T - 0.5, 0, -10], [X1 + T + 0.5, 60, -9.9]], [[X0 - T - 0.5, 0, 53.9], [X1 + T + 0.5, 60, 54]], [[-10, 0, -10], [-9.9, 60, 54]], [[53.9, 0, -10], [54, 60, 54]]]) B.box('sky', a, c, {solid:false});
  for (const [k, x, y, z] of [['barrel', 12, 0, 28], ['box', 30, 0, 12], ['box', 31, 0, 13], ['cone', 26, 0, 30], ['barrel', 13, L1, 30], ['box', 30, L1, 12], ['block', 24, L1, 12],
    ['barrel', 12, L2, 14], ['box', 29, L2, 29], ['can', 20, L2, 30], ['box', 14, L3, 30], ['barrel', 32, L3, 14], ['ball', 30, L3, 30]]) B.prop(k, x, y, z);
  const light = (x, y, z) => { x -= O.x; z -= O.z; const fy = y < L1 ? y : y < L2 ? y - L1 : y < L3 ? y - L2 : y - L3, w = 0.75 + 0.35*Math.min(1, fy/5); return [w*1.12, w*0.95, w*0.78]; };
  // the gear wall: a staircase of turning gears you can climb, on the inside of the south wall
  const gearShape = (rb, n) => { const s = new T3.Shape(); for (let k=0;k<n*4;k++){ const a = k/(n*4)*Math.PI*2, r = (k % 4 === 1 || k % 4 === 2) ? rb + 0.4 : rb; const x = Math.cos(a)*r, y = Math.sin(a)*r; if (!k) s.moveTo(x, y); else s.lineTo(x, y); } s.closePath();
    for (let h=0;h<5;h++){ const a = h/5*Math.PI*2, c = new T3.Path(); c.absarc(Math.cos(a)*rb*0.55, Math.sin(a)*rb*0.55, rb*0.2, 0, Math.PI*2, true); s.holes.push(c); } return s; };
  // [along the wall, height, radius, teeth, direction, wall]: S = the gear wall, E/W = smaller climbing gears per floor
  const gears = [[16, 3.6, 3.4, 12, 1, 'S'], [23.6, 8.4, 2.6, 9, -1, 'S'], [29.2, 13.6, 3.0, 10, 1, 'S'], [23.2, 18.8, 2.6, 9, -1, 'S'], [16.8, 22.2, 2.4, 8, 1, 'S'],
    [30.2, 4.0, 1.8, 7, -1, 'S'], [12.6, 12.2, 1.6, 7, -1, 'S'], [29.8, 20.6, 1.6, 7, -1, 'S'],
    [18, 3.2, 1.8, 8, 1, 'E'], [26.5, 2.4, 1.4, 6, -1, 'E'], [10.6, 19.2, 1.4, 6, 1, 'E'], [26, 19.6, 1.6, 7, -1, 'E'],
    [33, 3.0, 1.5, 6, 1, 'W'], [18, 11.6, 1.8, 8, -1, 'W'], [26.5, 12, 1.4, 6, 1, 'W'], [18.5, 19.6, 1.6, 7, 1, 'W']].map(([c, y, rb, n, dir, wall], gi) => {
    const geo = new T3.ExtrudeGeometry(gearShape(rb, n), {depth:0.5, bevelEnabled:false}); geo.translate(0, 0, -0.25);
    const m = new T3.Mesh(geo, lam(gi % 3 === 1 ? 0xb08838 : gi % 3 === 2 ? 0x9a7a3a : 0xc8a048)), wx = wall === 'E' ? 35.25 : wall === 'W' ? 8.75 : 0;
    if (wall === 'S') m.position.set(c + O.x, y, 35.25 + O.z); else { m.position.set(wx + O.x, y, c + O.z); m.rotation.y = Math.PI/2; }
    const hub = new T3.Mesh(new T3.CylinderGeometry(0.4, 0.4, 0.7, 16), lam(0x3a3c40)); hub.rotation.x = Math.PI/2; m.add(hub);
    // the solid body (it doesn't move, it's round) and a box per tooth (they do)
    for (let k=0;k<Math.ceil(rb*2.5);k++){ const ya = -rb + k*0.8, yb = Math.min(rb, ya + 0.8), ym = Math.abs(ya) > Math.abs(yb) ? yb : ya, hw = Math.sqrt(Math.max(0, rb*rb - ym*ym))*0.95; if (hw < 0.1) continue;
      if (wall === 'S') B.solid([c - hw, y + ya, 35], [c + hw, y + yb, 35.5]); else B.solid([wx - 0.25, y + ya, c - hw], [wx + 0.25, y + yb, c + hw]); }
    return {m, wall, c:c + (wall === 'S' ? O.x : O.z), w:(wall === 'S' ? 35.25 + O.z : wx + O.x), y, rb, n, dir, sp:0.16*3.4/rb, off:gi*0.3, teeth:Array.from({length:n}, () => ({box:dynBox(), c:new V(), prev:new V()}))}; });
  // little decorative cogs everywhere (just for looks), turning
  const cogGeos = [0.35, 0.55, 0.8].map((r, k) => new T3.ExtrudeGeometry(gearShape(r, 6 + k*2), {depth:0.08, bevelEnabled:false}));
  const cogs = []; for (let k=0;k<44;k++){ const r = mr(), kind = k % 4, gi = Math.floor(mr()*3), m = new T3.Mesh(cogGeos[gi], lam([0xc8a048, 0x9a7a3a, 0x6a6c70][k % 3]));
    const y = 1.5 + mr()*26; if (kind === 0) m.position.set(X0 + 0.06 + O.x, y, Z0 + 3 + r*22 + O.z), m.rotation.y = Math.PI/2;
    else if (kind === 1) m.position.set(X1 - 0.14 + O.x, y, Z0 + 3 + r*22 + O.z), m.rotation.y = Math.PI/2;
    else if (kind === 2){ if (y > 22 && Math.abs(X0 + 3 + r*22 - 22) < 4.5) continue; m.position.set(X0 + 3 + r*22 + O.x, y, Z0 + 0.06 + O.z); }
    else { const lv = [L1, L2, L3][k % 3]; m.position.set(X0 + 2 + mr()*24 + O.x, lv - 0.38, Z0 + 2 + mr()*24 + O.z); m.rotation.x = Math.PI/2; }
    cogs.push({m, w:(mr() - 0.5)*1.6}); }
  // the spinning platforms up the middle shaft
  const spins = [[18.6, 3.0, 18.6], [25.4, 5.6, 25.4], [18.6, 11.0, 25.4], [25.4, 13.6, 18.6], [18.6, 18.8, 18.6], [25.4, 21.0, 25.4], [14.5, L3 + 0.45, 16, 2.4, 0.45], [30, L1 + 0.35, 28, 1.6, -0.6]].map(([x, y, z, r, w], k) => {
    r = r || 1.05; B.solids_(discBoxes(x, z, r, y - (r > 1.2 ? y - (y > L3 ? L3 : L1) : 0.25), y, []));
    const g = new T3.Mesh(new T3.ExtrudeGeometry(gearShape(r - 0.05, Math.round(r*7)), {depth:0.25, bevelEnabled:false}), lam(k % 2 ? 0xb08838 : 0x8a6a2a)); g.geometry.rotateX(Math.PI/2); g.position.set(x + O.x, y, z + O.z); return {g, x:x + O.x, y, z:z + O.z, r, w:w || (k % 2 ? 0.7 : -0.7)}; });
  // the lift in the north-east corner: up to the top and back, all day
  for (const [x, z] of [[30.5, 12.1], [33.5, 12.1]]) B.box('iron', [x - 0.08, 0, z - 0.08], [x + 0.08, HT, z + 0.08]);
  const grp = B.finish(light), nav = buildNav(B.solids, O, 44, 2, [0, L1, L2, L3]);
  for (const g of gears) grp.add(g.m); for (const s of spins) grp.add(s.g); for (const c of cogs) grp.add(c.m);
  const liftM = new T3.Mesh(new T3.BoxGeometry(2.8, 0.2, 2.8), lam(0x8a6a2a)); grp.add(liftM); const liftRail = new T3.Mesh(new T3.BoxGeometry(2.9, 0.12, 0.12), lam(0xc8a048)); liftRail.position.z = 1.4; liftM.add(liftRail);
  const liftBox = dynBox(), LX = 32 + O.x, LZ = 10.65 + O.z, LP = 34; let liftY = 0, liftPrev = 0;
  const liftAt = ph => ph < 3 ? 0 : ph < 15 ? (ph - 3)/12*L3 : ph < 19 ? L3 : ph < 31 ? (1 - (ph - 19)/12)*L3 : 0;
  // the OVERDRIVE lever by the door: pull it down and everything runs three times as fast for 20 s
  const lever = new T3.Group(); lever.position.set(17 + O.x, 1.25, Z0 + 0.2 + O.z); grp.add(lever);
  const lvBase = new T3.Mesh(new T3.BoxGeometry(0.6, 0.8, 0.12), lam(0x3a3c40)); lvBase.position.z = -0.12; lever.add(lvBase);
  const lvSign = new T3.Mesh(new T3.PlaneGeometry(0.9, 0.22), new T3.MeshBasicMaterial({map:canvasTex(256, 64, (g,w,h) => { g.fillStyle = '#d8302a'; g.fillRect(0,0,w,h); g.fillStyle = '#fff'; g.font = 'bold 40px Rubik, sans-serif'; g.textAlign = 'center'; g.fillText('OVERDRIVE', w/2, 46); })})); lvSign.position.set(0, 0.6, -0.05); lever.add(lvSign);
  const lvArm = new T3.Group(); lever.add(lvArm); const lvStick = new T3.Mesh(new T3.CylinderGeometry(0.03, 0.03, 0.5, 8), lam(0x8a929b)); lvStick.position.y = 0.25; lvArm.add(lvStick);
  const lvKnob = new T3.Mesh(new T3.SphereGeometry(0.07, 12, 8), new T3.MeshLambertMaterial({color:0xd8302a})); lvKnob.position.y = 0.52; lvArm.add(lvKnob);
  let odT = 0, spdK = 1, leverGrab = null, odCD = 0;
  const overdrive = (local) => { if (odT > 0) return; odT = 20; showMsg('OVERDRIVE! Everything runs 3x fast for 20 seconds!'); if (AC){ for (let k=0;k<6;k++) setTimeout(() => noiseHit(0.08, 2500, 2, 0.25), k*60); tone('sawtooth', 80, 240, 1.2, 0.15); }
    if (local && netGame) netSend('ev', {t:'mapev', m:'clock', k:'od'}); };
  // the cuckoo, in a little house on the west wall: out it pops on the minute
  const cuckoo = new T3.Group(); cuckoo.position.set(X0 + O.x, 14.6, 22 + O.z); grp.add(cuckoo);
  const chouse = new T3.Mesh(new T3.BoxGeometry(0.6, 1.0, 1.0), lam(0x6a3a1a)); chouse.position.x = 0.3; cuckoo.add(chouse);
  const croof = new T3.Mesh(new T3.ConeGeometry(0.85, 0.5, 4), lam(0x3a2010)); croof.position.set(0.3, 0.72, 0); croof.rotation.y = Math.PI/4; cuckoo.add(croof);
  const cdoor = new T3.Group(); cdoor.position.set(0.61, 0, -0.2); cuckoo.add(cdoor); const cdm = new T3.Mesh(new T3.BoxGeometry(0.03, 0.42, 0.4), lam(0xc8a048)); cdm.position.z = 0.2; cdoor.add(cdm);
  const bird = new T3.Group(); cuckoo.add(bird); const bb_ = new T3.Mesh(new T3.SphereGeometry(0.14, 10, 8), lam(0xffffff)); bird.add(bb_); const bh_ = new T3.Mesh(new T3.SphereGeometry(0.09, 10, 8), lam(0xffffff)); bh_.position.set(0.12, 0.12, 0); bird.add(bh_);
  const beak = new T3.Mesh(new T3.ConeGeometry(0.035, 0.1, 6), lam(0xffa020)); beak.rotation.z = -Math.PI/2; beak.position.set(0.24, 0.12, 0); bird.add(beak);
  for (const s_ of [-1, 1]){ const e = new T3.Mesh(new T3.SphereGeometry(0.02, 6, 4), new T3.MeshBasicMaterial({color:0x111111})); e.position.set(0.18, 0.16, s_*0.05); bird.add(e); }
  let cuckooT = -1, tickWas = 0;
  // the pendulum: a long rod and a big brass bob, swinging along x through the middle shaft
  const PV = new V(22 + O.x, L3 - 0.5, 22 + O.z), PL = 20.2, PA = 0.19, PW = Math.sqrt(9.81/PL);
  const pend = new T3.Group(); pend.position.copy(PV); grp.add(pend);
  const rod = new T3.Mesh(new T3.CylinderGeometry(0.09, 0.09, PL, 10), lam(0x3a3c40)); rod.position.y = -PL/2; pend.add(rod);
  const bob = new T3.Mesh(new T3.CylinderGeometry(1.05, 1.05, 0.32, 28), lam(0xd8b050)); bob.rotation.x = Math.PI/2; bob.position.y = -PL; pend.add(bob);
  const bobRim = new T3.Mesh(new T3.TorusGeometry(1.05, 0.07, 8, 28), lam(0x8a6a2a)); bobRim.position.y = -PL; pend.add(bobRim);
  const rodBoxes = Array.from({length:9}, () => dynBox()), bobBox = dynBox(); let pAng = 0, pPrevBob = new V(), bobHitT = 0;
  // the clock face (real time), on the north wall at the top
  const faceC = document.createElement('canvas'); faceC.width = faceC.height = 512; const fg = faceC.getContext('2d');
  fg.fillStyle = '#f4e8c8'; fg.beginPath(); fg.arc(256, 256, 250, 0, Math.PI*2); fg.fill(); fg.strokeStyle = '#3a2a1a'; fg.lineWidth = 12; fg.stroke();
  fg.fillStyle = '#2a1c10'; fg.font = 'bold 54px serif'; fg.textAlign = 'center'; fg.textBaseline = 'middle';
  ['XII','I','II','III','IIII','V','VI','VII','VIII','IX','X','XI'].forEach((t, k) => { const a = k/12*Math.PI*2; fg.fillText(t, 256 + Math.sin(a)*190, 256 - Math.cos(a)*190); });
  for (let k=0;k<60;k++){ const a = k/60*Math.PI*2, r0 = k % 5 ? 232 : 222; fg.fillRect(256 + Math.sin(a)*r0 - 2, 256 - Math.cos(a)*r0 - 2, 4, 4); }
  const faceT = new T3.CanvasTexture(faceC); faceT.encoding = T3.sRGBEncoding;
  const face = new T3.Mesh(new T3.CircleGeometry(3.3, 48), new T3.MeshBasicMaterial({map:faceT, transparent:true, opacity:0.93})); face.position.set(22 + O.x, 26.6, Z0 + 0.05 + O.z); grp.add(face);
  const handG = (len, w, c) => { const g = new T3.Group(); const m = new T3.Mesh(new T3.BoxGeometry(w, len, 0.06), new T3.MeshBasicMaterial({color:c})); m.position.y = len/2 - 0.2; g.add(m); g.position.set(22 + O.x, 26.6, Z0 + 0.15 + O.z); grp.add(g); return g; };
  const hourH = handG(1.9, 0.22, 0x1a120a), minH = handG(2.8, 0.14, 0x1a120a), secH = handG(2.9, 0.04, 0xa02010);
  const faceLight = new T3.PointLight(0xffd8a0, 0.7, 14); faceLight.position.set(22 + O.x, 26, 11 + O.z); grp.add(faceLight);
  // the bell
  const bellPts = []; for (let k=0;k<=12;k++){ const t = k/12; bellPts.push(new T3.Vector2(0.35 + 0.55*Math.pow(t, 2.2) + (t > 0.85 ? (t - 0.85)*1.6 : 0), 1.7 - t*1.7)); }
  const bellM = new T3.Mesh(new T3.LatheGeometry(bellPts, 24), lam(0xb88a3a, {side:T3.DoubleSide})); const bellG = new T3.Group(); bellG.position.set(24 + O.x, 26.4, 28.85 + O.z); bellM.position.y = -1.75; bellG.add(bellM);
  const clapper = new T3.Mesh(new T3.SphereGeometry(0.16, 10, 8), lam(0x3a3c40)); clapper.position.y = -1.5; bellG.add(clapper); grp.add(bellG);
  B.solids; const bellBox = dynBox(); setDyn(bellBox, 24 - 0.9 + O.x, 24.7, 28.85 - 0.9 + O.z, 24 + 0.9 + O.x, 26.4, 28.85 + 0.9 + O.z);
  let bellSwing = 0, bellV = 0, bellCD = 0, lastMin = -1, bongs = 0, bongT = 0;
  const bong = (v) => { bellV += 1.2*v; if (!AC) return; const d = lastPlayer.distanceTo(bellG.position), vol = Math.min(1, 10/(4 + d))*v;
    for (const [f, a, t] of [[110, 0.5, 4], [220, 0.35, 3.5], [262, 0.25, 3], [330, 0.2, 2.5], [440, 0.12, 2], [587, 0.08, 1.5]]) tone('sine', f, f*0.995, t, a*vol*0.5); };
  const ride = (box, dlt) => {            // you move with whatever you're standing on or holding
    const h = loco.headPos(), fy = floorBelow(h);
    let on = h.x > box.min[0] && h.x < box.max[0] && h.z > box.min[2] && h.z < box.max[2] && Math.abs(fy - box.max[1]) < 0.15 && h.y - fy < 2.4;
    for (const i of [0,1]) if (!on && !me.lost[i] && loco.S.wasTouching && loco.S.wasTouching[i]){ const p = loco.S.lastHand[i]; if (p.x > box.min[0] - 0.1 && p.x < box.max[0] + 0.1 && p.y > box.min[1] - 0.1 && p.y < box.max[1] + 0.1 && p.z > box.min[2] - 0.1 && p.z < box.max[2] + 0.1) on = true; }
    if (on){ rig.position.add(dlt); for (const i of [0,1]) loco.S.lastHand[i].add(dlt); }
    return on; };
  const CSt = [{lo:0, hi:1, bottom:[10, 0, 10.8], pts:[[10, 0.5, 11.9], [10, L1, 25.1], [10, L1, 26.6]]},
               {lo:1, hi:2, bottom:[34, L1, 32.4], pts:[[34, L1 + 0.5, 31.1], [34, L2, 19.1], [34, L2, 17.8]]},
               {lo:2, hi:3, bottom:[10.8, L2, 10], pts:[[12, L2 + 0.5, 10], [25, L3, 10], [26.3, L3, 10]]}];
  const clockIdea = (bot, imp) => { const l = bot.cell ? bot.cell[2] : 0;
    if (!imp && l === 3 && R() < 0.5) return actWalk(new V(24 + O.x, L3, 27.5 + O.z), [], {then:(b, failed) => { if (failed) return null; let n = 0;
      return actDo(2.6, (b2, t) => { botYaw(b2, 0); const sw = t % 0.85 < 0.3; botLimbs(b2, 0, 0.4, j => j === 1 && sw ? -2.4 : -0.3);
        if (t > 0.25 + n*0.85 && n < 3){ n++; bong(0.8); if (netGame) netSend('ev', {t:'mapev', m:'clock', k:'bell', v:0.8}); if (n === 1) say(b2, pick(['DONG','ding dong!','what time is it? BELL TIME'])); } }); }});
    return actStairs(CSt, bot, l === 0 ? true : l === 3 ? false : R() < 0.5, null); };
  MAPS.clock = {name:'CLOCK TOWER', O, botIdea:clockIdea, group:grp, spawn:new V(22, 0, 11).add(O), yaw:Math.PI, nav, yMin:-5, yMax:HT + 3, props:B.props,
    sky:{bg:0xe8956a, fog:0xc89070, near:20, far:70, hs:0xffe0b0, hg:0x5a4030, hi:0.85, ac:0xfff0d8, ai:0.35},
    onEv(ev){ if (ev.k === 'bell') bong(ev.v || 1); else if (ev.k === 'od') overdrive(false); },
    dbg:() => ({bellV, pAng, gears, bobBox, spins, liftBox, get liftY(){ return liftY; }, get odT(){ return odT; }, get spdK(){ return spdK; }, lever:lvKnob, cuckoo, set cuckooT(v){ cuckooT = v; }}),
    update(dt, inGame){
      const now = new Date(), t = Date.now()/1000, sec = now.getSeconds() + now.getMilliseconds()/1000, min = now.getMinutes() + sec/60, hr = (now.getHours() % 12) + min/60;
      // hands (looking at the face from inside the tower, so it reads normally)
      secH.rotation.z = -sec/60*Math.PI*2; minH.rotation.z = -min/60*Math.PI*2; hourH.rotation.z = -hr/12*Math.PI*2;
      // gears and their teeth
      if (odT > 0){ odT -= dt; if (odT <= 0) showMsg('Overdrive over.'); } odCD -= dt;
      spdK += ((odT > 0 ? 3 : 1) - spdK)*Math.min(1, dt*1.5);
      for (const g of gears){ g.off += dt*g.sp*g.dir*(spdK - 1); const ang = t*g.sp*g.dir + g.off; g.m.rotation.z = ang;
        g.teeth.forEach((th, k) => { const a = ang + (k + 0.375)/g.n*Math.PI*2, r = g.rb + 0.2; th.prev.copy(th.c);
          if (g.wall === 'S'){ th.c.set(g.c + Math.cos(a)*r, g.y + Math.sin(a)*r, g.w); setDyn(th.box, th.c.x - 0.3, th.c.y - 0.3, g.w - 0.3, th.c.x + 0.3, th.c.y + 0.3, g.w + 0.3); }
          else { th.c.set(g.w, g.y + Math.sin(a)*r, g.c - Math.cos(a)*r); setDyn(th.box, g.w - 0.3, th.c.y - 0.3, th.c.z - 0.3, g.w + 0.3, th.c.y + 0.3, th.c.z + 0.3); } }); }
      for (const s of spins) s.g.rotation.y += s.w*spdK*dt;
      for (const c of cogs) c.m.rotation.z += c.w*spdK*dt;
      // the lift
      liftPrev = liftY; liftY = liftAt((Date.now()/1000) % LP); liftM.position.set(LX, liftY - 0.088, LZ); setDyn(liftBox, LX - 1.4, liftY - 0.2, LZ - 1.4, LX + 1.4, liftY, LZ + 1.4);
      // the lever
      lvArm.rotation.x += ((odT > 0 ? 2.3 : 0.6) - lvArm.rotation.x)*Math.min(1, dt*8);
      // the cuckoo
      if (cuckooT >= 0){ cuckooT += dt; const out = cuckooT < 0.4 ? cuckooT/0.4 : cuckooT < 3 ? 1 : Math.max(0, 1 - (cuckooT - 3)/0.4); cdoor.rotation.y = -out*1.6; bird.position.x = 0.2 + out*0.7;
        if ((cuckooT > 0.45 && cuckooT - dt <= 0.45) || (cuckooT > 1.3 && cuckooT - dt <= 1.3)){ if (AC && lastPlayer.distanceTo(cuckoo.position) < 25){ tone('sine', 760, 760, 0.2, 0.18); setTimeout(() => tone('sine', 600, 600, 0.3, 0.18), 260); } bird.rotation.z = 0.4; }
        else bird.rotation.z *= 0.9; if (cuckooT > 3.5) cuckooT = -1; }
      else { cdoor.rotation.y = 0; bird.position.x = 0.2; }
      // the pendulum
      const swing = Math.sin(t*PW); pAng = PA*(1 + (spdK - 1)*0.25)*swing; pend.rotation.z = pAng;
      if (Math.sign(swing) !== tickWas){ tickWas = Math.sign(swing); if (AC && inGame && lastPlayer.distanceTo(PV) < 30){ noiseHit(0.04, swing > 0 ? 3200 : 2400, 3, 0.12); tone('square', swing > 0 ? 1500 : 1100, swing > 0 ? 1400 : 1000, 0.03, 0.04); } }
      const at = d => new V(PV.x + Math.sin(pAng)*d, PV.y - Math.cos(pAng)*d, PV.z), bc = at(PL);
      rodBoxes.forEach((b, k) => { const c = at(2 + k*(PL - 3)/9); setDyn(b, c.x - 0.12, c.y - 0.9, c.z - 0.12, c.x + 0.12, c.y + 0.9, c.z + 0.12); });
      setDyn(bobBox, bc.x - 0.95, bc.y - 0.95, bc.z - 0.2, bc.x + 0.95, bc.y + 0.95, bc.z + 0.2);
      const bobV = bc.clone().sub(pPrevBob).divideScalar(Math.max(dt, 1e-3)); pPrevBob.copy(bc);
      // the bell swings when it's rung, and rings on the minute (the hour count on the hour)
      bellV += (-bellSwing*6 - bellV*0.8)*dt; bellSwing += bellV*dt; bellG.rotation.x = bellSwing*0.25; clapper.position.z = -bellSwing*0.25;
      if (lastMin < 0) lastMin = now.getMinutes();
      if (now.getMinutes() !== lastMin){ lastMin = now.getMinutes(); bongs = lastMin === 0 ? (now.getHours() % 12 || 12) : 1; bongT = 0; cuckooT = 0; }
      if (bongs > 0){ bongT -= dt; if (bongT <= 0){ bongs--; bongT = 2.2; bong(0.8); } }
      bellCD -= dt; bobHitT -= dt;
      if (!inGame) return;
      // ride the teeth, the pendulum and the spinning platforms
      for (const g of gears) for (const th of g.teeth) if (th.prev.lengthSq()) ride(th.box, th.c.clone().sub(th.prev));
      if (Math.abs(liftY - liftPrev) < 1) ride(liftBox, new V(0, liftY - liftPrev, 0));
      for (const p of parts){ if (p.parent || p.obj.userData.dead || !mine(p) || p.mode !== 'free') continue; const c = centerW(p);
        if (Math.abs(c.x - LX) < 1.4 && Math.abs(c.z - LZ) < 1.4 && c.y - p.r < liftY + 0.15 && c.y > liftY - 0.4 && liftY > liftPrev){ p.obj.position.y += liftY - liftPrev; p.asleep = false; } }
      // pull the lever: grip its red knob and pull down
      const kp = lvKnob.getWorldPosition(new V());
      for (const i of [0,1]){ if (me.lost[i]) continue;
        if (!leverGrab && io.gripV[i] > 0.5 && handW[i].distanceTo(kp) < 0.2) leverGrab = {i, y0:handW[i].y};
        if (leverGrab && leverGrab.i === i){ if (io.gripV[i] < 0.3) leverGrab = null; else if (leverGrab.y0 - handW[i].y > 0.12){ leverGrab = null; if (odT <= 0 && odCD <= 0){ odCD = 25; pulse(i, 1, 150); overdrive(true); } else { pulse(i, 0.3, 40); showMsg('The gears are still cooling down...'); } } } }
      const bd = bobV.clone().multiplyScalar(dt); if (!ride(bobBox, bd)) for (const b of rodBoxes) if (ride(b, bd.clone().multiplyScalar(0.6))) break;
      { const h = loco.headPos(), fy = floorBelow(h);
        for (const s of spins){ const dx = h.x - s.x, dz = h.z - s.z; if (dx*dx + dz*dz < s.r*s.r && Math.abs(fy - s.y) < 0.15 && h.y - fy < 2.4){ const a = s.w*spdK*dt, c = Math.cos(a), sn = Math.sin(a); const nx = s.x + dx*c + dz*sn, nz = s.z - dx*sn + dz*c; rig.position.x += nx - h.x; rig.position.z += nz - h.z; } } }
      // the bob knocks you flying if you're in its way (and not riding it)
      const h = loco.headPos(), body = h.clone().add(new V(0, -0.6, 0));
      if (bobHitT <= 0 && Math.abs(body.x - bc.x) < 1.3 && (Math.abs(body.y - bc.y) < 1.4 || Math.abs(h.y - bc.y) < 1.2) && Math.abs(body.z - bc.z) < 0.7 && bobV.length() > 1.2 && Math.abs(floorBelow(h) - bobBox.max[1]) > 0.2){
        bobHitT = 1; loco.S.velocity.add(bobV.clone().setLength(7)).add(new V(0, 3, 0)); pulse(0, 1, 200); pulse(1, 1, 200); sndClank(8); spawnSparks(body, 30, 3); lastCombat = clock; }
      // ring the bell: hit it with a hand (or anything flying)
      if (bellCD <= 0) for (const i of [0,1]){ if (me.lost[i]) continue; const p = handW[i], bp = bellG.position; if (p.y > bp.y - 1.9 && p.y < bp.y && Math.hypot(p.x - bp.x, p.z - bp.z) < 1.05 && hv[i].length() > 1.5){
        const v = Math.min(1.5, hv[i].length()/4); bong(v); bellCD = 0.5; pulse(i, 1, 150); if (netGame) netSend('ev', {t:'mapev', m:'clock', k:'bell', v}); break; } }
      for (const p of parts){
        if (p.parent || p.obj.userData.dead || !mine(p) || p.stuck) continue; const c = centerW(p);
        if (p.mode === 'free' && bellCD <= 0 && p.v.length() > 3 && c.distanceTo(bellG.position.clone().add(new V(0, -0.9, 0))) < 1.1){ bong(1); bellCD = 0.5; if (netGame) netSend('ev', {t:'mapev', m:'clock', k:'bell', v:1}); }
        if (Math.abs(c.x - bc.x) < 1.05 + p.r && Math.abs(c.y - bc.y) < 1.05 + p.r && Math.abs(c.z - bc.z) < 0.3 + p.r && bobV.length() > 1){
          if (p.bot && p === p.bot.root && p.mode === 'bot'){ p.mode = 'free'; p.bot.stunT = 2; say(p.bot, pick(['BONK','not the pendulum','ow ow ow'])); }
          if (p.mode === 'free'){ p.asleep = false; p.v.copy(bobV).setLength(8).add(new V(0, 2.5, 0)); p.w.add(new V(R()-0.5, R()-0.5, R()-0.5).multiplyScalar(10)); sndClank(5); } }
      }
    }};
}

// ======================= PIRATE SHIP =======================
// A pirate ship riding the waves. The ship floats high, so the hold below deck is dry.
// Gimmicks: CANNONS (put anything in the back of the barrel and stand clear), the PLANK (sharks below),
// ROPE SWINGS off the main yard, the ship's WHEEL and BELL, a TREASURE CHEST in the hold, and every so
// often the KRAKEN slaps a tentacle down on the deck.
{
  const O = new V(0, 0, 1200), B = mapBuilder(O, 'ship'); mapSeed = 9191;
  const plankT = tex(256, 256, (g,w,h) => { for (let y=0;y<h;y+=20){ g.fillStyle = `hsl(${28+R()*6},${42+R()*10}%,${42+R()*8}%)`; g.fillRect(0, y, w, 19); g.fillStyle = 'rgba(40,20,5,.5)'; g.fillRect(0, y+19, w, 1); const j = (R()*w)|0; g.fillRect(j, y, 2, 19); g.fillStyle = 'rgba(20,10,0,.5)'; g.fillRect(j - 8, y + 9, 2, 2); g.fillRect(j + 8, y + 9, 2, 2); } noiseFill(g, w, h, 2500, 'rgba(60,30,10,A)', 0.18, 2); });
  const hullT = tex(256, 256, (g,w,h) => { for (let y=0;y<h;y+=16){ g.fillStyle = `hsl(${20+R()*5},${45+R()*8}%,${22+R()*6}%)`; g.fillRect(0, y, w, 15); g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(0, y+15, w, 1); } noiseFill(g, w, h, 2000, 'rgba(0,0,0,A)', 0.15, 2); });
  const sailT = tex(256, 256, (g,w,h) => { g.fillStyle = '#f2e9d2'; g.fillRect(0,0,w,h); for (let x=0;x<w;x+=42){ g.fillStyle = 'rgba(140,110,70,.3)'; g.fillRect(x, 0, 2, h); } for (let y=0;y<h;y+=64){ g.fillStyle = 'rgba(140,110,70,.2)'; g.fillRect(0, y, w, 2); } noiseFill(g, w, h, 1200, 'rgba(140,110,70,A)', 0.12, 3); });
  const flagT = canvasTex(256, 160, (g,w,h) => { g.fillStyle = '#111'; g.fillRect(0,0,w,h); g.fillStyle = '#eee'; g.beginPath(); g.arc(128, 64, 34, 0, 7); g.fill(); g.fillRect(104, 76, 48, 26); g.fillStyle = '#111'; g.beginPath(); g.arc(114, 62, 10, 0, 7); g.arc(142, 62, 10, 0, 7); g.fill(); g.fillRect(118, 92, 4, 10); g.fillRect(128, 92, 4, 10); g.fillRect(138, 92, 4, 10);
    g.strokeStyle = '#eee'; g.lineWidth = 12; g.lineCap = 'round'; g.beginPath(); g.moveTo(66, 106); g.lineTo(190, 148); g.moveTo(190, 106); g.lineTo(66, 148); g.stroke(); });
  // the captain's chart: an island, a dotted route, an X, a compass rose
  const chartT = canvasTex(256, 192, (g,w,h) => { g.fillStyle = '#e8d6a8'; g.fillRect(0,0,w,h); noiseFill(g, w, h, 900, 'rgba(120,80,30,A)', 0.15, 3);
    g.fillStyle = 'rgba(90,140,170,.35)'; g.fillRect(10, 10, w - 20, h - 20);
    const isl = (cx, cy, r, n) => { g.fillStyle = '#c8b070'; g.strokeStyle = '#5a4020'; g.lineWidth = 2; g.beginPath(); for (let k=0;k<=n;k++){ const a = k/n*6.283, rr = r*(0.75 + 0.25*Math.sin(k*2.3 + cx)); k ? g.lineTo(cx + Math.cos(a)*rr, cy + Math.sin(a)*rr*0.8) : g.moveTo(cx + Math.cos(a)*rr, cy + Math.sin(a)*rr*0.8); } g.fill(); g.stroke(); };
    isl(160, 100, 42, 14); isl(60, 50, 18, 9); isl(70, 150, 14, 8);
    g.fillStyle = '#4a7a30'; for (const [x, y] of [[150, 92], [170, 108], [160, 118]]){ g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill(); }
    g.strokeStyle = '#8a2010'; g.lineWidth = 2.5; g.setLineDash([6, 5]); g.beginPath(); g.moveTo(24, 170); g.bezierCurveTo(60, 110, 110, 160, 150, 104); g.stroke(); g.setLineDash([]);
    g.lineWidth = 4; g.beginPath(); g.moveTo(143, 97); g.lineTo(157, 111); g.moveTo(157, 97); g.lineTo(143, 111); g.stroke();
    g.strokeStyle = '#3a2a18'; g.lineWidth = 1.5; g.beginPath(); g.arc(214, 42, 18, 0, 7); g.stroke(); g.fillStyle = '#3a2a18'; g.beginPath(); g.moveTo(214, 18); g.lineTo(219, 42); g.lineTo(214, 66); g.lineTo(209, 42); g.fill(); g.font = 'bold 11px serif'; g.fillText('N', 210, 14);
    g.strokeStyle = 'rgba(80,50,20,.6)'; g.lineWidth = 3; g.strokeRect(4, 4, w - 8, h - 8); });
  B.mat('chart', lam(0xffffff, {map:chartT, vertexColors:true}));
  B.mat('deck', lam(0xffffff, {map:plankT, vertexColors:true})).mat('hull', lam(0xffffff, {map:hullT, vertexColors:true})).mat('sail', lam(0xffffff, {map:sailT, vertexColors:true, side:T3.DoubleSide}))
   .mat('wood', lam(0x7a5230, {vertexColors:true})).mat('dark', lam(0x2e2016, {vertexColors:true})).mat('iron', lam(0x2a2c30, {vertexColors:true})).mat('gold', lam(0xe0b040, {vertexColors:true}))
   .mat('rope', lam(0xc0a878, {vertexColors:true})).mat('red', lam(0xa8241e, {vertexColors:true})).mat('lamp', new T3.MeshBasicMaterial({color:0xffd890})).mat('glass', new T3.MeshBasicMaterial({color:0xffc870}));
  // the ship floats high: the hold is above the waterline (no more flooded basement)
  const D = 3.6, HOLD = 0.6, X0 = 6, X1 = 36, Z0 = 17, Z1 = 27, ZC = 22, BW = 1.0, T = 0.3, KEEL = -1.8;
  // hull: sides, stern, a stepped bow, the hold floor
  B.box('hull', [X0, KEEL, Z0 - T], [X1, D + BW, Z0], {us:2}); B.box('hull', [X0, KEEL, Z1], [X1, D + BW, Z1 + T], {us:2});
  B.box('hull', [X0 - T, KEEL, Z0 - T], [X0, D + 3.6, Z1 + T], {us:2});
  const bow = [[0, 1.2], [1.4, 2.4], [2.6, 3.4], [3.6, 4.2]];
  bow.forEach(([dx, inset], k) => { const x0 = X1 + (k ? bow[k-1][0] : 0), x1 = X1 + dx + 1.2; B.box('hull', [x0, KEEL + k*0.5, Z0 + inset - 1.2 - T], [x1, D + BW + k*0.15, Z0 + inset - 1.2], {us:1}); B.box('hull', [x0, KEEL + k*0.5, Z1 - inset + 1.2], [x1, D + BW + k*0.15, Z1 - inset + 1.2 + T], {us:1});
    B.box('deck', [x0, D - 0.3, Z0 + inset - 1.2], [x1, D, Z1 - inset + 1.2], {us:1});
    if (k){ const pin = bow[k-1][1]; B.box('hull', [x0, KEEL + (k - 1)*0.5, Z0 + pin - 1.2 - T], [x0 + 0.3, D + BW + k*0.15, Z0 + inset - 1.2], {us:1}); B.box('hull', [x0, KEEL + (k - 1)*0.5, Z1 - inset + 1.2], [x0 + 0.3, D + BW + k*0.15, Z1 - pin + 1.2 + T], {us:1}); } });
  B.box('hull', [X1 + 4.5, KEEL + 1.5, Z0 + 4.2 - 1.2 - T], [X1 + 4.8, D + BW + 0.5, Z1 - 4.2 + 1.2 + T]);
  B.box('hull', [X1 + 1.2, HOLD - 0.3, Z0], [X1 + 1.5, D - 0.3, Z1], {us:2});
  B.box('hull', [X1 + 4.8, KEEL + 2, ZC - 1.2], [X1 + 5.1, D + BW + 0.6, ZC + 1.2]);
  B.box('dark', [X0, HOLD - 0.3, Z0], [X1 + 1.2, HOLD, Z1], {us:2});
  B.box('hull', [X0, KEEL, Z0], [X1, HOLD - 0.3, Z1], {solid:false});
  // gold trim along the hull, and the figurehead
  for (const y of [D + BW - 0.1, D - 0.6, HOLD + 0.3]) for (const [z0, z1] of [[Z0 - T - 0.04, Z0 - T], [Z1 + T, Z1 + T + 0.04]]) B.box('gold', [X0, y, z0], [X1, y + 0.12, z1], {solid:false});
  B.geo('gold', new T3.SphereGeometry(0.4, 12, 10), X1 + 5.6, D + 0.9, ZC); B.geo('gold', new T3.ConeGeometry(0.35, 1.4, 10), X1 + 6.2, D + 0.9, ZC, 0, 0, -Math.PI/2);
  B.geo('wood', new T3.CylinderGeometry(0.12, 0.18, 7, 8), X1 + 7, D + 2.6, ZC, 0, 0, -1.15);
  // stern windows (the captain's cabin glows)
  for (const z of [19, 21, 23, 25]) B.box('glass', [X0 - T - 0.02, D + 0.8, z - 0.4], [X0 - T, D + 1.6, z + 0.4], {solid:false});
  // the deck, with a hatch and stairs down into the hold
  const HX0 = 17, HX1 = 23, HZ0 = 21, HZ1 = 23;
  B.box('deck', [X0, D - 0.3, Z0], [X1, D, HZ0], {us:2}); B.box('deck', [X0, D - 0.3, HZ1], [X1, D, Z1], {us:2}); B.box('deck', [X0, D - 0.3, HZ0], [HX0, D, HZ1], {us:2}); B.box('deck', [HX1, D - 0.3, HZ0], [X1, D, HZ1], {us:2});
  for (const [a, b] of [[[HX0 - 0.1, D, HZ0 - 0.1], [HX1 + 0.1, D + 0.25, HZ0]], [[HX0 - 0.1, D, HZ1], [HX1 + 0.1, D + 0.25, HZ1 + 0.1]], [[HX0 - 0.1, D, HZ0], [HX0, D + 0.25, HZ1]]]) B.box('dark', a, b);
  for (let i=0;i<10;i++) B.box('wood', [HX1 - 0.6*(i + 1), HOLD, HZ0], [HX1 - 0.6*i, D - 0.3*(i + 1), HZ1]);
  // bulwarks with gunports, and the gap for the plank
  const CAN = [15, 21, 27], PX = 31;
  for (const [z0, z1, side] of [[Z0, Z0 + 0.2, -1], [Z1 - 0.2, Z1, 1]]){
    const holes = CAN.map(x => [x - 0.45, x + 0.45, D + 0.25, D + 0.85]); if (side > 0) holes.push([PX - 0.5, PX + 0.5, D, D + BW + 0.01]);
    B.wallRun(['hull'], 'x', X0, X1, z0, z1, D, D + BW, holes, 2); B.box('wood', [X0, D + BW, z0 - 0.06], [X1, D + BW + 0.1, z1 + 0.06]); }
  B.box('deck', [PX - 0.3, D - 0.06, Z1], [PX + 0.3, D + 0.04, Z1 + 3.4]); B.box('wood', [PX - 0.35, D - 0.5, Z1 + 0.25], [PX + 0.35, D - 0.06, Z1 + 0.6]);
  // quarterdeck over the captain's cabin at the stern, with stairs either side
  const QY = D + 2.4, QX = 12.5;
  B.box('deck', [X0, QY - 0.2, Z0], [QX, QY, Z1], {us:2}); B.box('hull', [X0, QY, Z0 - T], [QX, QY + 0.9, Z0], {us:2}); B.box('hull', [X0, QY, Z1], [QX, QY + 0.9, Z1 + T], {us:2});
  B.wallRun(['hull'], 'z', Z0, Z1, QX - 0.2, QX, D, QY - 0.2, [[21, 23, D, D + 2.0]], 2);
  for (const zc of [18.1, 25.9]) for (let i=0;i<8;i++) B.box('wood', [QX + 2.4 - 0.3*(i + 1), D, zc - 0.55], [QX + 2.4 - 0.3*i, D + (i + 1)*2.4/8, zc + 0.55]);
  for (const [z0, z1] of [[Z0, 17.5], [18.7, 25.3], [26.5, Z1]]) B.box('wood', [QX, QY - 0.2, z0], [QX + 0.1, QY + 0.9, z1]);
  // the captain's cabin: desk with a map, a red chest
  B.box('dark', [7, D, 20.5], [10, D + 0.8, 23.5]); B.geo('chart', new T3.PlaneGeometry(1.25, 0.95), 8.15, D + 0.805, 21.75, -Math.PI/2, 0, Math.PI/2);
  // the captain's sea chest: wood, iron bands, a curved lid and a brass lock
  B.box('wood', [6.3, D, 18.1], [7.3, D + 0.55, 18.9]); B.geo('wood', new T3.CylinderGeometry(0.4, 0.4, 1.0, 12, 1, false, 0, Math.PI), 6.8, D + 0.55, 18.5, 0, 0, Math.PI/2); B.solid([6.3, D + 0.55, 18.1], [7.3, D + 0.9, 18.9]);
  for (const x of [6.45, 7.15]){ B.box('iron', [x - 0.04, D, 18.08], [x + 0.04, D + 0.55, 18.92], {solid:false}); B.geo('iron', new T3.CylinderGeometry(0.415, 0.415, 0.08, 12, 1, false, 0, Math.PI), x, D + 0.55, 18.5, 0, 0, Math.PI/2); }
  B.box('gold', [6.72, D + 0.38, 18.88], [6.88, D + 0.56, 18.92], {solid:false});
  for (const z of [17.5, 26.5]) B.box('lamp', [11.8, D + 1.7, z - 0.1], [12.0, D + 1.9, z + 0.1], {solid:false});
  // masts, yards, sails (they billow), crow's nest with a rope ladder up the main mast
  const sails = [], flags = [];
  for (const [x, y0, h, nest] of [[24, D, 15, true], [32, D, 12, false], [9, QY, 10, false]]){
    B.cyl('wood', 0.3, 0.22, h, x, y0, ZC, 12);
    for (const [yy, w] of [[y0 + h*0.45, 4.2], [y0 + h*0.75, 3.2]]){ B.geo('wood', new T3.CylinderGeometry(0.1, 0.1, w*2, 8), x, yy, ZC, Math.PI/2);
      const sg = new T3.PlaneGeometry(w*1.8, h*0.27, 10, 4); sails.push({geo:sg, x:x + 0.35 + O.x, y:yy - h*0.14, z:ZC + O.z, base:Float32Array.from(sg.attributes.position.array), w, h:h*0.27}); }
    if (nest){ B.cyl('wood', 1.1, 1.1, 0.15, x, y0 + 9, ZC, 16); for (let k=0;k<12;k++){ const a = k/12*Math.PI*2; B.box('wood', [x + Math.cos(a)*1.05 - 0.05, y0 + 9.15, ZC + Math.sin(a)*1.05 - 0.05], [x + Math.cos(a)*1.05 + 0.05, y0 + 10.1, ZC + Math.sin(a)*1.05 + 0.05]); }
      B.geo('wood', new T3.TorusGeometry(1.05, 0.05, 6, 20), x, y0 + 10.1, ZC, Math.PI/2);
      for (let k=0;k<22;k++) B.box('rope', [x - 0.5, y0 + 0.5 + k*0.4, ZC - 0.3], [x - 0.32, y0 + 0.55 + k*0.4, ZC + 0.3]); }
    const fg = new T3.PlaneGeometry(1.8, 1.1, 8, 3); flags.push({geo:fg, x:x + 0.95 + O.x, y:y0 + h - 0.6, z:ZC + O.z, base:Float32Array.from(fg.attributes.position.array)});
  }
  // rigging: shrouds fanning from high on each mast down to the rails, with rungs across them
  const ropeAB = (a, b, r) => { const d = b.clone().sub(a), m = a.clone().add(b).multiplyScalar(0.5), e = new T3.Euler().setFromQuaternion(new Q().setFromUnitVectors(new V(0, 1, 0), d.clone().normalize()));
    B.geo('rope', new T3.CylinderGeometry(r || 0.025, r || 0.025, d.length(), 5), m.x, m.y, m.z, e.x, e.y, e.z); };
  for (const [mx, top] of [[24, D + 9], [32, D + 8.5]]) for (const s of [-1, 1]){
    const ends = [-1.2, -0.4, 0.4, 1.2].map(dx => new V(mx + dx, D + BW + 0.08, ZC + s*(5 - 0.05)));
    for (const e of ends) ropeAB(new V(mx, top, ZC + s*0.25), e);
    for (let k=1;k<9;k++){ const f = k/9, a = new V(mx, top, ZC + s*0.25).lerp(ends[0], f), b = new V(mx, top, ZC + s*0.25).lerp(ends[3], f); ropeAB(a, b, 0.015); } }
  B.geo('wood', new T3.CylinderGeometry(0.1, 0.1, 7.7, 8), 28.15, D + 6.75, ZC, 0, 0, Math.PI/2);          // the spar the rope swings hang from
  for (const [a, b] of [[[24, D + 14.5, ZC], [32, D + 11.5, ZC]], [[24, D + 14.5, ZC], [9, QY + 9.5, ZC]], [[32, D + 11.5, ZC], [X1 + 9.5, D + 4.4, ZC]]]) ropeAB(new V(...a), new V(...b), 0.022);
  // the cannons, on carriages, pointing out of the gunports
  const cannons = [];
  for (const x of CAN) for (const s of [-1, 1]){
    const zb = ZC + s*3.6; B.box('wood', [x - 0.38, D, zb - 0.55], [x + 0.38, D + 0.35, zb + 0.55]);
    B.geo('iron', new T3.CylinderGeometry(0.17, 0.22, 1.8, 14), x, D + 0.55, zb + s*0.65, s*Math.PI/2); B.solid([x - 0.2, D + 0.35, Math.min(zb, zb + s*1.5)], [x + 0.2, D + 0.75, Math.max(zb, zb + s*1.5)]); B.geo('iron', new T3.SphereGeometry(0.22, 10, 8), x, D + 0.55, zb - s*0.25);
    B.geo('gold', new T3.TorusGeometry(0.2, 0.03, 6, 14), x, D + 0.55, zb + s*1.4, 0, 0, 0);
    for (const sx of [-0.32, 0.32]) for (const dz of [-0.35, 0.35]) B.geo('dark', new T3.CylinderGeometry(0.16, 0.16, 0.08, 10), x + sx, D + 0.16, zb + dz, 0, 0, Math.PI/2);
    cannons.push({x, s, load:new V(x + O.x, D + 0.78, zb - s*0.35 + O.z), muzzle:new V(x + O.x, D + 0.55, zb + s*1.6 + O.z), dir:new V(0, 0.18, s).normalize(), p:null, fuse:0});
  }
  // the hold: dry now. Crates, barrels, hammocks, a cannonball stack, and the treasure
  for (const [x, z, n] of [[8, 18, 2], [10, 18, 1], [27, 24.8, 2], [30, 18, 1], [33.5, 18, 2]]) for (let k=0;k<n;k++) B.box('wood', [x, HOLD + k*1.0, z], [x + 1.6, HOLD + k*1.0 + 0.95, z + 1.6]);
  const hammocks = []; for (const [x, z] of [[24, 19], [27, 19], [12, 25.5]]){ const cx = x + 1;
    for (const px of [cx - 1.3, cx + 1.3]){ B.box('wood', [px - 0.08, HOLD, z - 0.08], [px + 0.08, D - 0.3, z + 0.08]); B.box('rope', [Math.min(px, cx + Math.sign(px - cx)*1.05), HOLD + 1.78, z - 0.025], [Math.max(px, cx + Math.sign(px - cx)*1.05), HOLD + 1.82, z + 0.025], {solid:false}); }
    B.solid([cx - 1.05, HOLD + 1.4, z - 0.4], [cx + 1.05, HOLD + 1.75, z + 0.4]); const hm = new T3.Mesh(new T3.CylinderGeometry(0.45, 0.45, 2.1, 12, 1, true, Math.PI, Math.PI), lam(0xd8c8a0, {side:T3.DoubleSide})); hm.rotation.z = Math.PI/2; hm.position.set(x + 1 + O.x, HOLD + 1.8, z + O.z); hammocks.push(hm); }
  for (let k=0;k<10;k++){ const row = k < 4 ? 0 : k < 7 ? 1 : k < 9 ? 2 : 3, i = [0,1,2,3,0,1,2,0,1,0][k]; B.geo('iron', new T3.SphereGeometry(0.16, 8, 6), 12.505 + i*0.33 + row*0.165, HOLD + 0.16 + row*0.27, 25.5); }
  // the treasure chest (touch it and it opens: gold everywhere)
  const TCX = 33 + O.x, TCZ = 23.4 + O.z;
  B.box('red', [32.3, HOLD, 22.9], [33.7, HOLD + 0.7, 23.9]); B.box('gold', [32.28, HOLD + 0.32, 22.88], [33.72, HOLD + 0.4, 23.92], {solid:false});
  for (let k=0;k<26;k++){ const a = mr()*6.28, r = 0.4 + mr()*1.4; B.geo('gold', new T3.CylinderGeometry(0.07, 0.07, 0.015, 10), 33 + Math.cos(a)*r, HOLD + 0.01 + mr()*0.03, 23.4 + Math.sin(a)*r, (mr() - 0.5)*0.4, 0, (mr() - 0.5)*0.4); }
  for (const [k, x, y, z] of [['barrel', 20, D, 18.2], ['barrel', 26, D, 25.8], ['barrel', 14, HOLD, 22], ['barrel', 16, HOLD, 19.5], ['box', 29, D, 18.3], ['box', 18, D, 25.7], ['bottle', 8, D + 0.8, 21.5], ['bottle', 25, HOLD, 22.5],
    ['ball', 12.6, HOLD, 23], ['stick', 22, D, 25.6], ['mug', 9, D + 0.8, 22.5], ['book', 8.5, D + 0.8, 22.9], ['duck', 30, D, 20], ['barrel', 34, D, 19], ['mug', 20, HOLD, 24.5]]) B.prop(k, x, y, z);
  // the wheel's stand (binnacle and axle) and the bell's frame
  B.cyl('wood', 0.16, 0.12, 0.95, 10.0, QY, ZC, 10); B.box('wood', [9.86, QY + 0.92, ZC - 0.13], [10.14, QY + 1.18, ZC + 0.13]); B.geo('iron', new T3.CylinderGeometry(0.04, 0.04, 0.36, 8), 10.24, QY + 1.05, ZC, 0, 0, Math.PI/2);
  B.solid([10.27, QY + 0.45, ZC - 0.62], [10.33, QY + 1.65, ZC + 0.62]);
  for (const z of [19.95, 21.45]) B.box('wood', [33.42, D, z - 0.08], [33.58, D + 2.56, z + 0.08]); B.box('wood', [33.4, D + 2.42, 19.85], [33.6, D + 2.58, 21.55]); B.box('iron', [33.46, D + 2.22, 20.66], [33.54, D + 2.42, 20.74], {solid:false});
  const lampPos = [[11.9, D + 1.8, 17.5], [11.9, D + 1.8, 26.5], [14, HOLD + 2.3, 19.5], [20, HOLD + 2.3, 19.5], [26, HOLD + 2.3, 21.5], [32, HOLD + 2.3, 21.5], [8.5, D + 1.8, 22]];
  const light = (x, y, z) => { x -= O.x; z -= O.z; let r = 1.05, g = 0.98, b = 0.9;
    if (y < D - 0.1 || (x < QX && y < QY - 0.1)){ r = 0.28; g = 0.22; b = 0.16; for (const [lx, ly, lz] of lampPos){ const d = Math.hypot(x - lx, y - ly, z - lz), k = 1.3*Math.exp(-d/2.8); r += k; g += k*0.72; b += k*0.36; } }
    return [r, g, b]; };
  const grp = B.finish(light), nav = buildNav(B.solids, O, 44, 2, [HOLD, D]);
  for (const s of sails){ const m = new T3.Mesh(s.geo, lam(0xffffff, {map:sailT, side:T3.DoubleSide})); m.position.set(s.x, s.y, s.z); m.rotation.y = Math.PI/2; grp.add(m); }
  for (const f of flags){ const m = new T3.Mesh(f.geo, new T3.MeshBasicMaterial({map:flagT, side:T3.DoubleSide})); m.position.set(f.x, f.y, f.z); m.rotation.y = Math.PI/2; grp.add(m); }
  for (const h of hammocks) grp.add(h);
  // swinging hold lanterns
  const lanterns = lampPos.slice(2, 6).map(([x, y, z], k) => { const g = new T3.Group(); g.position.set(x + O.x, y + 0.5, z + O.z); const l = new T3.Mesh(new T3.CylinderGeometry(0.1, 0.13, 0.26, 8), new T3.MeshBasicMaterial({color:0xffcf70})); l.position.y = -0.5; g.add(l);
    const c = new T3.Mesh(new T3.CylinderGeometry(0.01, 0.01, 0.4, 4), lam(0x333333)); c.position.y = -0.2; g.add(c); grp.add(g); return {g, k}; });
  // the wheel (spin it) and the bell (ring it)
  const wheel = new T3.Group(); wheel.position.set(10.3 + O.x, QY + 1.05, ZC + O.z); wheel.rotation.y = Math.PI/2; grp.add(wheel);
  wheel.add(new T3.Mesh(new T3.TorusGeometry(0.5, 0.045, 6, 18), lam(0x7a5230))); for (let k=0;k<8;k++){ const sp = new T3.Mesh(new T3.CylinderGeometry(0.025, 0.025, 1.3, 5), lam(0x7a5230)); sp.rotation.z = k*Math.PI/8; wheel.add(sp); }
  wheel.add(new T3.Mesh(new T3.CylinderGeometry(0.1, 0.1, 0.12, 10).rotateX(Math.PI/2), lam(0xe0b040)));
  let wheelV = 0, wheelA = 0, wheelHand = [null, null];
  const bellG = new T3.Group(); bellG.position.set(33.5 + O.x, D + 2.25, 20.5 + O.z); grp.add(bellG); 
  const bellPts = []; for (let k=0;k<=10;k++){ const t = k/10; bellPts.push(new T3.Vector2(0.08 + 0.17*Math.pow(t, 1.8) + (t > 0.85 ? (t - 0.85)*0.6 : 0), 0.4 - t*0.4)); }
  const bellM = new T3.Mesh(new T3.LatheGeometry(bellPts, 16), lam(0xe0b040, {side:T3.DoubleSide})); bellM.position.set(0, -0.45, 0.2); bellG.add(bellM); let bellSw = 0, bellVv = 0, bellCD = 0;
  const ding = v => { bellVv += v*3; if (!AC) return; const d = lastPlayer.distanceTo(bellG.position), vol = Math.min(1, 6/(2 + d))*v; for (const [f, a] of [[880, 0.4], [1320, 0.2], [1760, 0.12]]) tone('sine', f, f, 1.6, a*vol*0.5); };
  // ropes to swing on, hanging from the main yard
  const ropes = [[26.6, ZC, 0], [29.6, ZC, 2.2]].map(([x, z, ph]) => { const pv = new V(x + O.x, D + 6.62, z + O.z), L = 5.4; const g = new T3.Group(); g.position.copy(pv); grp.add(g);
    const rm = new T3.Mesh(new T3.CylinderGeometry(0.03, 0.03, L, 6), lam(0xc0a878)); rm.position.y = -L/2; g.add(rm); const kn = new T3.Mesh(new T3.SphereGeometry(0.1, 8, 6), lam(0xa08858)); kn.position.y = -L; g.add(kn);
    return {g, pv, L, ph, box:dynBox(), c:new V(), prev:new V()}; });
  // the sea (real waves), sky, sun, islands with palm trees, gulls, sharks
  const sea = new T3.Group(); sea.position.set(22 + O.x, 0, ZC + O.z); grp.add(sea);
  const waterG = new T3.PlaneGeometry(124, 124, 70, 70); waterG.rotateX(-Math.PI/2); const wBase = Float32Array.from(waterG.attributes.position.array);
  const wCol = new Float32Array(wBase.length); waterG.setAttribute('color', new T3.BufferAttribute(wCol, 3));
  const water = new T3.Mesh(waterG, new T3.MeshLambertMaterial({vertexColors:true, emissive:0x04121e})); water.position.y = -0.2; sea.add(water);
  const skyDome = new T3.Mesh(new T3.SphereGeometry(62, 24, 12), new T3.ShaderMaterial({side:T3.BackSide, depthWrite:false, fog:false, uniforms:{}, vertexShader:'varying float vy; void main(){ vy = normalize(position).y; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader:'varying float vy; void main(){ vec3 top = vec3(0.25,0.55,0.92), hor = vec3(0.86,0.93,1.0), low = vec3(0.55,0.75,0.9); vec3 c = vy > 0.0 ? mix(hor, top, pow(vy, 0.6)) : mix(hor, low, min(1.0, -vy*4.0)); gl_FragColor = vec4(c, 1.0); }'}));
  skyDome.position.set(22 + O.x, 0, ZC + O.z); skyDome.renderOrder = -10; grp.add(skyDome);
  const sun = new T3.Mesh(new T3.SphereGeometry(3.2, 16, 10), new T3.MeshBasicMaterial({color:0xfff4c8, fog:false})); sun.position.set(-30, 26, 42); sea.add(sun);
  const glow = new T3.Mesh(new T3.SphereGeometry(7, 16, 10), new T3.MeshBasicMaterial({color:0xfff0b0, fog:false, transparent:true, opacity:0.25, depthWrite:false})); glow.position.copy(sun.position); sea.add(glow);
  for (let k=0;k<10;k++){ const c = new T3.Group(); for (let j=0;j<4;j++){ const b = new T3.Mesh(new T3.SphereGeometry(3 + mr()*2.5, 10, 6), new T3.MeshBasicMaterial({color:0xffffff, fog:false, transparent:true, opacity:0.9})); b.position.set(j*4 - 6, mr()*1.5, mr()*2); b.scale.y = 0.55; c.add(b); }
    const a = mr()*6.3, r = 38 + mr()*14; c.position.set(Math.cos(a)*r, 24 + mr()*8, Math.sin(a)*r); c.scale.setScalar(0.7); sea.add(c); }
  for (const [x, z, r] of [[-38, -30, 7], [34, 38, 9], [46, -20, 5]]){
    const sand = new T3.Mesh(new T3.CylinderGeometry(r*1.05, r*1.3, 1.2, 20), lam(0xead9a6)); sand.position.set(x, -0.6, z); sea.add(sand);
    const hill = new T3.Mesh(new T3.SphereGeometry(r*0.8, 16, 8, 0, 6.3, 0, 1.3), lam(0x4a9a3a)); hill.position.set(x, -0.2, z); sea.add(hill);
    for (let k=0;k<4;k++){ const a = mr()*6.3, rr = r*(0.3 + mr()*0.5), px = x + Math.cos(a)*rr, pz = z + Math.sin(a)*rr, th = 5 + mr()*3;
      const trunk = new T3.Mesh(new T3.CylinderGeometry(0.25, 0.4, th, 6), lam(0x8a6a40)); trunk.position.set(px, r*0.5 + th/2 - 1, pz); trunk.rotation.z = (mr() - 0.5)*0.4; sea.add(trunk);
      for (let j=0;j<6;j++){ const leaf = new T3.Mesh(new T3.ConeGeometry(0.6, 3.6, 4), lam(0x2f8a2a)); const b = j/6*Math.PI*2; leaf.position.set(px + Math.cos(b)*1.4, r*0.5 + th - 1.2, pz + Math.sin(b)*1.4); leaf.rotation.set(Math.sin(b)*1.2, 0, -Math.cos(b)*1.2); sea.add(leaf); } } }
  const gulls = Array.from({length:6}, (_, k) => { const g = new T3.Group(); for (const s of [-1, 1]){ const w = new T3.Mesh(new T3.BoxGeometry(0.7, 0.03, 0.18), lam(0xf4f4f4)); w.position.x = s*0.33; w.rotation.z = s*0.3; g.add(w); } const b = new T3.Mesh(new T3.SphereGeometry(0.1, 6, 4), lam(0xffffff)); b.scale.z = 2; g.add(b); grp.add(g); return {g, a:k, r:14 + k*3, h:D + 9 + k*1.5, sp:0.15 + k*0.03}; });
  const fins = [0, 1].map(k => { const f = new T3.Mesh(new T3.ConeGeometry(0.4, 0.9, 4), lam(0x5a6670)); f.scale.z = 0.25; sea.add(f); return {f, a:k*3, r:12 + k*3}; });
  // the kraken: every so often a tentacle rises beside the ship and slams the deck
  const tent = new T3.Group(); grp.add(tent); const TN = 28, tSegs = Array.from({length:TN}, (_, k) => { const m = new T3.Mesh(new T3.SphereGeometry(0.6 - k*0.018, 12, 8), lam(0x7e325f)); tent.add(m); return m; });
  for (let k=2;k<TN;k+=3){ const s = new T3.Mesh(new T3.SphereGeometry(0.11 - k*0.002, 8, 6), lam(0xf0c0d8)); tSegs[k].add(s); s.position.set(0, 0, 0.5 - k*0.016); }
  tent.visible = false; const K_EVERY = 75, K_LEN = 15; let kSlamDone = -1, kSeen = -1;
  const kPlan = n => { const r = Math.abs(Math.sin(n*12.9898)*43758.5453) % 1, r2 = Math.abs(Math.sin(n*78.233)*12543.13) % 1; return {x:CAN[Math.floor(r*3) % 3] + O.x, side:r2 < 0.5 ? -1 : 1}; };
  let kDeadUntil = 0, kDeadN = -1;          // shot by a cannon: gone for 2 minutes
  const KRAKEN_NAP = 120;
  const splash = pos => { for (let k=0;k<20;k++) frostPuff(pos.clone().add(new V((R()-0.5)*0.8, 0, (R()-0.5)*0.8))); if (AC && pos.distanceTo(lastPlayer) < 25) noiseHit(0.6, 900, 0.6, 0.4); };
  const sndBoom = v => { if (!AC) return; noiseHit(1.0, 220, 0.6, 1.0*v); tone('sine', 70, 30, 0.6, 0.7*v); noiseHit(0.2, 1500, 1, 0.5*v); };
  const fuseS = () => { if (AC) noiseHit(1.0, 5000, 2, 0.08); };
  const fire = (c, local) => { const pos = c.muzzle.clone(); flash(pos, 1.4); spawnSparks(pos, 50, 6); emitAsh(pos, 20, 0.3); for (let k=0;k<12;k++) emitFire(pos.clone(), c.dir.clone().multiplyScalar(4 + R()*4).add(new V(R()-0.5, R()-0.5, R()-0.5)), 0.12, 0.3);
    sndBoom(Math.min(1, 6/(1 + pos.distanceTo(lastPlayer)))); if (local && netGame) netSend('ev', {t:'mapev', m:'ship', k:'boom', c:cannons.indexOf(c)}); };
  const onShip = p => p.x > X0 - 0.4 + O.x && p.x < X1 + 5.2 + O.x && p.z > Z0 - 0.4 + O.z && p.z < Z1 + 0.4 + O.z;
  const ride = (box, dlt) => { const h = loco.headPos(); let on = false;
    for (const i of [0,1]) if (!on && !me.lost[i] && loco.S.wasTouching && loco.S.wasTouching[i]){ const p = loco.S.lastHand[i]; if (p.x > box.min[0] - 0.12 && p.x < box.max[0] + 0.12 && p.y > box.min[1] - 0.12 && p.y < box.max[1] + 0.12 && p.z > box.min[2] - 0.12 && p.z < box.max[2] + 0.12) on = true; }
    if (on){ rig.position.add(dlt); for (const i of [0,1]) loco.S.lastHand[i].add(dlt); } return on; };
  let roll = 0, chestOpen = 0, chestT = 0, lockedMsgT = 0;
  const krakenDown = (n, local) => { if (kDeadN === n) return; kDeadN = n; kDeadUntil = Date.now()/1000 + KRAKEN_NAP;
    const c = tSegs[Math.floor(TN*0.4)].position.clone(); tent.visible = false; flash(c, 2.2); spawnSparks(c, 120, 6); emitAsh(c, 40, 0.5); for (let k=0;k<30;k++) emitFire(c.clone(), new V(R()-0.5, R()*0.8, R()-0.5).multiplyScalar(8), 0.2, 0.5);
    for (let k=0;k<25;k++) frostPuff(c.clone().add(new V((R()-0.5)*3, (R()-0.5)*4, (R()-0.5)*3))); sndBoom(1); if (AC) setTimeout(() => tone('sawtooth', 120, 30, 1.2, 0.15), 200);
    showMsg('THE KRAKEN IS BEATEN! The treasure chest is open!'); if (local && netGame) netSend('ev', {t:'mapev', m:'ship', k:'kdead', n});
    chestOpen = 1; chestT = 0; if (AC){ tone('triangle', 520, 520, 0.12, 0.1); setTimeout(() => tone('triangle', 780, 780, 0.25, 0.1), 120); }
    for (let k=0;k<3;k++) spawnScrap('sc-kraken-' + n + '-' + k, new V(TCX - 0.45 + k*0.45, HOLD + 1.4, TCZ + 0.15)); };
  const lid = new T3.Group(); lid.position.set(TCX, HOLD + 0.7, TCZ - 0.5); grp.add(lid); const lidM = new T3.Mesh(new T3.CylinderGeometry(0.5, 0.5, 1.4, 12, 1, false, 0, Math.PI), lam(0xa8241e)); lidM.rotation.z = Math.PI/2; lidM.position.set(0, 0, 0.5); lid.add(lidM);
  const lidBand = new T3.Mesh(new T3.CylinderGeometry(0.52, 0.52, 0.1, 12, 1, false, 0, Math.PI), lam(0xe0b040)); lidBand.rotation.z = Math.PI/2; lidBand.position.set(0, 0, 0.5); lid.add(lidBand);
  const lidBox = dynBox(), lidBB = new T3.Box3();
  const goldPile = new T3.Mesh(new T3.SphereGeometry(0.5, 12, 6, 0, 6.3, 0, 1.2), new T3.MeshBasicMaterial({color:0xffc830})); goldPile.scale.set(1.3, 0.35, 0.9); goldPile.position.set(TCX, HOLD + 0.62, TCZ); grp.add(goldPile);
  const SSt = [{lo:0, hi:1, bottom:[16.2, HOLD, 22], pts:[[17.3, HOLD, 22], [22.7, D - 0.3, 22], [23.9, D, 22]]}];   // nav floors: 0 = the hold, 1 = the deck
  const shipIdea = (bot, imp) => { const l = bot.cell ? bot.cell[2] : 1;
    if (imp || l === 0 || R() < 0.4) return actStairs(SSt, bot, l === 0, null);
    return actWalk(new V(32.5 + O.x, D, 20.7 + O.z), [], {then:(b, failed) => { if (failed) return null; let n = 0;
      return actDo(2.4, (b2, t) => { botYaw(b2, Math.PI/2); const sw = t % 0.7 < 0.25; botLimbs(b2, 0, 0.4, j => j === 0 && sw ? -2.0 : -0.3);
        if (t > 0.2 + n*0.7 && n < 3){ n++; ding(1); if (netGame) netSend('ev', {t:'mapev', m:'ship', k:'bell', v:1}); if (n === 1) say(b2, pick(['ALL HANDS ON DECK','ding ding ding','ahoy!'])); } }); }}); };
  MAPS.ship = {name:'PIRATE SHIP', O, botIdea:shipIdea, group:grp, spawn:new V(28, D, 21).add(O), yaw:Math.PI/2, nav, yMin:-8, yMax:30, props:B.props,
    sky:{bg:0x8fc6ea, fog:0xb8d8ee, near:40, far:130, hs:0xfff6e0, hg:0x2a5a7a, hi:1.05, ac:0xffffff, ai:0.32},
    onEv(ev){ if (ev.k === 'boom' && cannons[ev.c]) fire(cannons[ev.c], false); else if (ev.k === 'bell') ding(ev.v || 1); else if (ev.k === 'kdead') krakenDown(ev.n, false); },
    dbg:() => ({ropes, tent, tSegs, get kSeen(){ return kSeen; }, get kDeadUntil(){ return kDeadUntil; }, get chestOpen(){ return chestOpen; }, cannons, D, HOLD}),
    update(dt, inGame){
      const t = Date.now()/1000; roll = Math.sin(t*0.85)*0.045; const pitch = Math.sin(t*0.53 + 1)*0.018;
      sea.rotation.set(roll, 0, pitch); sea.position.y = Math.sin(t*0.7)*0.15;
      // waves
      const pa = waterG.attributes.position.array;
      for (let i=0;i<pa.length;i+=3){ const x = wBase[i], z = wBase[i+2], y = Math.sin(x*0.18 + t*1.1)*0.28 + Math.sin(z*0.23 - t*0.9)*0.22 + Math.sin((x + z)*0.5 + t*2.0)*0.06; pa[i+1] = y;
        const f = Math.max(0, y - 0.32)*3, d = Math.min(1, Math.hypot(x, z)/60); wCol[i] = 0.03 + f*0.8 + d*0.12; wCol[i+1] = 0.2 + f*0.65 + d*0.2 + y*0.08; wCol[i+2] = 0.38 + f*0.5 + d*0.2 + y*0.08; }
      waterG.attributes.position.needsUpdate = true; waterG.attributes.color.needsUpdate = true; if ((t*4|0) % 4 === 0) waterG.computeVertexNormals();
      for (const s of sails){ const p = s.geo.attributes.position.array; for (let i=0;i<p.length;i+=3){ const u = s.base[i]/(s.w*0.9), v = s.base[i+1]/(s.h*0.5); p[i+2] = (1 - u*u)*(1 - v*v*0.5)*(0.45 + Math.sin(t*1.3 + s.x)*0.12); } s.geo.attributes.position.needsUpdate = true; }
      for (const f of flags){ const p = f.geo.attributes.position.array; for (let i=0;i<p.length;i+=3){ const u = f.base[i] + 0.9; p[i+2] = Math.sin(u*3 - t*6)*0.15*u; } f.geo.attributes.position.needsUpdate = true; }
      for (const l of lanterns){ l.g.rotation.z = Math.sin(t*0.85 + l.k)*0.18; l.g.rotation.x = Math.sin(t*0.53 + l.k*2)*0.08; }
      hammocks.forEach((h, k) => h.rotation.x = Math.sin(t*0.85 + k)*0.12);
      for (const g of gulls){ g.a += dt*g.sp; g.g.position.set(22 + O.x + Math.cos(g.a)*g.r, g.h + Math.sin(g.a*3)*0.6, ZC + O.z + Math.sin(g.a)*g.r*0.7); g.g.rotation.y = -g.a; g.g.children[0].rotation.z = 0.3 + Math.sin(t*6 + g.r)*0.4; g.g.children[1].rotation.z = -0.3 - Math.sin(t*6 + g.r)*0.4; }
      for (const f of fins){ f.a += dt*0.25; f.f.position.set(Math.cos(f.a)*f.r, 0.1, Math.sin(f.a)*f.r*1.6); f.f.rotation.y = -f.a; }
      wheelV *= Math.exp(-dt*0.8); wheelA += wheelV*dt; wheel.rotation.z = wheelA;
      bellVv += (-bellSw*14 - bellVv*1.5)*dt; bellSw += bellVv*dt; bellG.rotation.z = bellSw*0.4; bellCD -= dt;
      if (chestOpen > 0){ chestT += dt; if (chestT > 30){ chestOpen = 0; } } lid.rotation.x += ((chestOpen ? -1.9 : 0) - lid.rotation.x)*Math.min(1, dt*5); goldPile.visible = lid.rotation.x < -0.3;
      lid.updateMatrixWorld(true); lidBB.setFromObject(lidM); setDyn(lidBox, lidBB.min.x, Math.max(HOLD + 0.7, lidBB.min.y), lidBB.min.z, lidBB.max.x, lidBB.max.y, lidBB.max.z);
      if (chestOpen && chestT < 2 && R() < 0.5) spawnSparks(new V(TCX, HOLD + 0.9, TCZ), 1, 1.2);
      // rope swings
      for (const r of ropes){ const a = Math.sin(t*1.25 + r.ph)*0.55; r.g.rotation.x = a; r.prev.copy(r.c); r.c.set(r.pv.x, r.pv.y - Math.cos(a)*r.L, r.pv.z + Math.sin(a)*r.L);
        setDyn(r.box, r.c.x - 0.12, r.c.y - 0.15, r.c.z - 0.12, r.c.x + 0.12, r.c.y + 2.2, r.c.z + 0.12); }
      // the kraken: rises (0-3 s), sways (time to load a cannon!), slams down at 13 s, sinks away by 15 s
      const n = Math.floor(t/K_EVERY), kt = t - n*K_EVERY, kp = kPlan(n);
      if (kt < K_LEN && n > 0 && t > kDeadUntil && n !== kDeadN){ tent.visible = true; kSeen = n;
        const up = kt < 3 ? kt/3 : kt < 13.4 ? 1 : Math.max(0, 1 - (kt - 13.4)/1.6), slam = kt < 12.4 ? 0 : Math.min(1, (kt - 12.4)/0.5);
        const base = new V(kp.x, -0.5, ZC + O.z + kp.side*(7.2 + (1 - up)*1.5));             // right in front of a cannon's gunport
        tSegs.forEach((m, k) => { const u = k/(TN - 1), h = up*(u*8.5), bend = slam*u*u*(Math.PI*0.62), sway = Math.sin(t*2 + u*3)*0.3*(1 - slam)*u;
          m.position.set(base.x + sway, base.y + Math.cos(bend)*h, base.z - kp.side*Math.sin(bend)*h*0.95); });
        if (kt > 0.1 && kt - dt <= 0.1 && AC && inGame) tone('sawtooth', 60, 40, 1.5, 0.12);
        // hit by anything fired from a cannon: BOOM, it's beaten
        if (inGame) for (const p of parts){ if (!(p.cball > clock) || p.parent || p.obj.userData.dead || !mine(p)) continue; const c = centerW(p);
          if (tSegs.some(m => m.position.distanceTo(c) < 0.75 + p.r)){ p.cball = 0; p.v.multiplyScalar(-0.3); krakenDown(n, true); break; } }
        if (tent.visible && slam >= 1 && kSlamDone !== n){ kSlamDone = n; const hit = tSegs[TN - 1].position.clone().setY(D + 0.2); splash(hit); sndClank(9); sndBoom(0.6); spawnSparks(hit, 40, 4);
          if (inGame){ const h = loco.headPos(); if (Math.hypot(h.x - hit.x, h.z - hit.z) < 2.4 && h.y < D + 3){ loco.S.velocity.add(h.clone().sub(hit).setY(0).setLength(6)).add(new V(0, 5, 0)); pulse(0, 1, 250); pulse(1, 1, 250); lastCombat = clock; showMsg('THE KRAKEN!'); }
            for (const p of parts){ if (p.parent || p.obj.userData.dead || !mine(p)) continue; const c = centerW(p); if (Math.hypot(c.x - hit.x, c.z - hit.z) < 2.6 && c.y < D + 2.5){ if (p.bot && p === p.bot.root && p.mode === 'bot'){ p.mode = 'free'; p.bot.stunT = 2; say(p.bot, pick(['KRAKEN!!','tentacles!','ahhh'])); } if (p.mode === 'free'){ p.asleep = false; p.v.add(c.clone().sub(hit).setY(0).setLength(5)).add(new V(0, 6, 0)); } } } } }
      } else tent.visible = false;
      if (!inGame) return;
      // overboard = sharks
      const h = loco.headPos(), feet = h.clone().setY(floorBelow(h));
      if (!onShip(h) && h.y < 0.4){ splash(feet.clone().setY(0)); die(feet.z > Z1 + O.z && Math.abs(feet.x - PX - O.x) < 2 ? 'walking the plank' : 'the sharks'); return; }
      // ride the ropes
      for (const r of ropes) if (r.prev.lengthSq()) ride(r.box, r.c.clone().sub(r.prev));
      // spin the wheel (push a spoke), ring the bell, open the chest
      for (const i of [0,1]){ if (me.lost[i]) continue; const p = handW[i], wc = wheel.position;
        if (Math.abs(p.x - wc.x) < 0.15 && Math.hypot(p.y - wc.y, p.z - wc.z) < 0.62 && Math.hypot(p.y - wc.y, p.z - wc.z) > 0.3 && hv[i].length() > 0.6){ const rr = new V(0, p.y - wc.y, p.z - wc.z), tq = rr.y*hv[i].z - rr.z*hv[i].y; wheelV += tq*dt*12; if (AC && R() < 0.05) noiseHit(0.08, 600, 2, 0.06); }
        const bp = bellG.localToWorld(new V(0, -0.25, 0.2)); if (bellCD <= 0 && p.distanceTo(bp) < 0.3 && hv[i].length() > 1){ ding(Math.min(1.5, hv[i].length()/3)); bellCD = 0.4; pulse(i, 0.8, 80); if (netGame) netSend('ev', {t:'mapev', m:'ship', k:'bell', v:1}); }
        if (!chestOpen && clock > lockedMsgT && Math.abs(p.x - TCX) < 0.8 && Math.abs(p.z - TCZ) < 0.6 && p.y < HOLD + 1.1 && p.y > HOLD + 0.3){ lockedMsgT = clock + 3; pulse(i, 0.4, 60); if (AC) noiseHit(0.1, 1200, 2, 0.1); showMsg('Locked tight. Shoot the KRAKEN with a cannon to open it!'); }
      }
      for (const c of cannons){
        if (c.p){ c.fuse -= dt; const p = c.p;
          if (p.obj.userData.dead){ c.p = null; continue; }
          p.obj.position.add(c.load.clone().addScaledVector(c.dir, 0.4).sub(centerW(p))); p.v.set(0, 0, 0); p.mode = 'free'; p.asleep = false;
          if (R() < 0.4) spawnSparks(c.load.clone().add(new V(0, 0.25, 0)), 2, 1);
          if (c.fuse <= 0){ p.obj.position.add(c.muzzle.clone().addScaledVector(c.dir, 0.3 + p.r).sub(centerW(p))); p.v.copy(c.dir).multiplyScalar(24); p.w.set(R()-0.5, R()-0.5, R()-0.5).multiplyScalar(15); fire(c, true); c.p = null; p.calmT = clock + 0.4; p.noLoad = clock + 2; p.cball = clock + 2.5; p.obj.updateMatrixWorld(true); p.cprev = centerW(p); }
        }
      }
      for (const p of parts.slice()){
        if (p.parent || p.obj.userData.dead || !mine(p) || p.mode === 'held' || p.stuck || p.inCannon) continue;
        const c = centerW(p);
        if (!onShip(c) && c.y < 0.1){ splash(c.clone().setY(0)); removePart(p); continue; }
        if (p.bot && !p.bot.dead && p === p.bot.root && p.mode === 'bot') continue;
        if (onShip(c) && c.y > D - 0.2 && c.y < D + 1.5){ p.v.z += Math.sin(roll)*9.81*dt*0.6; if (Math.abs(roll) > 0.03) p.asleep = false; }
        if (p.name === 'mine' || p.noLoad > clock || cannons.some(k => k.p === p)) continue;
        for (const k of cannons) if (!k.p && c.distanceTo(k.load) < 0.3 + p.r*0.5){ claim(p); k.p = p; k.fuse = 1.2; fuseS(); const b = p.bot; if (b && !b.dead && R() < 0.7) say(b, pick(['wait what','not the cannon','FIRE IN THE HOLE'])); break; }
      }
    }};
}
