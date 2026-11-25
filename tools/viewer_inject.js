// ===================== MAP VIEWER (desktop) =====================
(function(){
  try { if (renderer.xr) renderer.xr.enabled = false; } catch(e){}
  for (const el of [...document.body.children]) if (el !== renderer.domElement && el.tagName !== 'SCRIPT') el.style.display = 'none';
  Object.assign(renderer.domElement.style, {position:'fixed', left:'0', top:'0', width:'100vw', height:'100vh', display:'block'});
  const cam = new T3.PerspectiveCamera(70, innerWidth/innerHeight, 0.05, 400);
  const fit = () => { renderer.setSize(innerWidth, innerHeight); cam.aspect = innerWidth/innerHeight; cam.updateProjectionMatrix(); };
  addEventListener('resize', fit); fit();
  const ORIG = k => k === 'lobby' ? new V(-20, 0, 0) : new V(0, 0, Math.floor(MAPS[k].spawn.z/100)*100);
  const css = document.createElement('style'); css.textContent = `
    #vui{position:fixed;left:10px;top:10px;z-index:9;background:rgba(15,17,22,.88);color:#e8e8e8;font:13px system-ui,sans-serif;padding:10px 12px;border-radius:8px;width:270px;box-shadow:0 4px 16px rgba(0,0,0,.4)}
    #vui h3{margin:0 0 8px;font-size:15px;color:#ffc84a} #vui select,#vui button{font:13px system-ui;padding:4px 8px;border-radius:5px;border:1px solid #555;background:#262a33;color:#fff;cursor:pointer}
    #vui button{display:inline-block!important;width:auto!important;height:auto!important;margin:0!important;min-width:0!important;min-height:0!important;padding:4px 9px!important;font-weight:500!important;border:1px solid #555!important;background:#262a33!important;color:#fff!important;border-radius:5px!important;font-size:13px!important;line-height:1.3!important;box-shadow:none!important;transform:none!important;position:static!important} #vui select{width:auto;height:auto;margin:0} #vui button:hover{background:#36404f} #vui label{display:block;margin:3px 0;cursor:pointer} .row{display:flex;gap:6px;margin:6px 0;align-items:center;flex-wrap:wrap}
    #pos{font:12px ui-monospace,monospace;color:#9fe0b8;margin-top:6px;line-height:1.5} #help{font-size:11.5px;color:#aab;margin-top:8px;line-height:1.45}
    #pin{font:12px ui-monospace,monospace;color:#ff9a8a;margin-top:4px} #flash{position:fixed;inset:0;background:#fff;opacity:0;pointer-events:none;transition:opacity .25s;z-index:8}
    #xh{position:fixed;left:50%;top:50%;width:14px;height:14px;margin:-7px 0 0 -7px;z-index:7;pointer-events:none;opacity:.6}
    #xh:before,#xh:after{content:'';position:absolute;background:#fff}#xh:before{left:6px;top:0;width:2px;height:14px}#xh:after{top:6px;left:0;height:2px;width:14px}`;
  document.head.appendChild(css);
  const ui = document.createElement('div'); ui.id = 'vui';
  const keys = Object.keys(MAPS).filter(k => MAPS[k].group);
  ui.innerHTML = `<h3>Backrooms Bot Scrap: map viewer</h3>
    <div class="row"><select id="msel">${keys.map(k => `<option value="${k}">${MAPS[k].name}</option>`).join('')}<option value="lobby">LOBBY</option></select><button id="load">Load Map</button></div>
    <label><input type="checkbox" id="cfog" checked> Fog</label>
    <label><input type="checkbox" id="canim" checked> Animate (waves, gears, lava...)</label>
    <label><input type="checkbox" id="ccol"> Show collision boxes</label>
    <label><input type="checkbox" id="cwire"> Wireframe</label>
    <label><input type="checkbox" id="cbright"> Extra light (see dark corners)</label>
    <div class="row"><button id="shot">📷 Screenshot</button><button id="copy">Copy position</button><button id="spawn">Back to spawn</button></div>
    <div id="pos"></div><div id="pin"></div>
    <div id="help"><b>Look:</b> hold left mouse and drag (or click the scene and press L to lock the mouse)<br><b>Move:</b> W A S D &nbsp; <b>Up/Down:</b> E / Q (or Space / C)<br><b>Fast:</b> hold Shift &nbsp; <b>Speed:</b> mouse wheel<br><b>Mark a spot:</b> right-click a surface (shows in screenshots)<br><b>H:</b> hide this panel</div>`;
  document.body.appendChild(ui); const fl = document.createElement('div'); fl.id = 'flash'; document.body.appendChild(fl); const xh = document.createElement('div'); xh.id = 'xh'; document.body.appendChild(xh);
  const $ = id => document.getElementById(id);
  let cur = 'backrooms', yaw = 0, pitch = 0, speed = 4, fogSave = scene.fog, colLines = null, pinM = null, pinTxt = '';
  const keysDown = new Set(); addEventListener('keydown', e => { if (e.target.tagName === 'SELECT') return; keysDown.add(e.code); if (e.code === 'KeyH') ui.style.display = ui.style.display === 'none' ? '' : 'none'; if (e.code === 'KeyL') renderer.domElement.requestPointerLock(); });
  addEventListener('keyup', e => keysDown.delete(e.code)); addEventListener('blur', () => keysDown.clear());
  let drag = false, lx = 0, ly = 0;
  renderer.domElement.addEventListener('mousedown', e => { if (e.button === 0){ drag = true; lx = e.clientX; ly = e.clientY; } });
  addEventListener('mouseup', () => drag = false);
  addEventListener('mousemove', e => { const locked = document.pointerLockElement === renderer.domElement; if (!drag && !locked) return; const dx = locked ? e.movementX : e.clientX - lx, dy = locked ? e.movementY : e.clientY - ly; lx = e.clientX; ly = e.clientY; yaw -= dx*0.0035; pitch = Math.max(-1.55, Math.min(1.55, pitch - dy*0.0035)); });
  renderer.domElement.addEventListener('wheel', e => { speed = Math.max(0.5, Math.min(60, speed*(e.deltaY > 0 ? 0.85 : 1.18))); e.preventDefault(); }, {passive:false});
  renderer.domElement.addEventListener('contextmenu', e => { e.preventDefault();
    const m = new T3.Vector2(e.clientX/innerWidth*2 - 1, -(e.clientY/innerHeight)*2 + 1), rc = new T3.Raycaster(); rc.setFromCamera(m, cam);
    const roots = cur === 'lobby' ? scene.children.filter(o => !Object.values(MAPS).some(M => M.group === o)) : [MAPS[cur].group];
    const hit = rc.intersectObjects(roots, true).find(h => h.object.visible && h.object !== pinM && !(colLines && h.object === colLines));
    if (!hit) return; const L = hit.point.clone().sub(ORIG(cur));
    if (!pinM){ pinM = new T3.Group(); const s = new T3.Mesh(new T3.SphereGeometry(0.08, 12, 8), new T3.MeshBasicMaterial({color:0xff3030, depthTest:false})); s.renderOrder = 999; pinM.add(s);
      const st = new T3.Mesh(new T3.CylinderGeometry(0.012, 0.012, 0.6, 6).translate(0, 0.3, 0), new T3.MeshBasicMaterial({color:0xff3030, depthTest:false})); st.renderOrder = 999; pinM.add(st); scene.add(pinM); }
    pinM.position.copy(hit.point); pinTxt = `marked: x ${L.x.toFixed(2)}  y ${L.y.toFixed(2)}  z ${L.z.toFixed(2)}`; $('pin').textContent = pinTxt; });
  const mats = new Set(); const forMats = (root, fn) => root.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(fn); });
  const setWire = on => { scene.traverse(o => { if (o.material && !(o === colLines)) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if ('wireframe' in m) m.wireframe = on; }); }); };
  const bright = new T3.AmbientLight(0xffffff, 0); scene.add(bright);
  const showCol = on => {
    if (colLines){ scene.remove(colLines); colLines.geometry.dispose(); colLines = null; } if (!on) return;
    const o = ORIG(cur), x0 = cur === 'lobby' ? -40 : -60, x1 = cur === 'lobby' ? 2 : 110, z0 = cur === 'lobby' ? -12 : o.z - 60, z1 = cur === 'lobby' ? 30 : o.z + 104;
    const pts = []; const E = [[0,1],[1,3],[3,2],[2,0],[4,5],[5,7],[7,6],[6,4],[0,4],[1,5],[2,6],[3,7]];
    for (const b of boxes){ const a = b.min, c = b.max; if (c[0] < x0 || a[0] > x1 || c[2] < z0 || a[2] > z1) continue;
      const v = [[a[0],a[1],a[2]],[c[0],a[1],a[2]],[a[0],c[1],a[2]],[c[0],c[1],a[2]],[a[0],a[1],c[2]],[c[0],a[1],c[2]],[a[0],c[1],c[2]],[c[0],c[1],c[2]]];
      for (const [i, j] of E) pts.push(...v[i], ...v[j]); }
    const g = new T3.BufferGeometry(); g.setAttribute('position', new T3.Float32BufferAttribute(pts, 3));
    colLines = new T3.LineSegments(g, new T3.LineBasicMaterial({color:0x30ff70, transparent:true, opacity:0.55, depthTest:true})); colLines.frustumCulled = false; scene.add(colLines); };
  const goSpawn = () => { const p = cur === 'lobby' ? LOBBY_SPAWN : MAPS[cur].spawn; cam.position.set(p.x, p.y + 1.6, p.z); yaw = (cur === 'lobby' ? LOBBY_YAW : MAPS[cur].yaw) || 0; pitch = 0; };
  const load = k => { cur = k;
    if (k === 'lobby'){ for (const M of Object.values(MAPS)) if (M.group) M.group.visible = false; scene.background.setHex(0x9a8a50); if (scene.fog){ scene.fog.color.setHex(0x9a8a50); scene.fog.near = 3; scene.fog.far = 26; } }
    else { try { setMap(k); } catch(e){ console.warn(e); } }
    fogSave = scene.fog; if (!$('cfog').checked) scene.fog = null;
    showCol($('ccol').checked); if ($('cwire').checked) setWire(true); goSpawn(); if (pinM){ scene.remove(pinM); pinM = null; pinTxt = ''; $('pin').textContent = ''; }
    history.replaceState(null, '', '#' + k); };
  $('load').onclick = () => load($('msel').value);
  $('cfog').onchange = e => { scene.fog = e.target.checked ? fogSave : null; };
  $('ccol').onchange = e => showCol(e.target.checked);
  $('cwire').onchange = e => setWire(e.target.checked);
  $('cbright').onchange = e => { bright.intensity = e.target.checked ? 0.9 : 0; };
  $('spawn').onclick = goSpawn;
  const posText = () => { const L = cam.position.clone().sub(ORIG(cur)), dir = new V(0, 0, -1).applyQuaternion(cam.quaternion);
    const comp = ['N','NE','E','SE','S','SW','W','NW'][((Math.round(Math.atan2(dir.x, -dir.z)/(Math.PI/4)) % 8) + 8) % 8];
    return `${(cur === 'lobby' ? 'LOBBY' : MAPS[cur].name)}  |  x ${L.x.toFixed(1)}  y ${L.y.toFixed(1)}  z ${L.z.toFixed(1)}  |  facing ${comp} (yaw ${(yaw*180/Math.PI % 360).toFixed(0)}°, pitch ${(pitch*180/Math.PI).toFixed(0)}°)`; };
  $('copy').onclick = () => { navigator.clipboard && navigator.clipboard.writeText(posText() + (pinTxt ? '  |  ' + pinTxt : '')); $('copy').textContent = 'Copied!'; setTimeout(() => $('copy').textContent = 'Copy position', 1000); };
  let wantShot = false; $('shot').onclick = () => wantShot = true;
  const takeShot = () => {
    const src = renderer.domElement, c = document.createElement('canvas'); c.width = src.width; c.height = src.height; const g = c.getContext('2d'); g.drawImage(src, 0, 0);
    const lines = [posText()].concat(pinTxt ? [pinTxt] : []), fs = Math.max(14, Math.round(c.height/42)); g.font = `bold ${fs}px monospace`;
    const w = Math.max(...lines.map(l => g.measureText(l).width)) + 20; g.fillStyle = 'rgba(0,0,0,.65)'; g.fillRect(0, c.height - lines.length*(fs + 8) - 12, w, lines.length*(fs + 8) + 12);
    lines.forEach((l, i) => { g.fillStyle = i ? '#ff9a8a' : '#9fe0b8'; g.fillText(l, 10, c.height - (lines.length - i - 1)*(fs + 8) - 14); });
    const a = document.createElement('a'); const L = cam.position.clone().sub(ORIG(cur)); a.download = `${cur}_${L.x.toFixed(0)}_${L.y.toFixed(0)}_${L.z.toFixed(0)}.png`; a.href = c.toDataURL('image/png'); a.click();
    fl.style.opacity = 0.6; setTimeout(() => fl.style.opacity = 0, 80); };
  let last = performance.now();
  renderer.setAnimationLoop(() => {
    const now = performance.now(), dt = Math.min(0.05, (now - last)/1000); last = now;
    const fwd = new V(-Math.sin(yaw)*Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw)*Math.cos(pitch)), right = new V(Math.cos(yaw), 0, -Math.sin(yaw)), mv = new V();
    if (keysDown.has('KeyW')) mv.add(fwd); if (keysDown.has('KeyS')) mv.sub(fwd); if (keysDown.has('KeyD')) mv.add(right); if (keysDown.has('KeyA')) mv.sub(right);
    if (keysDown.has('KeyE') || keysDown.has('Space')) mv.y += 1; if (keysDown.has('KeyQ') || keysDown.has('KeyC')) mv.y -= 1;
    if (mv.lengthSq()) cam.position.addScaledVector(mv.normalize(), speed*(keysDown.has('ShiftLeft') || keysDown.has('ShiftRight') ? 4 : 1)*dt);
    cam.quaternion.setFromEuler(new T3.Euler(pitch, yaw, 0, 'YXZ'));
    if ($('canim').checked && cur !== 'lobby' && MAPS[cur].update){ try { clock += dt; MAPS[cur].update(dt, false); } catch(e){} }
    $('pos').textContent = posText() + `  |  speed ${speed.toFixed(1)} m/s`;
    renderer.render(scene, cam);
    if (wantShot){ wantShot = false; takeShot(); }
  });
  const start = (location.hash || '').slice(1); if (start && (MAPS[start] || start === 'lobby')) $('msel').value = start;
  load($('msel').value);
})();
