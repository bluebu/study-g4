// Gina 的世界 —— 把 world.py 算好的那块地画成方块（three.js，vendor/three.min.js）。
// 这个文件**只画、只交互**，不算任何口径：几层、几朵花、哪个时代，全是页面里那份 JSON 给的。
// 做的事：① 按材质把方块合成 InstancedMesh；② 楼是一个个 mesh，点了飞过去、抽屉里出这栋楼的内容；
// ③ 花 / 灯 / 台座 / 画也能点；④ 技能、怎么长两张面板；⑤ 夜晚；⑥ 拖动旋转、捏合缩放、闲着自己慢慢转。
(() => {
  const stage = document.getElementById('stage');
  const dataEl = document.getElementById('world-data');
  if (!stage || !dataEl || typeof THREE === 'undefined') return;
  const D = JSON.parse(dataEl.textContent);
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true }); } catch (e) { document.getElementById('nogl').hidden = false; return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 400);
  const hemi = new THREE.HemisphereLight(0xdfefff, 0x5f8a3a, 0.9);
  const sun = new THREE.DirectionalLight(0xfff2d8, 1.15);
  sun.position.set(40, 60, 25); sun.castShadow = true;
  const small = innerWidth < 700;
  sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 200 });
  sun.shadow.bias = -0.0008;
  scene.add(hemi, sun);

  const box = new THREE.BoxGeometry(1, 1, 1);
  const lam = (c, o) => new THREE.MeshLambertMaterial(Object.assign({ color: c }, o || {}));
  const winLit = lam(0xffffff, { emissive: 0xFFB84D, emissiveIntensity: 0 });
  const lanternMat = lam(0xffffff, { emissive: 0xFF9A2E, emissiveIntensity: 0.2 });
  const MATS = {
    solid: [lam(0xffffff), true], flat: [lam(0xffffff), false], water: [lam(0xffffff, { transparent: true, opacity: 0.92 }), false],
    win: [lam(0xffffff), false], winlit: [winLit, false], lantern: [lanternMat, false],
    ghost: [lam(0xffffff, { transparent: true, opacity: 0.22, depthWrite: false }), false],
  };

  // 一组方块 → 一个 InstancedMesh。返回它，点得到的那几组要拿 instanceId 反查内容
  function instanced(list, mat, shadow) {
    if (!list.length) return null;
    const m = new THREE.InstancedMesh(box, mat, list.length), o = new THREE.Object3D();
    list.forEach((b, i) => { o.position.set(b.x, b.y, b.z); o.scale.set(b.sx, b.sy, b.sz); o.updateMatrix(); m.setMatrixAt(i, o.matrix); m.setColorAt(i, new THREE.Color(b.c)); });
    m.castShadow = m.receiveShadow = !!shadow;
    scene.add(m); return m;
  }
  const groups = {};
  D.boxes.forEach(b => (groups[b.m] = groups[b.m] || []).push(b));
  Object.keys(groups).forEach(k => instanced(groups[k], MATS[k][0], MATS[k][1]));
  const flowersMesh = instanced(D.flowers, lam(0xffffff), true);
  const lanternsMesh = instanced(D.lanterns, lanternMat, false);
  const worksMesh = instanced(D.works, lam(0xffffff), true);
  const buildings = D.buildings.map(b => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.floors, b.d), lam(b.c));
    m.position.set(b.cx, b.floors / 2, b.cz); m.castShadow = m.receiveShadow = true; m.userData = b; scene.add(m); return m;
  });
  const pictures = D.pictures.map(p => {
    const tex = new THREE.TextureLoader().load(p.src);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(p.w, p.h), new THREE.MeshBasicMaterial({ map: tex }));
    m.position.set(p.x, p.y, p.z + 0.01); m.userData = p; scene.add(m); return m;
  });
  // 星：她说得越多越多（数是 JSON 给的），白天几乎看不见，夜里亮
  const starMat = new THREE.PointsMaterial({ color: 0xFFF1B8, size: 0.6, transparent: true, opacity: 0.0 });
  const starGeo = new THREE.BufferGeometry();
  const sp = []; for (let i = 0; i < D.stars; i++) { const a = (i * 2.399) % (Math.PI * 2), r = 60 + (i * 7919 % 50); sp.push(Math.cos(a) * r, 20 + (i * 104729 % 40), Math.sin(a) * r); }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  scene.add(new THREE.Points(starGeo, starMat));

  // ── 夜晚 ──
  const nightEl = document.getElementById('night');
  function applyNight() {
    const night = nightEl.checked;
    scene.background = new THREE.Color(night ? 0x141B2B : 0xDCEBF5);
    scene.fog = new THREE.Fog(night ? 0x141B2B : 0xDCEBF5, 70, 170);
    hemi.intensity = night ? 0.25 : 0.9; sun.intensity = night ? 0.12 : 1.15;
    winLit.emissiveIntensity = night ? 1.2 : 0; lanternMat.emissiveIntensity = night ? 1.6 : 0.2; starMat.opacity = night ? 0.9 : 0;
    document.getElementById('wd3').classList.toggle('night', night);
  }
  nightEl.addEventListener('change', applyNight);
  applyNight();

  // ── 相机：绕着一个点转 ──
  let yaw = 0.8, pitch = 0.62, dist = 62, lastTouch = 0, fly = null;
  const target = new THREE.Vector3(0, 0, 0);
  function placeCamera() {
    camera.position.set(target.x + dist * Math.cos(pitch) * Math.sin(yaw), target.y + dist * Math.sin(pitch), target.z + dist * Math.cos(pitch) * Math.cos(yaw));
    camera.lookAt(target);
  }
  function flyTo(to) { fly = { from: { x: target.x, z: target.z, dist, pitch }, to, t: 0 }; }
  const el = renderer.domElement;
  let drag = null, pinch = null;
  el.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, moved: false }; lastTouch = performance.now(); try { el.setPointerCapture(e.pointerId); } catch (_) {} });
  el.addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true; yaw -= dx * 0.006; pitch = Math.min(1.35, Math.max(0.2, pitch + dy * 0.005)); drag.x = e.clientX; drag.y = e.clientY; lastTouch = performance.now(); });
  el.addEventListener('pointerup', e => { if (drag && !drag.moved) pick(e.clientX, e.clientY); drag = null; });
  el.addEventListener('pointercancel', () => { drag = null; });
  el.addEventListener('wheel', e => { e.preventDefault(); dist = Math.min(140, Math.max(14, dist * (1 + e.deltaY * 0.0012))); lastTouch = performance.now(); }, { passive: false });
  el.addEventListener('touchstart', e => { if (e.touches.length === 2) { drag = null; pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); } }, { passive: true });
  el.addEventListener('touchmove', e => { if (e.touches.length === 2 && pinch) { const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); dist = Math.min(140, Math.max(14, dist * pinch / d)); pinch = d; lastTouch = performance.now(); } }, { passive: true });
  el.addEventListener('touchend', () => { pinch = null; });

  // ── 抽屉 ──
  const drawer = document.getElementById('drawer'), drT = document.getElementById('dr-t'), drB = document.getElementById('dr-b');
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let flyBack = null, mode = '';
  function openDrawer(kind, title, html) { mode = kind; drT.textContent = title; drB.innerHTML = html; drawer.hidden = false; drB.scrollTop = 0; }
  function closeDrawer() { drawer.hidden = true; mode = ''; if (flyBack) { flyTo(flyBack); flyBack = null; } }
  document.getElementById('dr-x').addEventListener('click', closeDrawer);

  function enterBuilding(u) {
    const c = u.content;
    if (!c) { openDrawer('b', u.name, `<p class="muted">她自己的家。时代往后走，家也会大一点。</p>`); return; }
    let html = `<p class="muted">读出声 <b>${c.words.toLocaleString()}</b> 个词 → <b>${c.floors}</b> 层${c.pending ? `（${c.pending} 层待建，全村进下一个时代一起长出来）` : ''} · 再读 <b>${c.next}</b> 个词长一层</p>`;
    if (c.quote) html += `<p class="quote">💬 ${esc(c.quote)}</p>`;
    html += `<h4>每一层 · 读过的 ${c.days.length} 天</h4><ul class="days">` + c.days.map(r => `<li><a href="${esc(r.href)}"><b>${esc(r.d)}</b><span>第 ${esc(r.page)} 页 · ${r.words} 词 · 读对 ${r.acc}% · 每分钟 ${r.wcpm} 词</span></a></li>`).join('') + `</ul>`;
    if (c.sentences.length) html += `<h4>亮着的窗 · 读得好的句子</h4><ul class="hl">` + c.sentences.map(h => `<li>${esc(h)}</li>`).join('') + `</ul>` + (c.n_sentences > c.sentences.length ? `<p class="muted">还有 ${c.n_sentences - c.sentences.length} 句，在每一天细看里</p>` : '');
    if (c.flowers.length || c.buds.length) html += `<h4>楼前的花 · 念对的词 ${c.flowers.length} 个${c.buds.length ? `，花苞 ${c.buds.length} 个` : ''}</h4><div class="chips">` + c.flowers.map(w => `<span>${esc(w)}</span>`).join('') + c.buds.map(w => `<span class="bud">${esc(w)}</span>`).join('') + `</div>`;
    else html += `<p class="muted">这个故事那会儿还没记单词表，所以楼前没有花。</p>`;
    html += c.links.map(l => `<a class="go" href="${esc(l.href)}">${esc(l.text)} ›</a>`).join('');
    openDrawer('b', `${u.key ? u.key + ' · ' : ''}${u.name}`, html);
  }
  function showSkills() {
    const html = `<p class="muted">每一科给她的本事。经验只涨不掉；升到下一级的门槛按她现在的量定，往上永远留着级。</p>` + D.skills.map(sk => {
      let lv = 0; while (lv + 1 < sk.lv.length && sk.xp >= sk.lv[lv + 1]) lv++;
      const lo = sk.lv[lv], hi = sk.lv[lv + 1] != null ? sk.lv[lv + 1] : sk.lv[lv] * 2, pct = Math.min(100, (sk.xp - lo) / (hi - lo) * 100);
      return `<div class="skill" style="--c:${sk.c}"><i>${sk.icon}</i><div><span class="muted">${esc(sk.sub)} · </span><span class="n">${esc(sk.name)}</span></div><span class="lv">Lv.${lv + 1}</span><div class="bar"><b style="width:${pct.toFixed(1)}%"></b></div><div class="how">${sk.xp.toLocaleString()} / ${hi.toLocaleString()} ${esc(sk.unit)} · ${esc(sk.how)}</div></div>`;
    }).join('');
    openDrawer('s', `⚔️ ${D.who} 的技能`, html);
  }
  function showHow() {
    const e = D.era;
    const html = `<p class="muted">现在是<b>${esc(e.name)}</b>时代（${esc(e.words)}）${e.next ? `，再读 <b>${(e.next - e.total).toLocaleString()}</b> 个词进${esc(e.next_name)}` : ''}。这块地上有：</p><ul class="legend">` + D.legend.map(l => `<li><i>${l.i}</i><div><b>${esc(l.n)}</b>${esc(l.s)}</div></li>`).join('') + `</ul><p class="muted">这块地只长 ${esc(D.who)} 自己读过、念过、说过的东西。语文书院、数学的桥先立着牌子，接进来就开始长。</p><a class="go" href="english/">英语 · 每一站细看 ›</a><a class="go ghost" href="english/words.html">遇到的词 ›</a>`;
    openDrawer('h', '❓ 这个世界是怎么长的', html);
  }
  document.getElementById('btn-skills').addEventListener('click', () => (mode === 's' ? closeDrawer() : showSkills()));
  document.getElementById('btn-how').addEventListener('click', () => (mode === 'h' ? closeDrawer() : showHow()));

  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pick(cx, cy) {
    const r = el.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects([...buildings, ...pictures, flowersMesh, lanternsMesh, worksMesh].filter(Boolean), false)[0];
    if (!hit) { if (!drawer.hidden) closeDrawer(); return; }
    lastTouch = performance.now() + 60000;
    const o = hit.object, i = hit.instanceId;
    if (o === flowersMesh) { const f = D.flowers[i]; openDrawer('f', `${f.bud ? '🌱' : '🌸'} ${f.t}`, `<p>${esc(f.d || '')}</p>`); return; }
    if (o === lanternsMesh) { const l = D.lanterns[i]; openDrawer('l', l.t, `<p>${esc(l.d || '')}</p>` + (l.audio ? `<audio controls preload="none" src="${esc(l.audio)}"></audio>` : '')); return; }
    if (o === worksMesh) { const w = D.works[i]; openDrawer('w', w.t, `<p class="muted">${esc(w.d)}</p><a class="go" href="${esc(w.href)}">看这件作品 ›</a>`); return; }
    if (pictures.includes(o)) { const p = o.userData; openDrawer('p', p.t, `<img src="${esc(p.src)}" alt=""><p>${esc(p.d || '')}</p>`); return; }
    const u = o.userData;
    if (!flyBack) flyBack = { x: 0, z: 0, dist, pitch };
    flyTo({ x: u.cx, z: u.cz, dist: Math.max(14, 9 + (u.floors + u.pending) * 0.9), pitch: 0.42 });
    enterBuilding(u);
  }

  // ── 标签：投影到屏幕上 ──
  const labelsEl = document.getElementById('labels');
  const nodes = D.labels.map(a => { const d = document.createElement('div'); d.className = 'lbl ' + a.cls; d.textContent = a.text; labelsEl.appendChild(d); return d; });
  const v = new THREE.Vector3();
  function syncLabels() {
    const r = el.getBoundingClientRect();
    const manyBuildings = D.buildings.length > 14;
    D.labels.forEach((a, i) => {
      v.set(a.x, a.y, a.z).project(camera);
      const hide = v.z > 1 || (a.cls === 'small' && (dist > 78 || (manyBuildings && dist > 40)));
      nodes[i].style.display = hide ? 'none' : '';
      nodes[i].style.left = ((v.x + 1) / 2 * r.width) + 'px';
      nodes[i].style.top = ((1 - v.y) / 2 * r.height) + 'px';
    });
  }

  function resize() { const r = stage.getBoundingClientRect(); renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); }
  addEventListener('resize', resize); resize();

  let last = performance.now();
  function frame(t) {
    const dt = Math.min(0.05, (t - last) / 1000); last = t;
    if (fly) { fly.t = Math.min(1, fly.t + dt / 0.7); const k = 1 - Math.pow(1 - fly.t, 3); target.x = fly.from.x + (fly.to.x - fly.from.x) * k; target.z = fly.from.z + (fly.to.z - fly.from.z) * k; dist = fly.from.dist + (fly.to.dist - fly.from.dist) * k; pitch = fly.from.pitch + (fly.to.pitch - fly.from.pitch) * k; if (fly.t >= 1) fly = null; }
    if (t - lastTouch > 2500 && drawer.hidden) yaw += dt * 0.12;
    placeCamera(); renderer.render(scene, camera); syncLabels();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
