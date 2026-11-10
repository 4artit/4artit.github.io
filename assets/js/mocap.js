/*
 * 랜딩 히어로의 "모캡 뷰포트" — 걷는 스켈레톤을 턴테이블처럼 돌려가며 그립니다.
 * 17개 관절, 손목/발목 모션 트레일, 바닥 그리드. 의존성 없음.
 */
(function () {
  var canvas = document.getElementById('mocap');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var tcEl = document.getElementById('timecode');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var W = 0, H = 0, DPR = 1;
  function resize() {
    var r = canvas.getBoundingClientRect();
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  var colors = {};
  function readColors() {
    var cs = getComputedStyle(document.documentElement);
    colors.accent = cs.getPropertyValue('--accent').trim() || '#c6f432';
    colors.text = cs.getPropertyValue('--text').trim() || '#e8e8ea';
    colors.muted = cs.getPropertyValue('--muted').trim() || '#8b8f98';
    colors.line = cs.getPropertyValue('--border').trim() || '#24262c';
  }
  new MutationObserver(readColors).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  // ── 포즈 (월드 좌표, 단위 ≈ m, y가 위) ─────────────
  function legChain(hx, hy, phase) {
    var th = 0.42 * Math.sin(phase);                       // 허벅지 각도
    var c = Math.max(0, Math.cos(phase));
    var k = 0.08 + 0.7 * c * c;                            // 스윙 중 무릎 굽힘
    var knee = [hx, hy - 0.45 * Math.cos(th), 0.45 * Math.sin(th)];
    var a = th - k;
    var ankle = [hx, knee[1] - 0.43 * Math.cos(a), knee[2] + 0.43 * Math.sin(a)];
    var toe = [hx, ankle[1] - 0.04, ankle[2] + 0.13];
    return [knee, ankle, toe];
  }
  function armChain(sx, sy, phase) {
    var al = -0.38 * Math.sin(phase);
    var elbow = [sx * 1.05, sy - 0.28 * Math.cos(al), 0.28 * Math.sin(al)];
    var b = al + 0.35 + 0.15 * Math.max(0, -Math.sin(phase));
    var wrist = [sx * 1.05, elbow[1] - 0.25 * Math.cos(b), elbow[2] + 0.25 * Math.sin(b)];
    return [elbow, wrist];
  }
  function pose(t) {
    var ph = t * Math.PI * 2 * 0.85;
    var hy = 0.93 + 0.022 * Math.cos(2 * ph);
    var J = {};
    J.pelvis = [0, hy, 0];
    J.lhip = [-0.1, hy, 0];  J.rhip = [0.1, hy, 0];
    var L = legChain(-0.1, hy, ph), R = legChain(0.1, hy, ph + Math.PI);
    J.lknee = L[0]; J.lankle = L[1]; J.ltoe = L[2];
    J.rknee = R[0]; J.rankle = R[1]; J.rtoe = R[2];
    J.neck = [0, hy + 0.52, 0.03];
    J.head = [0, hy + 0.68, 0.05];
    J.lsh = [-0.19, hy + 0.47, 0.01]; J.rsh = [0.19, hy + 0.47, 0.01];
    var LA = armChain(-0.19, hy + 0.47, ph + Math.PI), RA = armChain(0.19, hy + 0.47, ph);
    J.lel = LA[0]; J.lwr = LA[1]; J.rel = RA[0]; J.rwr = RA[1];
    return J;
  }
  var BONES = [
    ['pelvis', 'neck'], ['neck', 'head'],
    ['pelvis', 'lhip'], ['pelvis', 'rhip'],
    ['lhip', 'lknee'], ['lknee', 'lankle'], ['lankle', 'ltoe'],
    ['rhip', 'rknee'], ['rknee', 'rankle'], ['rankle', 'rtoe'],
    ['neck', 'lsh'], ['neck', 'rsh'],
    ['lsh', 'lel'], ['lel', 'lwr'], ['rsh', 'rel'], ['rel', 'rwr']
  ];
  var TRAILS = ['lwr', 'rwr', 'lankle', 'rankle'];
  var LABELS = { head: 'HEAD', rwr: 'R_WRIST', lankle: 'L_ANKLE' };
  var trail = {}; TRAILS.forEach(function (k) { trail[k] = []; });

  // ── 카메라 ───────────────────────────────────────
  var PITCH = 0.2, DIST = 3.4;
  function project(p, yaw) {
    var cy = Math.cos(yaw), sy = Math.sin(yaw);
    var x = p[0] * cy + p[2] * sy;
    var z = -p[0] * sy + p[2] * cy;
    var y = p[1] - 0.85;
    var cp = Math.cos(PITCH), sp = Math.sin(PITCH);
    var y2 = y * cp - z * sp, z2 = y * sp + z * cp;
    var f = Math.min(W, H) * 1.3;
    var s = f / (DIST - z2);
    return { x: W / 2 + x * s, y: H * 0.5 - y2 * s, z: z2 };
  }

  function draw(t) {
    ctx.clearRect(0, 0, W, H);
    var yaw = 0.9 + t * 0.32;

    // 바닥 그리드
    ctx.lineWidth = 1;
    ctx.strokeStyle = colors.line;
    for (var i = -4; i <= 4; i++) {
      var g = i * 0.25;
      line(project([g, 0, -1], yaw), project([g, 0, 1], yaw));
      line(project([-1, 0, g], yaw), project([1, 0, g], yaw));
    }

    var J = pose(t), P = {};
    for (var k in J) P[k] = project(J[k], yaw);

    // 모션 트레일
    TRAILS.forEach(function (k) {
      var tr = trail[k];
      var last = tr[tr.length - 1];
      if (last && t - last.t > 0.1) tr.length = 0;      // 프레임이 끊기면 트레일 리셋
      tr.push({ x: P[k].x, y: P[k].y, t: t });
      while (tr.length && t - tr[0].t > 0.45) tr.shift();
      for (var i = 1; i < tr.length; i++) {
        ctx.globalAlpha = (i / tr.length) * 0.5;
        ctx.strokeStyle = colors.accent;
        ctx.lineWidth = 1.5;
        line(tr[i - 1], tr[i]);
      }
    });
    ctx.globalAlpha = 1;

    // 뼈대 (먼 쪽은 흐리게)
    BONES.forEach(function (b) {
      var a = P[b[0]], c = P[b[1]];
      var depth = (a.z + c.z) / 2;
      ctx.globalAlpha = 0.45 + 0.45 * clamp((depth + 0.3) / 0.6);
      ctx.strokeStyle = colors.text;
      ctx.lineWidth = 2;
      line(a, c);
    });
    ctx.globalAlpha = 1;

    // 관절 마커
    for (var j in P) {
      var p = P[j], r = j === 'head' ? 7 : 3.2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      if (j === 'head') { ctx.strokeStyle = colors.accent; ctx.lineWidth = 2; ctx.stroke(); }
      else { ctx.fillStyle = colors.accent; ctx.fill(); }
    }

    // 라벨
    ctx.font = '500 10px "JetBrains Mono", monospace';
    ctx.fillStyle = colors.muted;
    ctx.strokeStyle = colors.muted;
    ctx.lineWidth = 1;
    for (var n in LABELS) {
      var q = P[n], lx = q.x + 26, ly = q.y - 18;
      ctx.globalAlpha = 0.8;
      line(q, { x: lx - 4, y: ly + 4 });
      ctx.fillText(LABELS[n], lx, ly);
    }
    ctx.globalAlpha = 1;

    if (tcEl) {
      var fr = Math.floor(t * 30);
      tcEl.textContent = [Math.floor(fr / 108000), Math.floor(fr / 1800) % 60, Math.floor(fr / 30) % 60, fr % 30]
        .map(function (v) { return v < 10 ? '0' + v : '' + v; }).join(':');
    }
  }
  function line(a, b) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
  function clamp(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  // ── 루프 (화면 밖/탭 숨김이면 정지) ──────────────
  var visible = true, start = performance.now(), raf = 0;
  function loop(now) {
    draw((now - start) / 1000);
    raf = visible && !document.hidden ? requestAnimationFrame(loop) : 0;
  }
  function kick() { if (!raf && visible && !document.hidden) raf = requestAnimationFrame(loop); }

  readColors();
  resize();
  window.addEventListener('resize', function () { resize(); if (reduce) draw(0.35); });
  if (reduce) { draw(0.35); return; }
  new IntersectionObserver(function (e) { visible = e[0].isIntersecting; kick(); }).observe(canvas);
  document.addEventListener('visibilitychange', kick);
  kick();
})();
