/* Conversing Coffee espresso simulator
   One variable (grind size), fixed 18g dose, double shot, target 36g in 25-30s.
   The shot model is a teaching approximation, not lab data. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var svg = $('machine');
  if (!svg) return;
  var still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- machine profile ---------- */
  var M = {
    name: 'Barista Express',
    min: 0, max: 16, start: 10,
    dose: 18, target: 36, lo: 25, hi: 30,
    chokeBelow: 4,         /* grind 0-3 chokes */
    timeout: 60            /* the machine gives up here */
  };

  /* time and yield for a grind setting: 5 and 6 land in the window,
     coarser runs fast, 4 is slow, 3 and below chokes */
  function model(g) {
    var noise = function (a) { return (Math.random() * 2 - 1) * a; };
    if (g < M.chokeBelow) {
      var drips = [2, 5, 9, 14][g] || 2;
      return { t: M.timeout, y: Math.max(0.8, drips + noise(1)), choke: true };
    }
    /* 6 and 5 sit inside 25-30s, 4 runs slow, coarser than 6 speeds up fast */
    var t = g >= 6 ? 5 + 21 * Math.exp(-0.3 * (g - 6)) : ({ 5: 28.8, 4: 38.5 })[g];
    t += noise(0.45);
    var y = 36 + (g - 5.5) * 0.25 + noise(0.4);
    return { t: t, y: y, choke: false };
  }
  function judge(s) {
    if (s.choke) return { key: 'choke', cls: 'bad', title: 'Choked', taste: 'Barely any coffee came out. What did is harsh, bitter and burnt.' };
    if (s.t < 15) return { key: 'vfast', cls: 'bad', title: 'Way too fast', taste: 'Thin, watery and sour. Probably a bit salty too.' };
    if (s.t < 25) return { key: 'fast', cls: 'warn', title: 'A bit fast', taste: 'Light body with a sharp, sour edge. Getting close.' };
    if (s.t <= 30) return { key: 'ok', cls: 'ok', title: 'Dialled in', taste: 'Sweet, balanced and syrupy. This is the one.' };
    if (s.t <= 45) return { key: 'slow', cls: 'warn', title: 'A bit slow', taste: 'Heavy and a little bitter, with a dry finish.' };
    return { key: 'vslow', cls: 'bad', title: 'Way too slow', taste: 'Bitter, harsh and drying.' };
  }

  /* ---------- elements ---------- */
  var pf = $('pf'), mound = $('mound'), tamped = $('tamped'), liquid = $('liquid');
  var streams = $('streams'), groundsG = $('grounds'), needle = $('needle');
  var crema1 = $('crema1'), crema2 = $('crema2');
  var act = $('act'), note = $('note'), result = $('result');
  var grindNum = $('grindNum'), grindRange = $('grindRange'), mGrind = $('mGrind');
  var mTime = $('mTime'), mYield = $('mYield');
  var rTime = $('rTime'), rYield = $('rYield'), rRatio = $('rRatio');
  var zG = $('zGrinder'), zH = $('zGroup');

  /* portafilter spots (basket centre) */
  var SPOT = { home: [78, 486], grinder: [215, 305], group: [440, 290] };
  var pos = SPOT.home.slice(), rot = 0;

  var state = 'empty';      /* empty -> ground -> locked -> pulling -> done */
  var grind = M.start, shots = [], lastAdvice = null;

  /* ---------- helpers ---------- */
  function setPF(x, y, r) {
    pos = [x, y]; rot = r || 0;
    pf.setAttribute('transform', 'translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ') rotate(' + rot.toFixed(1) + ')');
  }
  function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function tween(ms, fn) {
    return new Promise(function (done) {
      if (still) { fn(1); return done(); }
      var t0 = performance.now();
      (function step(now) {
        var k = Math.min(1, (now - t0) / ms);
        fn(k);
        if (k < 1) requestAnimationFrame(step); else done();
      })(t0);
    });
  }
  function moveTo(spot, ms) {
    var a = pos.slice(), b = SPOT[spot], r0 = rot;
    var lift = spot === 'home' ? 0 : 40;
    return tween(ms || 650, function (k) {
      var e = ease(k);
      var x = a[0] + (b[0] - a[0]) * e, y = a[1] + (b[1] - a[1]) * e - Math.sin(Math.PI * k) * lift;
      setPF(x, y, r0 * (1 - e));
    });
  }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, still ? 0 : ms); }); }

  function setGrind(v) {
    grind = Math.max(M.min, Math.min(M.max, v | 0));
    grindNum.textContent = grind; grindRange.value = grind; mGrind.textContent = grind;
    $('finer').disabled = grind <= M.min || busy();
    $('coarser').disabled = grind >= M.max || busy();
  }
  function busy() { return state !== 'empty'; }
  function lockGrind(lock) {
    grindRange.disabled = lock;
    setGrind(grind);
  }
  function readout(t, y) {
    var tt = t.toFixed(1) + 's', yy = y.toFixed(1) + 'g', rr = '1:' + (y / M.dose).toFixed(1);
    rTime.querySelector('b').textContent = tt; rYield.querySelector('b').textContent = yy; rRatio.querySelector('b').textContent = rr;
    mTime.textContent = tt; mYield.textContent = yy;
  }
  function setStep(btn, msg, enabled) {
    act.textContent = btn; note.textContent = msg; act.disabled = !enabled;
  }
  function zones(which) {
    zG.classList.toggle('show', which === 'grinder');
    zH.classList.toggle('show', which === 'group');
  }

  /* ---------- beans in the hopper ---------- */
  (function fillBeans() {
    var g = $('beans'), html = '';
    for (var i = 0; i < 70; i++) {
      var x = 160 + Math.random() * 100, y = 60 + Math.random() * 50;
      html += '<ellipse cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" rx="5.5" ry="3.8" fill="url(#bean)" transform="rotate(' + (Math.random() * 180).toFixed(0) + ' ' + x.toFixed(1) + ' ' + y.toFixed(1) + ')"/>';
    }
    g.innerHTML = html;
  })();

  /* ---------- steps ---------- */
  function doGrind() {
    if (state !== 'empty') return;
    state = 'grinding'; lockGrind(true); zones(null);
    setStep('Grinding…', 'Grinding 18g at setting ' + grind, false);
    hideResult();
    return moveTo('grinder').then(function () {
      var dur = 2200, spawn;
      if (!still) {
        spawn = setInterval(function () {
          for (var i = 0; i < 3; i++) {
            var c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            var x = 215 + (Math.random() - 0.5) * 10;
            c.setAttribute('cx', x); c.setAttribute('cy', 272); c.setAttribute('r', 0.8 + Math.random() * 1.4 * (grind / 16 + 0.5));
            c.setAttribute('fill', '#4a2a14'); groundsG.appendChild(c);
            (function (c) {
              var t0 = performance.now(), vy = 0, y = 272;
              (function fall(now) {
                var dt = 16; vy += 0.35; y += vy;
                c.setAttribute('cy', y);
                if (y < 300) requestAnimationFrame(fall); else c.remove();
              })(t0);
            })(c);
          }
        }, 30);
        $('beans').style.animation = 'none';
      }
      var hop = $('hopper');
      return tween(dur, function (k) {
        mound.setAttribute('ry', (k * 12).toFixed(1));
        mYield.textContent = (k * M.dose).toFixed(1) + 'g';
        hop.setAttribute('transform', 'translate(' + (Math.sin(k * 120) * 0.8).toFixed(2) + ' 0)');
      }).then(function () {
        clearInterval(spawn); hop.removeAttribute('transform');
        /* tamp: mound becomes a flat puck */
        return tween(350, function (k) {
          mound.setAttribute('ry', (12 * (1 - k)).toFixed(1));
          tamped.setAttribute('height', (k * 10).toFixed(1));
          tamped.setAttribute('y', (-4 + 0).toFixed(1));
        });
      });
    }).then(function () {
      state = 'ground'; zones('group');
      setStep('Lock into group head', 'Step 2 of 3 · Move the portafilter to the machine', true);
    });
  }
  function doLock() {
    if (state !== 'ground') return;
    state = 'locking'; zones(null);
    setStep('Locking in…', '', false);
    return moveTo('group').then(function () {
      return tween(250, function (k) { setPF(SPOT.group[0], SPOT.group[1], -8 * Math.sin(Math.PI * k)); });
    }).then(function () {
      state = 'locked';
      setStep('Double shot', 'Step 3 of 3 · Hit double shot', true);
    });
  }
  function doShot() {
    if (state !== 'locked') return;
    state = 'pulling';
    setStep('Pulling…', 'Watch the time and the scale', false);
    var s = model(grind), j = judge(s);
    /* playback: about 3x real time, long shots compressed so nobody waits a minute */
    var speed = Math.max(3, s.t / 9);
    var preinf = 4;                                   /* seconds before first drips */
    var dur = (s.t / speed) * 1000;
    /* espresso colour by result */
    var cols = { vfast: ['#d9b07a', '#9a6a3c'], fast: ['#cf9a5c', '#8a5226'], ok: ['#c98a4b', '#7a4319'],
                 slow: ['#8f5a2c', '#4a240c'], vslow: ['#6e3f1c', '#36190a'], choke: ['#4a2510', '#2a1206'] }[j.key];
    crema1.setAttribute('stop-color', cols[0]); crema2.setAttribute('stop-color', cols[1]);
    var sw = { vfast: 4.5, fast: 3.6, ok: 3, slow: 2.2, vslow: 1.6, choke: 1 }[j.key];
    ['s1', 's2'].forEach(function (id) {
      var l = $(id); l.setAttribute('stroke-width', sw); l.setAttribute('stroke', cols[1]);
      l.setAttribute('stroke-dasharray', j.key === 'choke' ? '2 9' : j.key === 'vslow' ? '6 4' : 'none');
    });
    return tween(dur, function (k) {
      var t = k * s.t;
      var flowK = s.choke ? Math.pow(k, 1.6) : Math.max(0, (t - preinf) / (s.t - preinf));
      var y = s.y * Math.min(1, flowK);
      readout(t, y);
      needle.setAttribute('transform', 'rotate(' + (-125 + Math.min(1, k * 5) * (s.choke ? 235 : j.key === 'ok' ? 150 : j.key.indexOf('fast') >= 0 || j.key === 'vfast' ? 95 : 190)) + ' 470 160)');
      streams.setAttribute('opacity', (t > preinf || s.choke && t > 10) && k < 0.995 ? 1 : 0);
      var h = Math.min(50, y * 1.15);
      liquid.setAttribute('y', (420 - h).toFixed(1)); liquid.setAttribute('height', h.toFixed(1));
    }).then(function () {
      streams.setAttribute('opacity', 0);
      return tween(500, function (k) { needle.setAttribute('transform', 'rotate(' + (-125 + (1 - k) * 60 * (1 - k)) + ' 470 160)'); });
    }).then(function () {
      readout(s.t, s.y);
      state = 'done';
      shots.push({ g: grind, t: s.t, y: s.y, j: j });
      logShot();
      showResult(s, j);
      setStep('Knock out and go again', 'Change the grind, then pull another shot', true);
    });
  }
  function knockOut() {
    if (state !== 'done') return Promise.resolve();
    state = 'empty';
    tamped.setAttribute('height', 0); mound.setAttribute('ry', 0);
    return moveTo('home', 600).then(function () {
      liquid.setAttribute('height', 0);
      readout(0, 0);
      lockGrind(false); zones('grinder');
      setStep('Grind 18g', 'Step 1 of 3 · Grind your coffee', true);
    });
  }

  /* ---------- coaching ---------- */
  function advice(j) {
    if (j.key === 'ok') return null;
    return (j.key === 'vfast' || j.key === 'fast') ? 'finer' : 'coarser';
  }
  function coachText(s, j) {
    var prev = shots.length > 1 ? shots[shots.length - 2] : null;
    var lines = [];
    if (j.key === 'ok') {
      lines.push('<b>That\'s it.</b> 18g in, ' + s.y.toFixed(1) + 'g out in ' + s.t.toFixed(1) + ' seconds. A 1:' + (s.y / M.dose).toFixed(1) + ' ratio, right in the window.');
      lines.push('On your own machine the number will be different, because your beans are different. The process is exactly the same.');
      return lines.join(' ');
    }
    if (prev && prev.g !== grind) {
      var wentFiner = grind < prev.g, wasFast = prev.j.key === 'fast' || prev.j.key === 'vfast';
      var wasSlow = prev.j.key === 'slow' || prev.j.key === 'vslow' || prev.j.key === 'choke';
      if (wasFast && !wentFiner) lines.push('You went coarser and the shot got even faster.');
      else if (wasSlow && wentFiner) lines.push('You went finer and the shot got even slower.');
      else if (wasFast && (j.key === 'slow' || j.key === 'vslow' || j.key === 'choke')) lines.push('Right direction, but you went too far.');
      else if (wasSlow && (j.key === 'fast' || j.key === 'vfast')) lines.push('Right direction, but you went too far.');
      else lines.push('Right direction. Keep going.');
    }
    if (j.key === 'choke') lines.push('The grind is so fine the water can barely get through. <b>Go coarser: pick a bigger number.</b>');
    else if (advice(j) === 'finer') lines.push('Your shot ran too fast. <b>Go finer: on this grinder, a smaller number means finer.</b> Finer grounds pack tighter, so the water takes longer to get through.');
    else lines.push('Your shot ran too slow. <b>Go coarser: pick a bigger number.</b> Coarser grounds leave more gaps, so the water flows through faster.');
    return lines.join(' ');
  }
  function showResult(s, j) {
    $('verdict').textContent = j.title + ' · ' + s.t.toFixed(1) + 's for ' + s.y.toFixed(1) + 'g';
    $('verdict').className = 'verdict ' + j.cls;
    $('taste').textContent = j.taste;
    $('coach').innerHTML = coachText(s, j);
    var b = $('btns');
    if (j.key === 'ok') {
      b.innerHTML = '<button class="pri" id="bAgain">Try another setting</button><a href="../codes/">Get the gear</a>';
    } else {
      b.innerHTML = '<p class="note" style="text-align:left;margin-bottom:10px;width:100%">Want to change your settings?</p><button class="pri" id="bYes">Yes, change grind</button><button id="bSame">Pull the same again</button>';
    }
    result.classList.add('show');
    var rr = result.getBoundingClientRect();
    if (rr.top < 70 || rr.top > window.innerHeight * 0.6) result.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
    var off = function () { b.querySelectorAll('button').forEach(function (x) { x.disabled = true; }); };
    var go = function () { off(); knockOut().then(function () { pulseGrind(); }); };
    var y = $('bYes') || $('bAgain'); if (y) y.onclick = go;
    var same = $('bSame'); if (same) same.onclick = function () { off(); knockOut(); };
    lastAdvice = advice(j);
  }
  function hideResult() { result.classList.remove('show'); }
  function pulseGrind() {
    var c = $('grindCard'); c.classList.remove('pulse'); void c.offsetWidth; c.classList.add('pulse');
    if (window.innerWidth < 900) c.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'center' });
  }
  function logShot() {
    var s = shots[shots.length - 1];
    var li = document.createElement('li'); li.className = s.j.cls;
    li.innerHTML = '<b>#' + shots.length + ' · Grind ' + s.g + '</b><span>' + s.t.toFixed(1) + 's · ' + s.y.toFixed(1) + 'g</span><i>' + s.j.title + '</i>';
    $('log').appendChild(li);
  }

  /* ---------- main button ---------- */
  act.addEventListener('click', function () {
    if (state === 'empty') doGrind();
    else if (state === 'ground') doLock();
    else if (state === 'locked') doShot();
    else if (state === 'done') knockOut();
  });
  $('dblBtn').addEventListener('click', function () { if (state === 'locked') doShot(); });

  /* ---------- grind controls ---------- */
  $('finer').addEventListener('click', function () { if (!busy()) setGrind(grind - 1); });
  $('coarser').addEventListener('click', function () { if (!busy()) setGrind(grind + 1); });
  grindRange.addEventListener('input', function () { if (!busy()) setGrind(+grindRange.value); else grindRange.value = grind; });

  /* ---------- drag the portafilter ---------- */
  function svgPt(e) {
    var p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
    return p.matrixTransform(svg.getScreenCTM().inverse());
  }
  var drag = null;
  pf.addEventListener('pointerdown', function (e) {
    if (state !== 'empty' && state !== 'ground') return;
    e.preventDefault();
    var p = svgPt(e);
    drag = { dx: pos[0] - p.x, dy: pos[1] - p.y, moved: false, id: e.pointerId };
    pf.setPointerCapture(e.pointerId); pf.classList.add('drag');
    zones(state === 'empty' ? 'grinder' : 'group');
  });
  pf.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var p = svgPt(e);
    var x = Math.max(40, Math.min(560, p.x + drag.dx)), y = Math.max(40, Math.min(470, p.y + drag.dy));
    if (Math.hypot(x - pos[0], y - pos[1]) > 2) drag.moved = true;
    setPF(x, y, 0);
  });
  function endDrag() {
    if (!drag) return;
    var moved = drag.moved; drag = null; pf.classList.remove('drag');
    var target = state === 'empty' ? 'grinder' : 'group';
    var near = Math.hypot(pos[0] - SPOT[target][0], pos[1] - SPOT[target][1]) < 70;
    if (!moved || near) {                               /* a tap, or dropped on target */
      if (state === 'empty') doGrind(); else doLock();
    } else {
      moveTo(state === 'empty' ? 'home' : 'grinder', 400).then(function () { zones(target); });
    }
  }
  pf.addEventListener('pointerup', endDrag);
  pf.addEventListener('pointercancel', endDrag);

  /* ---------- start ---------- */
  setPF(SPOT.home[0], SPOT.home[1], 0);
  setGrind(M.start);
  zones('grinder');
})();
