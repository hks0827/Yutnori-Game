// ===== YUT 3D ANIMATION (Three.js + Custom Physics) =====

const YUT3D = (() => {
  // ── 상수 ──
  const TRAY_W = 5.6, TRAY_D = 4.2, TRAY_FLOOR_T = 0.14;
  const RIM_H = 0.38, RIM_T = 0.16;
  const STICK_L = 2.7, STICK_W = 0.36, STICK_T = 0.17;  // L=길이, W=너비, T=두께

  const GRAVITY    = -14;
  const BOUNCE     = 0.30;
  const FRICTION   = 0.84;
  const ANG_DAMP   = 0.88;
  const KICK_INT   = 0.11;  // 흔들기 impulse 간격(초)

  // ── Three.js 객체 ──
  let renderer = null, scene = null, camera = null, animId = null;
  let trayGroup = null;

  // ── 스틱 배열 ──
  // sticks[i] = { mesh, isSpecial }
  // phys[i]   = { pos(Vec3), vel(Vec3), quat(Quat), angVel(Vec3), settled, isSpecial }
  let sticks = [], phys = [];

  // ── 상태 ──
  let trayY = 0, prevTrayY = 0, trayVelY = 0;
  let isHolding = false, holdTime = 0;
  let released = false, settleTimer = 0, finalized = false;
  let kickTimer = 0;
  let resultCb = null;
  let lastTs = 0;
  let inited = false;

  // ─────────────────────────────────────────────
  //  Public API
  // ─────────────────────────────────────────────

  function show(callback) {
    resultCb  = callback;
    released  = false;
    finalized = false;
    isHolding = false;
    holdTime  = 0;
    settleTimer = 0;
    kickTimer   = 0;
    trayY = prevTrayY = trayVelY = 0;

    document.getElementById('yut3d-overlay').classList.remove('hidden');
    document.getElementById('yut3d-continue').classList.add('hidden');

    if (!inited) { initScene(); inited = true; }

    resetPhys();
    updateHint('꾹 눌러서 윷을 흔드세요');

    if (animId) cancelAnimationFrame(animId);
    lastTs = performance.now();
    animId = requestAnimationFrame(loop);
  }

  function hide() {
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    document.getElementById('yut3d-overlay').classList.add('hidden');
  }

  // ─────────────────────────────────────────────
  //  Scene 초기화
  // ─────────────────────────────────────────────

  function initScene() {
    const canvas = document.getElementById('yut3d-canvas');

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c0806);

    // 카메라: 위에서 비스듬히 내려다보기
    camera = new THREE.PerspectiveCamera(44, 1, 0.1, 80);
    camera.position.set(0, 8.0, 6.5);
    camera.lookAt(0, 0, -0.4);

    // 조명
    scene.add(new THREE.AmbientLight(0xfff3d0, 0.6));

    const sun = new THREE.DirectionalLight(0xfffae8, 1.6);
    sun.position.set(4, 11, 7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far  = 30;
    sun.shadow.camera.left = sun.shadow.camera.bottom = -7;
    sun.shadow.camera.right = sun.shadow.camera.top  =  7;
    scene.add(sun);

    const fill = new THREE.DirectionalLight(0xa0c0ff, 0.4);
    fill.position.set(-4, 6, -4);
    scene.add(fill);

    // 판(tray)
    trayGroup = new THREE.Group();
    scene.add(trayGroup);
    buildTray();

    // 윷 막대기
    buildSticks();

    // 이벤트
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const ov = document.getElementById('yut3d-overlay');
    ov.addEventListener('mousedown',  onHoldStart);
    ov.addEventListener('mouseup',    onHoldEnd);
    ov.addEventListener('mouseleave', onHoldEnd);
    ov.addEventListener('touchstart', onHoldStart, { passive: true });
    ov.addEventListener('touchend',   onHoldEnd);
    ov.addEventListener('touchcancel',onHoldEnd);
  }

  function buildTray() {
    const floorMat = new THREE.MeshLambertMaterial({ color: 0x5e3a0e });
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(TRAY_W, TRAY_FLOOR_T, TRAY_D),
      floorMat
    );
    floor.receiveShadow = true;
    floor.position.y = -TRAY_FLOOR_T / 2;
    trayGroup.add(floor);

    // 테두리 4면
    const rimMat = new THREE.MeshLambertMaterial({ color: 0x3d2408 });
    [
      [TRAY_W + RIM_T*2, RIM_H, RIM_T,  0,           RIM_H/2,  TRAY_D/2 + RIM_T/2 ],
      [TRAY_W + RIM_T*2, RIM_H, RIM_T,  0,           RIM_H/2, -TRAY_D/2 - RIM_T/2 ],
      [RIM_T, RIM_H, TRAY_D,             TRAY_W/2 + RIM_T/2, RIM_H/2, 0 ],
      [RIM_T, RIM_H, TRAY_D,            -TRAY_W/2 - RIM_T/2, RIM_H/2, 0 ],
    ].forEach(([w, h, d, x, y, z]) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), rimMat);
      m.position.set(x, y, z);
      trayGroup.add(m);
    });
  }

  // Canvas 텍스처로 X 마크 3개 생성 (이미지 파일 없음)
  function makeXTexture(bg, xColor) {
    const W = 64, H = 256;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = xColor;
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    [0.22, 0.50, 0.78].forEach(t => {
      const cx = W / 2, cy = H * t, s = 11;
      ctx.beginPath();
      ctx.moveTo(cx - s, cy - s); ctx.lineTo(cx + s, cy + s);
      ctx.moveTo(cx + s, cy - s); ctx.lineTo(cx - s, cy + s);
      ctx.stroke();
    });

    return new THREE.CanvasTexture(cv);
  }

  function buildSticks() {
    sticks.forEach(s => scene.remove(s.mesh));
    sticks = [];

    for (let i = 0; i < 4; i++) {
      const isSpecial = (i === 0); // 첫 번째 막대 = 빽도 막대 (빨간 X)

      // BoxGeometry 면 순서: +X, -X, +Y(위끝), -Y(아래끝), +Z(앞면=X마크), -Z(뒷면=밝음)
      const sideMat  = new THREE.MeshLambertMaterial({ color: 0x7a4820 });
      const capMat   = new THREE.MeshLambertMaterial({ color: 0x5c3210 });
      const frontMat = new THREE.MeshLambertMaterial({
        map: makeXTexture(
          isSpecial ? '#5c0808' : '#1c0a04',
          isSpecial ? '#ff8080' : '#c89040'
        )
      });
      const backMat  = new THREE.MeshLambertMaterial({ color: 0xe8c870 });

      // 면 순서: right, left, top, bottom, front(+Z), back(-Z)
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(STICK_W, STICK_L, STICK_T),
        [sideMat, sideMat, capMat, capMat, frontMat, backMat]
      );
      mesh.castShadow = true;
      scene.add(mesh);
      sticks.push({ mesh, isSpecial });
    }
  }

  // ─────────────────────────────────────────────
  //  물리 초기화
  // ─────────────────────────────────────────────

  function resetPhys() {
    phys = sticks.map((s, i) => {
      const x = (i - 1.5) * 0.78;
      const z = (Math.random() - 0.5) * 1.4;

      // 막대기를 판 위에 눕히기: 긴 축(local Y) → world Z 방향으로 회전
      // rotateX(-90°)하면: local Y → world -Z, local Z → world Y
      const e = new THREE.Euler(
        -Math.PI / 2,                         // 눕히기
        (Math.random() - 0.5) * 0.5,          // 수평 방향 약간 랜덤
        Math.random() < 0.5 ? 0 : Math.PI,   // 앞/뒷면 랜덤
        'XYZ'
      );
      const quat = new THREE.Quaternion().setFromEuler(e);
      // 눕혔을 때 두께(T) 절반이 바닥 위
      const pos = new THREE.Vector3(x, STICK_T / 2, z);

      s.mesh.position.copy(pos);
      s.mesh.quaternion.copy(quat);

      return {
        mesh: s.mesh,
        pos: pos.clone(),
        vel: new THREE.Vector3(),
        quat: quat.clone(),
        angVel: new THREE.Vector3(),
        settled: false,
        isSpecial: s.isSpecial,
      };
    });
  }

  // ─────────────────────────────────────────────
  //  이벤트 핸들러
  // ─────────────────────────────────────────────

  function onHoldStart() {
    if (released || finalized) return;
    isHolding = true;
    updateHint('흔드는 중... 손을 떼면 던집니다!');
  }

  function onHoldEnd() {
    if (!isHolding || released || finalized) return;
    isHolding = false;
    released  = true;
    updateHint('날아가는 중...');

    // 손을 뗄 때 강한 위쪽 impulse
    phys.forEach(s => {
      s.vel.x  += (Math.random() - 0.5) * 4;
      s.vel.y  += 9 + Math.random() * 4.5;
      s.vel.z  += (Math.random() - 0.5) * 3;
      s.angVel.x += (Math.random() - 0.5) * 16;
      s.angVel.y += (Math.random() - 0.5) * 8;
      s.angVel.z += (Math.random() - 0.5) * 12;
    });
  }

  // ─────────────────────────────────────────────
  //  메인 루프
  // ─────────────────────────────────────────────

  function loop(ts) {
    animId = requestAnimationFrame(loop);
    const dt = Math.min((ts - lastTs) / 1000, 0.05);
    lastTs = ts;
    update(dt);
    resizeCanvas();
    renderer.render(scene, camera);
  }

  function update(dt) {
    // ── 판 흔들기 ──
    if (isHolding) {
      holdTime += dt;
      const amp  = Math.min(holdTime * 0.45, 0.65);
      const freq = 5.5 + holdTime * 1.5;
      prevTrayY = trayY;
      trayY     = amp * Math.sin(holdTime * freq);
    } else {
      prevTrayY = trayY;
      trayY    *= 0.85;
    }
    trayVelY = (trayY - prevTrayY) / Math.max(dt, 0.001);
    trayGroup.position.y = trayY;

    const floorY = trayY; // tray 바닥 윗면 = trayY

    // ── 흔드는 동안 랜덤 충격 ──
    if (isHolding) {
      kickTimer += dt;
      if (kickTimer >= KICK_INT) {
        kickTimer = 0;
        phys.forEach(s => {
          s.vel.x  += (Math.random() - 0.5) * 2.5;
          s.vel.z  += (Math.random() - 0.5) * 1.8;
          s.vel.y  += Math.random() * 1.6;
          s.angVel.x += (Math.random() - 0.5) * 9;
          s.angVel.z += (Math.random() - 0.5) * 7;
        });
      }
    }

    // ── 각 막대기 물리 ──
    phys.forEach(s => {
      if (s.settled) return;

      // 중력
      s.vel.y += GRAVITY * dt;

      // 회전: angVel → quaternion 적분
      const aMag = s.angVel.length();
      if (aMag > 0.001) {
        const axis = s.angVel.clone().normalize();
        const dq   = new THREE.Quaternion().setFromAxisAngle(axis, aMag * dt);
        s.quat.multiply(dq).normalize();
      }

      // 위치 적분
      s.pos.addScaledVector(s.vel, dt);

      // ── 바닥 충돌 ──
      const minY = stickMinY(s.pos, s.quat);
      if (minY < floorY) {
        s.pos.y += floorY - minY;
        if (s.vel.y < 0) {
          s.vel.y = Math.abs(s.vel.y) * BOUNCE;
          // 판이 올라올 때 막대기를 함께 밀어올리기
          if (trayVelY > 0) s.vel.y = Math.max(s.vel.y, trayVelY * 1.4);
        }
        s.vel.x  *= FRICTION;
        s.vel.z  *= FRICTION;
        s.angVel.multiplyScalar(ANG_DAMP);
      }

      // ── 벽 충돌 ──
      const limX = TRAY_W / 2 - 0.18;
      const limZ = TRAY_D / 2 - 0.18;
      if (Math.abs(s.pos.x) > limX) { s.vel.x *= -0.4; s.pos.x = Math.sign(s.pos.x) * limX; }
      if (Math.abs(s.pos.z) > limZ) { s.vel.z *= -0.4; s.pos.z = Math.sign(s.pos.z) * limZ; }

      // Mesh 동기화
      s.mesh.position.copy(s.pos);
      s.mesh.quaternion.copy(s.quat);
    });

    // ── 안정화 감지 (release 후) ──
    if (released && !finalized) {
      settleTimer += dt;
      if (settleTimer > 1.2) checkSettle(floorY);
      if (settleTimer > 12)  doFinalize(); // 최대 대기 12초
    }
  }

  // 막대기의 8개 꼭짓점 중 최소 Y 반환
  function stickMinY(pos, quat) {
    const h = [STICK_W / 2, STICK_L / 2, STICK_T / 2];
    let min = Infinity;
    for (const dx of [-1, 1]) for (const dy of [-1, 1]) for (const dz of [-1, 1]) {
      const v = new THREE.Vector3(dx * h[0], dy * h[1], dz * h[2]).applyQuaternion(quat);
      min = Math.min(min, pos.y + v.y);
    }
    return min;
  }

  function checkSettle(floorY) {
    let allGood = true;
    phys.forEach(s => {
      if (s.settled) return;
      const speed    = s.vel.length();
      const angSpeed = s.angVel.length();
      const minY     = stickMinY(s.pos, s.quat);
      const onFloor  = Math.abs(minY - floorY) < 0.06;
      if (speed < 0.09 && angSpeed < 0.13 && onFloor) {
        s.settled = true;
      } else {
        allGood = false;
      }
    });
    if (allGood) doFinalize();
  }

  // ─────────────────────────────────────────────
  //  결과 결정
  // ─────────────────────────────────────────────

  function doFinalize() {
    if (finalized) return;
    finalized = true;

    // 앞면(+Z local axis) 이 위를 향하면 0(앞), 아래면 1(뒤)
    const results = phys.map(s => {
      const frontDir = new THREE.Vector3(0, 0, 1).applyQuaternion(s.quat);
      return frontDir.y > 0 ? 0 : 1;
    });

    const backs = results.reduce((a, b) => a + b, 0);

    let name, steps;
    if      (backs === 0) { name = '모';   steps = 5; }
    else if (backs === 1) {
      // 빽도 막대(index 0)가 뒤를 보이면 빽도
      name  = results[0] === 1 ? '빽도' : '도';
      steps = results[0] === 1 ? -1     : 1;
    }
    else if (backs === 2) { name = '개';   steps = 2; }
    else if (backs === 3) { name = '걸';   steps = 3; }
    else                  { name = '윷';   steps = 4; }

    const roll = { name, steps, sticks: results };

    showResult(roll);
  }

  function showResult(roll) {
    const label = roll.steps < 0
      ? `${roll.name} (1칸 후진)`
      : `${roll.name} (${roll.steps}칸)`;
    updateHint(label);

    const btn = document.getElementById('yut3d-continue');
    btn.classList.remove('hidden');

    let done = false;
    const proceed = () => {
      if (done) return;
      done = true;
      btn.classList.add('hidden');
      hide();
      if (resultCb) resultCb(roll);
    };

    btn.onclick = proceed;
    setTimeout(proceed, 2800); // 2.8초 후 자동 진행
  }

  // ─────────────────────────────────────────────
  //  유틸
  // ─────────────────────────────────────────────

  function updateHint(text) {
    const el = document.getElementById('yut3d-hint');
    if (el) el.textContent = text;
  }

  function resizeCanvas() {
    if (!renderer) return;
    const canvas = renderer.domElement;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== w || canvas.height !== h) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  }

  return { show, hide };
})();
