/* Conversing Coffee espresso simulator
   One variable (grind size), fixed 18g dose, double shot, target 36g in 25-30s.
   The shot model is a teaching approximation, not lab data.
   Crema (the mascot) gives all the feedback. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var svg = $('machine');
  if (!svg) return;
  var still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- machine profile ---------- */
  var M = { min: 0, max: 16, start: 10, dose: 18, target: 36, lo: 25, hi: 30, chokeBelow: 4, timeout: 60 };

  /* 6 and 5 sit inside 25-30s, 4 runs slow, 3 and below chokes, coarser than 6 speeds up fast */
  function model(g) {
    var n = function (a) { return (Math.random() * 2 - 1) * a; };
    if (g < M.chokeBelow) return { t: M.timeout, y: Math.max(0.8, ([2, 5, 9, 14][g] || 2) + n(1)), choke: true };
    var t = (g >= 6 ? 5 + 21 * Math.exp(-0.3 * (g - 6)) : ({ 5: 28.8, 4: 38.5 })[g]) + n(0.45);
    return { t: t, y: 36 + (g - 5.5) * 0.25 + n(0.4), choke: false };
  }
  function judge(s) {
    if (s.choke) return { key: 'choke', cls: 'bad', title: 'Choked', taste: 'Barely any coffee came out. What did is harsh, bitter and burnt.', bar: 13 };
    if (s.t < 15) return { key: 'vfast', cls: 'bad', title: 'Way too fast', taste: 'Thin, watery and sour. Probably a bit salty too.', bar: 4 };
    if (s.t < 25) return { key: 'fast', cls: 'warn', title: 'A bit fast', taste: 'Light body with a sharp, sour edge. Getting close.', bar: 6.5 };
    if (s.t <= 30) return { key: 'ok', cls: 'ok', title: 'Dialled in', taste: 'Sweet, balanced and syrupy. This is the one.', bar: 9 };
    if (s.t <= 45) return { key: 'slow', cls: 'warn', title: 'A bit slow', taste: 'Heavy and a little bitter, with a dry finish.', bar: 10.5 };
    return { key: 'vslow', cls: 'bad', title: 'Way too slow', taste: 'Bitter, harsh and drying.', bar: 11.5 };
  }
  var FAST = { vfast: 1, fast: 1 }, SLOW = { slow: 1, vslow: 1, choke: 1 };

  /* ---------- elements ---------- */
  var pf = $('pf'), pfShadow = $('pfShadow'), mound = $('mound'), tamped = $('tamped'), liquid = $('liquid');
  var streams = $('streams'), s1 = $('s1'), s2 = $('s2'), drips = $('drips'), groundsG = $('grounds'), gStream = $('groundStream');
  var needle = $('needle'), knob = $('grindKnob'), body = $('machineBody'), cupSteam = $('cupSteam'), dblRing = $('dblRing');
  var crema1 = $('crema1'), crema2 = $('crema2');
  var act = $('act'), note = $('note');
  var grindNum = $('grindNum'), grindRange = $('grindRange'), mGrind = $('mGrind');
  var mTime = $('mTime'), mYield = $('mYield'), mDose = $('mDose');
  var rTime = $('rTime'), rYield = $('rYield'), rRatio = $('rRatio');
  var zG = $('zGrinder'), zH = $('zGroup'), zK = $('zKnock'), kbPucks = $('kbPucks'), kbox = $('knockbox'), wandSteam = $('wandSteam');

  /* portafilter spots: basket centre top. Grinder spot rests on the left scale. */
  var SPOT = { home: [52, 434], grinder: [187, 367], group: [400, 325], knock: [616, 386] };
  var TAMPER = { home: [686, 470], over: [187, 336], press: [187, 369] };
  var tamper = $('tamper'), tShadow = $('tShadow'), tpos = TAMPER.home.slice();
  var pos = SPOT.home.slice(), rot = 0;
  var state = 'empty', grind = M.start, shots = [], knobAng = 0;

  /* ---------- Crema ---------- */
  var cremaEl = $('crema'), bubble = $('bubble'), say = $('say'), bbtns = $('bbtns'), cremaBtn = $('cremaBtn');
  var moveTimer = null, tuckTimer = null;
  function crema(text, face, opts) {
    opts = opts || {};
    cremaEl.dataset.face = face || 'smile';
    say.innerHTML = text;
    bbtns.innerHTML = '';
    (opts.buttons || []).forEach(function (b) {
      var el = document.createElement('button');
      el.textContent = b.label; if (b.pri) el.className = 'pri';
      el.onclick = function () { bbtns.querySelectorAll('button').forEach(function (x) { x.disabled = true; }); b.go(); };
      bbtns.appendChild(el);
    });
    bubble.classList.remove('hide', 'pop'); void bubble.offsetWidth; bubble.classList.add('pop');
    clearTimeout(tuckTimer);
    if (!(opts.buttons || []).length && window.innerWidth < 700) tuckTimer = setTimeout(function () { bubble.classList.add('hide'); }, opts.hold || 4500);
    if (opts.move) {
      cremaEl.classList.remove(opts.move); void cremaEl.offsetWidth; cremaEl.classList.add(opts.move);
      clearTimeout(moveTimer); moveTimer = setTimeout(function () { cremaEl.classList.remove(opts.move); }, 2200);
    }
  }
  cremaBtn.addEventListener('click', function () {
    if (bubble.classList.contains('hide')) bubble.classList.remove('hide');
    else if (!bbtns.children.length) bubble.classList.add('hide');
    cremaEl.classList.remove('hop'); void cremaEl.offsetWidth; cremaEl.classList.add('hop');
  });
  var greeted = false;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (e) {
      var vis = e[0].isIntersecting; cremaEl.classList.toggle('on', vis);
      if (vis && !greeted) {
        greeted = true;
        setTimeout(function () {
          crema('<span class="who">Crema</span>Hey, I\'m Crema! Let\'s pull a shot. <b>Drag the portafilter into the grinder cradle</b>, then press <b>GRIND</b>.', 'excited', { move: 'wave' });
        }, 500);
      }
    }, { threshold: 0.25 }).observe(document.querySelector('.sim'));
  } else { cremaEl.classList.add('on'); }

  /* ---------- helpers ---------- */
  function setPF(x, y, r) {
    pos = [x, y]; rot = r || 0;
    pf.setAttribute('transform', 'translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ') rotate(' + rot.toFixed(2) + ')');
  }
  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function back(t) { var c = 1.6; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }
  function tween(ms, fn) {
    return new Promise(function (done) {
      if (still) { fn(1, 0); return done(); }
      var t0 = performance.now();
      (function step(now) { var k = Math.min(1, (now - t0) / ms); fn(k, now); if (k < 1) requestAnimationFrame(step); else done(); })(t0);
    });
  }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, still ? 0 : ms); }); }
  function moveTo(spot, ms) {
    var a = pos.slice(), b = SPOT[spot], r0 = rot, dist = Math.hypot(b[0] - a[0], b[1] - a[1]);
    var lift = Math.min(70, 20 + dist * 0.18), dir = b[0] >= a[0] ? 1 : -1;
    pfShadow.style.opacity = 0;
    return tween(ms || 720, function (k) {
      var e = ease(k);
      var x = a[0] + (b[0] - a[0]) * e, y = a[1] + (b[1] - a[1]) * e - Math.sin(Math.PI * e) * lift;
      setPF(x, y, r0 * (1 - e) - dir * 9 * Math.sin(Math.PI * e));
    }).then(function () { if (spot === 'home') pfShadow.style.opacity = 1; });
  }
  function busy() { return state !== 'empty' && state !== 'docked'; }
  function setGrind(v, animate) {
    grind = Math.max(M.min, Math.min(M.max, v | 0));
    grindNum.textContent = grind; grindRange.value = grind; mGrind.textContent = grind; markDial();
    $('finer').disabled = grind <= M.min || busy();
    $('coarser').disabled = grind >= M.max || busy();
    var target = 225 + 270 * grind / 16, from = knobAng;
    if (animate === false || still) { knobAng = target; knob.setAttribute('transform', 'rotate(' + target + ' 187 240)'); return; }
    tween(320, function (k) { knobAng = from + (target - from) * back(k); knob.setAttribute('transform', 'rotate(' + knobAng.toFixed(1) + ' 187 240)'); });
  }
  function lockGrind(lock) { grindRange.disabled = lock; setGrind(grind, false); }
  function readout(t, y) {
    var tt = t.toFixed(1) + 's', yy = y.toFixed(1) + 'g', rr = '1:' + (y / M.dose).toFixed(1);
    rTime.querySelector('b').textContent = tt; rYield.querySelector('b').textContent = yy; rRatio.querySelector('b').textContent = rr;
    mTime.textContent = tt; mYield.textContent = yy;
    rTime.classList.toggle('good', t >= M.lo && t <= M.hi);
  }
  /* seen from above: the coffee surface spreads across the cup as it fills */
  var cupFill = 0;
  function fillCup(f) {
    cupFill = f;
    var s = Math.sqrt(Math.max(0, f));
    liquid.setAttribute('rx', (26 * s).toFixed(2)); liquid.setAttribute('ry', (4.4 * s).toFixed(2));
  }
  var gnums = svg.querySelectorAll('.gnum');
  function markDial() {
    gnums.forEach(function (t) { var on = +t.getAttribute('data-g') === grind; t.setAttribute('fill', on ? '#ff8a3d' : '#e9dfd3'); t.setAttribute('font-size', on ? 12 : 10); });
  }
  function setStep(btn, msg, enabled) { act.textContent = btn; note.textContent = msg; act.disabled = !enabled; }
  function zones(which) { zG.classList.toggle('show', which === 'grinder'); zH.classList.toggle('show', which === 'group'); zK.classList.toggle('show', which === 'knock'); }
  /* the button that matters right now glows */
  function rings(which) {
    ['grind', 'dbl', 'steam'].forEach(function (k) { var r = $(k + 'Ring'); r.style.opacity = k === which ? 1 : 0; r.classList.toggle('on', k === which); });
  }
  function bar(b) {
    /* semicircle: 0 bar far left, 9 bar straight up (ideal), 15 bar far right */
    b = Math.max(0, Math.min(15, b));
    var a = b < 9 ? (b - 9) / 9 * 90 : (b - 9) / 6 * 90;
    needle.setAttribute('transform', 'rotate(' + a.toFixed(1) + ' 372 214)');
  }

  /* beans */
  (function () {
    var html = '';
    for (var i = 0; i < 90; i++) {
      var x = 166 + Math.random() * 90, y = 60 + Math.random() * 58, r = (Math.random() * 180).toFixed(0);
      html += '<g transform="rotate(' + r + ' ' + x.toFixed(1) + ' ' + y.toFixed(1) + ')"><ellipse cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" rx="5.6" ry="3.9" fill="url(#bean)"/><path d="M' + (x - 4).toFixed(1) + ' ' + y.toFixed(1) + ' q4 1.6 8 0" stroke="#1b0c04" stroke-width=".9" fill="none"/></g>';
    }
    $('beans').innerHTML = html;
  })();

  /* ---------- steps ---------- */
  function dock() {
    if (state !== 'empty') return Promise.resolve();
    state = 'docking'; zones(null);
    return moveTo('grinder').then(function () {
      state = 'docked'; rings('grind');
      setStep('Grind 18g', 'Step 1 of 4 · Press GRIND on the machine', true);
      crema('In the cradle. Now <b>press GRIND</b> on the machine.', 'excited');
    });
  }
  function doGrind() {
    if (state !== 'empty' && state !== 'docked') return;
    var first = state === 'empty' ? moveTo('grinder') : Promise.resolve();
    state = 'grinding'; lockGrind(true); zones(null); rings(null);
    setStep('Grinding…', 'Grinding 18g at setting ' + grind, false);
    crema('Grinding 18g at setting <b>' + grind + '</b>. Watch the dose scale.', 'think');
    return first.then(function () {
      var spawn = null, beans = $('beans');
      gStream.setAttribute('opacity', still ? 0 : 0.9);
      if (!still) spawn = setInterval(function () {
        for (var i = 0; i < 3; i++) {
          var c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          c.setAttribute('cx', 187 + (Math.random() - 0.5) * 8); c.setAttribute('cy', 330);
          c.setAttribute('r', (0.6 + Math.random() * 1.1) * (0.6 + grind / 20)); c.setAttribute('fill', Math.random() < 0.5 ? '#4a2a14' : '#6a3d1d');
          groundsG.appendChild(c);
          (function (c, vx) {
            var y = 330, vy = 0.5, x = +c.getAttribute('cx');
            (function fall() { vy += 0.32; y += vy; x += vx; c.setAttribute('cy', y.toFixed(1)); c.setAttribute('cx', x.toFixed(1));
              if (y < 364) requestAnimationFrame(fall); else c.remove(); })();
          })(c, (Math.random() - 0.5) * 0.25);
        }
      }, 28);
      return tween(2400, function (k, now) {
        var dose = M.dose * (1 - Math.pow(1 - k, 1.6));
        mound.setAttribute('ry', (k * 12).toFixed(1));
        mDose.textContent = dose.toFixed(1) + 'g';
        body.setAttribute('transform', 'translate(' + (Math.sin(now / 18) * 0.6).toFixed(2) + ' 0)');
        beans.setAttribute('transform', 'translate(0 ' + (k * 6).toFixed(1) + ')');
        gStream.setAttribute('stroke-dashoffset', (now / 12).toFixed(1));
      }).then(function () {
        clearInterval(spawn); body.removeAttribute('transform'); gStream.setAttribute('opacity', 0); mDose.textContent = '18.0g';
      });
    }).then(function () {
      state = 'ground'; zones('grinder'); tamper.classList.add('ready');
      setStep('Tamp', 'Step 2 of 4 · Tamp the coffee flat', true);
      crema('18 grams. Now <b>grab the tamper</b> on the right and press it down on the coffee. Firm and level!', 'smile');
    });
  }
  function setT(x, y, r) {
    tpos = [x, y];
    tamper.setAttribute('transform', 'translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ') rotate(' + (r || 0).toFixed(1) + ')');
  }
  function tamperTo(pt, ms) {
    var a = tpos.slice(), lift = 50;
    tShadow.style.opacity = 0;
    return tween(ms || 650, function (k) {
      var e = ease(k);
      setT(a[0] + (pt[0] - a[0]) * e, a[1] + (pt[1] - a[1]) * e - Math.sin(Math.PI * e) * lift, -8 * Math.sin(Math.PI * e));
    });
  }
  function doTamp() {
    if (state !== 'ground') return;
    state = 'tamping'; zones(null); tamper.classList.remove('ready');
    setStep('Tamping…', '', false);
    var ry0 = +mound.getAttribute('ry');
    return tamperTo(TAMPER.over).then(function () {
      /* press: tamper goes down, mound squashes flat */
      return tween(420, function (k) {
        var e = ease(k);
        setT(TAMPER.over[0], TAMPER.over[1] + (TAMPER.press[1] - TAMPER.over[1]) * e, 0);
        mound.setAttribute('ry', (ry0 * (1 - e)).toFixed(1));
        tamped.setAttribute('opacity', e.toFixed(2));
      });
    }).then(function () {
      /* polish twist */
      return tween(300, function (k) { setT(TAMPER.press[0] + Math.sin(k * Math.PI * 2) * 1.5, TAMPER.press[1], Math.sin(k * Math.PI * 2) * 4); });
    }).then(function () {
      return tween(260, function (k) { setT(TAMPER.press[0], TAMPER.press[1] - 30 * ease(k), 0); });
    }).then(function () {
      return tamperTo(TAMPER.home, 600);
    }).then(function () {
      tShadow.style.opacity = 1;
      state = 'tamped'; zones('group');
      setStep('Lock into group head', 'Step 3 of 4 · Move the portafilter to the machine', true);
      crema('Lovely flat puck. Now <b>drag the portafilter up into the group head</b> and lock it in.', 'excited');
    });
  }
  function doLock() {
    if (state !== 'tamped') return;
    state = 'locking'; zones(null); mDose.textContent = '0.0g';
    setStep('Locking in…', '', false);
    return moveTo('group').then(function () {
      return tween(380, function (k) { setPF(SPOT.group[0], SPOT.group[1] - 3 * Math.sin(Math.PI * k), -10 * Math.sin(Math.PI * k)); });
    }).then(function () {
      state = 'locked';
      setStep('Double shot', 'Step 4 of 4 · Press DOUBLE SHOT', true); rings('dbl');
      crema('Locked in. <b>Press DOUBLE SHOT</b> and watch the timer and the scale.', 'excited');
    });
  }
  function streamPath(x, top, bottom, now, wob) {
    var mid = (top + bottom) / 2, w = Math.sin(now / 90 + x) * wob;
    return 'M' + x + ' ' + top + ' Q' + (x + w).toFixed(1) + ' ' + mid.toFixed(1) + ' ' + (x - w * 0.4).toFixed(1) + ' ' + bottom.toFixed(1);
  }
  function drop(x, y0, y1, col) {
    var d = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    d.setAttribute('cx', x); d.setAttribute('rx', 1.6); d.setAttribute('ry', 2.4); d.setAttribute('fill', col); drips.appendChild(d);
    var y = y0, v = 0.6;
    (function f() { v += 0.35; y += v; d.setAttribute('cy', y.toFixed(1)); if (y < y1) requestAnimationFrame(f); else d.remove(); })();
  }
  function doShot() {
    if (state !== 'locked') return;
    state = 'pulling'; rings(null);
    setStep('Pulling…', 'Watch the time and the scale', false);
    var s = model(grind), j = judge(s), said = false;
    var speed = Math.max(3, s.t / 9), preinf = s.choke ? 10 : 4, dur = (s.t / speed) * 1000;
    var cols = { vfast: ['#e2bd87', '#a87444', '#c79a62'], fast: ['#d7a468', '#97602f', '#a86a36'], ok: ['#d39a5e', '#8a4d22', '#7a3f17'],
                 slow: ['#9a6330', '#4f270d', '#55290e'], vslow: ['#764422', '#3a1a08', '#3f1c09'], choke: ['#4a2510', '#2a1206', '#2a1206'] }[j.key];
    crema1.setAttribute('stop-color', cols[0]); crema2.setAttribute('stop-color', cols[1]);
    var width = { vfast: 4.6, fast: 3.7, ok: 3, slow: 2.2, vslow: 1.7, choke: 1 }[j.key];
    var lastDrip = 0;
    crema('Here it comes…', 'think');
    return tween(dur, function (k, now) {
      var t = k * s.t;
      var flowK = s.choke ? Math.pow(k, 1.5) : Math.max(0, (t - preinf) / (s.t - preinf));
      var y = s.y * Math.min(1, flowK);
      readout(t, y);
      bar(Math.min(1, k * 6) * j.bar + Math.sin(now / 120) * 0.15);
      var flowing = !s.choke && t > preinf && k < 0.985;
      /* pre-infusion and choked shots drip; normal shots stream */
      if (!flowing && k < 0.985 && t > 1.5 && now - lastDrip > (s.choke ? 260 : 140)) {
        lastDrip = now; drop(385 + (Math.random() < 0.5 ? 0 : 30), 362, 374, cols[1]);
      }
      streams.setAttribute('opacity', flowing ? 1 : 0);
      if (flowing) {
        var surf = 375;
        var col = k > 0.75 ? cols[0] : cols[2];      /* blonding near the end */
        [[s1, 385], [s2, 415]].forEach(function (p) {
          p[0].setAttribute('d', streamPath(p[1], 362, surf, now, width * 0.45));
          p[0].setAttribute('stroke-width', (width * (0.85 + Math.sin(now / 70 + p[1]) * 0.15)).toFixed(2));
          p[0].setAttribute('stroke', col);
        });
      }
      fillCup(Math.min(1, y / 36));
      if (!said && t > Math.min(8, s.t * 0.5)) {
        said = true;
        if (FAST[j.key]) crema('Whoa, that\'s flying out…', 'shock');
        else if (j.key === 'choke') crema('Uh oh. Barely a drip…', 'worried', { move: 'shake' });
        else if (SLOW[j.key]) crema('Hmm, it\'s taking its time…', 'worried');
        else crema('Ooh, that looks lovely…', 'smile');
      }
    }).then(function () {
      streams.setAttribute('opacity', 0);
      return tween(600, function (k) { bar((1 - k) * j.bar); cupSteam.setAttribute('opacity', (0.8 * k).toFixed(2)); });
    }).then(function () {
      readout(s.t, s.y);
      state = 'done';
      shots.push({ g: grind, t: s.t, y: s.y, j: j });
      logShot();
      showResult(s, j);
      setStep('Knock out', 'Drag the portafilter to the knock box, or tap it', true); zones('knock');
    });
  }
  function knockOut() {
    if (state !== 'done') return Promise.resolve();
    state = 'knocking'; zones(null);
    setStep('Knocking out…', '', false);
    var fromGroup = Math.hypot(pos[0] - SPOT.group[0], pos[1] - SPOT.group[1]) < 4;
    var unlock = fromGroup ? tween(260, function (k) { setPF(SPOT.group[0], SPOT.group[1] + 2 * Math.sin(Math.PI * k), 10 * Math.sin(Math.PI * k)); }) : Promise.resolve();
    return unlock
      .then(function () { return moveTo('knock', 650); })
      .then(function () { return knock(); })
      .then(function () { return knock(); })
      .then(function () { return moveTo('home', 650); })
      .then(function () {
        tamped.setAttribute('opacity', 0); mound.setAttribute('ry', 0);
        var f0 = cupFill;
        tween(400, function (k) { fillCup(f0 * (1 - k)); cupSteam.setAttribute('opacity', (0.8 * (1 - k)).toFixed(2)); });
        readout(0, 0);
        state = 'empty'; lockGrind(false); zones('grinder'); rings('grind');
        setStep('Grind 18g', 'Step 1 of 4 · Grind your coffee', true);
      });
  }

  /* two sharp knocks on the bar; the puck drops into the box on the first */
  var pucks = 0;
  function knock() {
    var dropNow = +tamped.getAttribute('opacity') > 0;
    return tween(230, function (k) {
      var d = k < 0.45 ? k / 0.45 : 1 - (k - 0.45) / 0.55;
      setPF(SPOT.knock[0], SPOT.knock[1] + 10 * d, -6 * d);
      kbox.setAttribute('transform', k > 0.4 && k < 0.6 ? 'translate(0 1.5)' : '');
    }).then(function () {
      if (!dropNow) return;
      tamped.setAttribute('opacity', 0);
      var puck = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
      puck.setAttribute('cx', SPOT.knock[0]); puck.setAttribute('rx', 24); puck.setAttribute('ry', 6); puck.setAttribute('fill', '#3a200f');
      puck.setAttribute('stroke', '#1c0e05');
      kbPucks.appendChild(puck);
      var n = Math.min(pucks, 5), land = 462 - n * 5, y = SPOT.knock[1] + 4, v = 1;
      pucks++;
      return new Promise(function (done) {
        if (still) { puck.setAttribute('cy', land); return done(); }
        (function f() { v += 0.9; y += v; puck.setAttribute('cy', Math.min(land, y).toFixed(1));
          if (y < land) requestAnimationFrame(f); else { kbox.setAttribute('transform', 'translate(0 2)'); setTimeout(function () { kbox.removeAttribute('transform'); }, 90); done(); } })();
      });
    });
  }

  /* steam button: a puff from the wand, just for fun */
  var quips = ['That\'s for milk! We\'re doing espresso today.', 'Pssshhh! Save that for your flat white.', 'Ooh, toasty. Back to the espresso?'];
  function puff() {
    for (var i = 0; i < 26; i++) {
      (function (i) {
        var c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        c.setAttribute('fill', 'rgba(255,237,215,.5)'); wandSteam.appendChild(c);
        var x = 541, y = 410, vx = (Math.random() - 0.5) * 1.8, vy = 0.5 + Math.random() * 0.9, r = 2, life = 0;
        setTimeout(function () {
          (function f() { life++; vy -= 0.06; x += vx; y += vy; r += 0.5; c.setAttribute('cx', x.toFixed(1)); c.setAttribute('cy', y.toFixed(1));
            c.setAttribute('r', r.toFixed(1)); c.setAttribute('opacity', Math.max(0, 1 - life / 60).toFixed(2));
            if (life < 60) requestAnimationFrame(f); else c.remove(); })();
        }, still ? 0 : i * 25);
      })(i);
    }
    crema(quips[Math.floor(Math.random() * quips.length)], 'excited');
  }

  /* ---------- coaching ---------- */
  function coach(s, j) {
    var prev = shots.length > 1 ? shots[shots.length - 2] : null, lines = [];
    var head = '<b>' + j.title + '.</b> ' + s.t.toFixed(1) + 's for ' + s.y.toFixed(1) + 'g. <i>' + j.taste + '</i><br><br>';
    if (j.key === 'ok') {
      return { face: 'happy', move: 'hop', text: head + 'We nailed it! 18g in, ' + s.y.toFixed(1) + 'g out, a 1:' + (s.y / M.dose).toFixed(1) + ' ratio right in the window. On your own machine the number will be different, because your beans are different. The process is exactly the same.' };
    }
    if (prev && prev.g !== grind) {
      var wentFiner = grind < prev.g;
      if (FAST[prev.j.key] && !wentFiner) lines.push('You went coarser and it got even faster!');
      else if (SLOW[prev.j.key] && wentFiner) lines.push('You went finer and it got even slower!');
      else if ((FAST[prev.j.key] && SLOW[j.key]) || (SLOW[prev.j.key] && FAST[j.key])) lines.push('Right direction, but you went a bit too far.');
      else lines.push('Right direction. Keep going!');
    }
    if (j.key === 'choke') lines.push('The grind is so fine the water can barely get through. <b>Go coarser: pick a bigger number.</b>');
    else if (FAST[j.key]) lines.push('<b>Go finer: on this grinder, a smaller number means finer.</b> Finer grounds pack tighter, so the water takes longer to get through.');
    else lines.push('<b>Go coarser: pick a bigger number.</b> Coarser grounds leave more gaps, so the water flows through faster.');
    var face = j.key === 'choke' ? 'shock' : j.cls === 'bad' ? 'sad' : 'worried';
    return { face: face, move: j.key === 'choke' ? 'shake' : null, text: head + lines.join(' ') };
  }
  function showResult(s, j) {
    var c = coach(s, j);
    var change = function () {
      knockOut().then(function () {
        pulseGrind();
        crema('Use the <b>− and +</b> under Grind size. Go ' + (FAST[j.key] ? '<b>down</b> for finer' : '<b>up</b> for coarser') + ', then grind again.', 'smile');
      });
    };
    var buttons = j.key === 'ok'
      ? [{ label: 'Try another setting', pri: true, go: function () { knockOut().then(function () { pulseGrind(); crema('Go on, try something silly like <b>16</b> and see how bad it gets.', 'excited'); }); } },
         { label: 'Get the gear', go: function () { location.href = '../codes/'; } }]
      : [{ label: 'Yes, change grind', pri: true, go: change },
         { label: 'Same again', go: function () { knockOut().then(function () { crema('Same setting again. Pop the portafilter in the grinder and press <b>GRIND</b>.', 'smile'); }); } }];
    crema(c.text + (j.key === 'ok' ? '' : '<br><br>Want to change your settings?'), c.face, { buttons: buttons, move: c.move });
  }
  function pulseGrind() {
    var c = $('grindCard'); c.classList.remove('pulse'); void c.offsetWidth; c.classList.add('pulse');
    var r = c.getBoundingClientRect();
    var phone = window.innerWidth < 700;
    if (phone || r.top < 70 || r.bottom > window.innerHeight - 140) {
      window.scrollTo({ top: window.scrollY + r.top - (phone ? 76 : window.innerHeight / 2 - r.height / 2), behavior: still ? 'auto' : 'smooth' });
    }
  }
  function logShot() {
    var s = shots[shots.length - 1];
    var li = document.createElement('li'); li.className = s.j.cls;
    li.innerHTML = '<b>#' + shots.length + ' · Grind ' + s.g + '</b><span>' + s.t.toFixed(1) + 's · ' + s.y.toFixed(1) + 'g</span><i>' + s.j.title + '</i>';
    $('log').appendChild(li);
  }

  /* ---------- controls ---------- */
  act.addEventListener('click', function () {
    if (state === 'empty' || state === 'docked') doGrind(); else if (state === 'ground') doTamp(); else if (state === 'tamped') doLock();
    else if (state === 'locked') doShot(); else if (state === 'done') knockOut();
  });
  $('dblBtn').addEventListener('click', function () {
    if (state === 'locked') doShot();
    else if (state === 'empty' || state === 'docked' || state === 'ground' || state === 'tamped') crema('Not yet! Get the portafilter <b>ground, tamped and locked in</b> first.', 'smile');
  });
  $('grindBtn').addEventListener('click', function () {
    if (state === 'empty' || state === 'docked') doGrind();
    else if (state === 'ground' || state === 'tamped' || state === 'locked') crema('Already ground! One dose at a time.', 'smile');
  });
  $('steamBtn').addEventListener('click', puff);
  $('finer').addEventListener('click', function () { if (!busy()) setGrind(grind - 1); });
  $('coarser').addEventListener('click', function () { if (!busy()) setGrind(grind + 1); });
  grindRange.addEventListener('input', function () { if (!busy()) setGrind(+grindRange.value); else grindRange.value = grind; });

  /* drag the portafilter */
  function svgPt(e) { var p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); }
  var drag = null;
  pf.addEventListener('pointerdown', function (e) {
    if (state === 'ground') { crema('Tamp it first! <b>Grab the tamper</b> on the right.', 'smile'); return; }
    if (state !== 'empty' && state !== 'tamped' && state !== 'done') return;
    e.preventDefault();
    var p = svgPt(e);
    drag = { dx: pos[0] - p.x, dy: pos[1] - p.y, moved: false, lx: p.x };
    pf.setPointerCapture(e.pointerId); pf.classList.add('drag'); pfShadow.style.opacity = 0;
    zones(state === 'empty' ? 'grinder' : state === 'done' ? 'knock' : 'group');
  });
  pf.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var p = svgPt(e);
    var x = Math.max(40, Math.min(660, p.x + drag.dx)), y = Math.max(40, Math.min(480, p.y + drag.dy));
    if (Math.hypot(x - pos[0], y - pos[1]) > 2) drag.moved = true;
    var tilt = Math.max(-12, Math.min(12, (p.x - drag.lx) * 0.8)); drag.lx = p.x;
    setPF(x, y, rot * 0.7 + tilt * 0.3);
  });
  function endDrag() {
    if (!drag) return;
    var moved = drag.moved; drag = null; pf.classList.remove('drag');
    var target = state === 'empty' ? 'grinder' : state === 'done' ? 'knock' : 'group';
    var near = Math.hypot(pos[0] - SPOT[target][0], pos[1] - SPOT[target][1]) < 75;
    if (!moved || near) { if (state === 'empty') dock(); else if (state === 'done') knockOut(); else doLock(); }
    else moveTo(state === 'empty' ? 'home' : state === 'done' ? 'group' : 'grinder', 420).then(function () { zones(target); crema('Close! Drop it on the dashed outline.', 'smile'); });
  }
  pf.addEventListener('pointerup', endDrag);
  pf.addEventListener('pointercancel', endDrag);

  /* drag (or tap) the tamper onto the coffee */
  var tdrag = null;
  tamper.addEventListener('pointerdown', function (e) {
    if (state !== 'ground') {
      if (state === 'empty') crema('Grind some coffee first, then we\'ll tamp it.', 'smile');
      return;
    }
    e.preventDefault();
    var p = svgPt(e);
    tdrag = { dx: tpos[0] - p.x, dy: tpos[1] - p.y, moved: false };
    tamper.setPointerCapture(e.pointerId); tShadow.style.opacity = 0;
  });
  tamper.addEventListener('pointermove', function (e) {
    if (!tdrag) return;
    var p = svgPt(e);
    var x = Math.max(30, Math.min(620, p.x + tdrag.dx)), y = Math.max(80, Math.min(480, p.y + tdrag.dy));
    if (Math.hypot(x - tpos[0], y - tpos[1]) > 2) tdrag.moved = true;
    setT(x, y, 0);
  });
  function endT() {
    if (!tdrag) return;
    var moved = tdrag.moved; tdrag = null;
    var near = Math.hypot(tpos[0] - TAMPER.over[0], tpos[1] - TAMPER.over[1]) < 80;
    if (!moved || near) doTamp();
    else tamperTo(TAMPER.home, 450).then(function () { tShadow.style.opacity = 1; crema('Close! Drop the tamper on the coffee.', 'smile'); });
  }
  tamper.addEventListener('pointerup', endT);
  tamper.addEventListener('pointercancel', endT);

  /* start */
  setPF(SPOT.home[0], SPOT.home[1], 0);
  setGrind(M.start, false);
  zones('grinder'); rings('grind');
})();
