/* Hero steam wand: a stainless wand enters from the left and purges steam
   behind the headline. Canvas only, no libraries. Pauses off-screen and
   shows a still frame for people who prefer reduced motion. */
(function () {
  var hero = document.querySelector('.hero');
  var cv = document.getElementById('steam');
  if (!hero || !cv || !cv.getContext) return;
  var ctx = cv.getContext('2d');
  var still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var W = 0, H = 0, dpr = 1, wand = null, parts = [], t0 = performance.now(), last = t0;
  var running = false, raf = 0, visible = true;

  /* soft steam puff, pre-rendered once */
  var puff = document.createElement('canvas');
  puff.width = puff.height = 128;
  (function () {
    var g = puff.getContext('2d'), r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(255,237,215,1)');
    r.addColorStop(0.35, 'rgba(255,237,215,.55)');
    r.addColorStop(0.7, 'rgba(255,237,215,.14)');
    r.addColorStop(1, 'rgba(255,237,215,0)');
    g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  })();

  function layout() {
    var r = hero.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    W = r.width; H = r.height;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    var h1 = hero.querySelector('h1').getBoundingClientRect();
    var label = hero.querySelector('.label').getBoundingClientRect();
    var top = r.top;
    var roomy = h1.left > 170;               /* desktop: wand sits in the left margin */
    var s = roomy ? Math.min(1, W / 1440 + 0.15) : Math.max(0.55, W / 700);
    var tipX = roomy ? h1.left - 20 * s : Math.min(W * 0.3, 112);
    var tipY = roomy ? h1.top - top + h1.height * 0.12 : label.top - top - 34;
    wand = { x: tipX, y: tipY, s: s, ang: roomy ? 0.62 : 0.7, m: roomy ? 1 : 0.55 };
  }

  /* chrome: dark edges, a hard white highlight and a softer second reflection */
  var CHROME = [[0, '#1a110b'], [0.12, '#5c4f44'], [0.26, '#fffaf2'], [0.34, '#f2e8dc'], [0.5, '#8a7d70'],
                [0.66, '#2c2119'], [0.8, '#b9ad9f'], [0.9, '#4a3d32'], [1, '#120b06']];
  function chrome(r) {
    var g = ctx.createLinearGradient(0, -r, 0, r);
    for (var i = 0; i < CHROME.length; i++) g.addColorStop(CHROME[i][0], CHROME[i][1]);
    return g;
  }
  function drawWand() {
    var w = wand, s = w.s;
    var r = 12 * s, R = 17 * s, tipLen = 52 * s;   /* tube radius, bulb radius, bulb length */
    ctx.save(); ctx.translate(w.x, w.y); ctx.rotate(w.ang);
    /* tube: from the bulb back off-screen */
    ctx.fillStyle = chrome(r);
    ctx.fillRect(-3000, -r, 3000 - tipLen + 4 * s, 2 * r);
    /* bulb: short neck flaring into a rounded dome */
    ctx.fillStyle = chrome(R);
    ctx.beginPath();
    ctx.moveTo(-tipLen, -r);
    ctx.bezierCurveTo(-tipLen + 10 * s, -r, -tipLen + 14 * s, -R, -tipLen + 24 * s, -R);
    ctx.lineTo(-R, -R);
    ctx.arc(-R, 0, R, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(-tipLen + 24 * s, R);
    ctx.bezierCurveTo(-tipLen + 14 * s, R, -tipLen + 10 * s, r, -tipLen, r);
    ctx.closePath(); ctx.fill();
    /* specular glint on the dome */
    var gl = ctx.createRadialGradient(-R * 0.55, -R * 0.45, 0, -R * 0.55, -R * 0.45, R * 0.9);
    gl.addColorStop(0, 'rgba(255,250,242,.95)'); gl.addColorStop(0.35, 'rgba(255,250,242,.25)'); gl.addColorStop(1, 'rgba(255,250,242,0)');
    ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(-R, 0, R, -Math.PI / 2, Math.PI / 2); ctx.lineTo(-R, -R); ctx.fill();
    /* faint ember rim light along the underside */
    ctx.strokeStyle = 'rgba(220,80,0,.25)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-3000, r - 0.5); ctx.lineTo(-tipLen, r - 0.5); ctx.stroke();
    ctx.restore();
  }

  /* flow: a strong purge on load that settles into a gentle stream, with slow breathing */
  function flow(t) {
    var purge = Math.max(0, 1 - t / 2.2);
    return 0.55 + 0.2 * Math.sin(t * 0.9) + 1.8 * purge * purge;
  }
  function emit(dt, t) {
    var n = flow(t) * 140 * dt * (W < 700 ? 0.75 : 1);
    var s = wand.s, ca = Math.cos(wand.ang), sa = Math.sin(wand.ang);
    while (n > 0) {
      if (Math.random() > n) break;
      n -= 1;
      var sp = (700 + Math.random() * 500) * s * wand.m * (0.7 + 0.5 * Math.min(1, flow(t)));
      var spread = (Math.random() - 0.5) * 0.4 - 0.45;
      parts.push({
        x: wand.x + ca * 1, y: wand.y + sa * 1,
        vx: sp * Math.cos(wand.ang + spread), vy: sp * Math.sin(wand.ang + spread),
        r: (5 + Math.random() * 5) * s, g: (22 + Math.random() * 38) * s,
        a: 0, life: 0, max: 2.2 + Math.random() * 2.6, seed: Math.random() * 100
      });
    }
    if (parts.length > 520) parts.splice(0, parts.length - 520);
  }
  function step(dt, t) {
    emit(dt, t);
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.life += dt;
      if (p.life > p.max || p.x - p.r > W + 40) { parts.splice(i, 1); continue; }
      var drag = Math.pow(0.32, dt);
      p.vx *= drag; p.vy *= drag;
      p.vy -= 55 * dt;                                   /* steam rises */
      p.vx += Math.sin(p.seed + t * 1.3 + p.y * 0.015) * 70 * dt;
      p.vy += Math.cos(p.seed * 1.7 + t * 1.1 + p.x * 0.012) * 60 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.r = Math.min(p.r + p.g * dt, 85 * wand.s);
      var k = p.life / p.max;
      p.a = Math.min(1, 0.35 + p.life * 14) * (1 - k) * (1 - k);
    }
  }
  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'screen';
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i], sp = Math.hypot(p.vx, p.vy), st = 1 + Math.min(2.2, sp / 260);
      ctx.globalAlpha = p.a * (wand.m < 1 ? 0.16 : 0.11);
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(p.vy, p.vx));
      ctx.drawImage(puff, -p.r * st, -p.r, p.r * 2 * st, p.r * 2);
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    drawWand();
  }
  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    step(dt, (now - t0) / 1000);
    draw();
    raf = running ? requestAnimationFrame(frame) : 0;
  }
  function start() { if (running || still) return; running = true; last = performance.now(); raf = requestAnimationFrame(frame); }
  function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }

  function fade() {
    var k = Math.min(1, window.scrollY / (H * 0.75 || 1));
    cv.style.opacity = String(1 - k);
    if (k >= 1) stop(); else if (visible && !document.hidden) start();
  }

  layout();
  if (still) {                       /* reduced motion: one settled frame */
    for (var i = 0; i < 240; i++) step(1 / 60, 4 + i / 60);
    draw();
  } else {
    start();
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (e) { visible = e[0].isIntersecting; visible ? fade() : stop(); }).observe(hero);
    }
    document.addEventListener('visibilitychange', function () { document.hidden ? stop() : fade(); });
    window.addEventListener('scroll', fade, { passive: true });
  }
  var rt;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () { parts = []; layout(); if (still) { for (var i = 0; i < 240; i++) step(1 / 60, 4 + i / 60); } draw(); }, 150);
  });
})();
