(() => {
  /** @typedef {{x:number,y:number,w:number,h:number}} Rect */

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const stateText = document.getElementById('stateText');

  const restartBtn = document.getElementById('restartBtn');
  const leftBtn = document.getElementById('leftBtn');
  const rightBtn = document.getElementById('rightBtn');
  const tallBtn = document.getElementById('tallBtn');
  const shortBtn = document.getElementById('shortBtn');
  const jumpBtn = document.getElementById('jumpBtn');
  const winOverlay = document.getElementById('winOverlay');
  const nextBtn = document.getElementById('nextBtn');
  const musicPlayBtn = document.getElementById('musicPlayBtn');
  const musicStopBtn = document.getElementById('musicStopBtn');
  const bgmEl = document.getElementById('bgm');
  const pauseBtn = document.getElementById('pauseBtn');
  const levelSelect = document.getElementById('levelSelect');
  const livesText = document.getElementById('livesText');
  const fullResetBtn = document.getElementById('fullResetBtn');
  const startBtn = document.getElementById('startBtn');

  // World constants
  const WORLD = {
    width: canvas.width,
    height: canvas.height,
    groundY: canvas.height - 60,
    bgSky: '#11162c',
    bgHills: '#0c1030',
    ground: '#1a233a',
    accents: '#2a60ff'
  };
  // Logical unit size (pixels per unit)
  const UNIT = 20;

  // Player constants
  const PLAYER = {
    baseWidth: 50,
    // Height bounds in units
    minUnits: 1, // 1 unit tall minimum
    maxUnits: 7, // 7 units tall maximum
    speed: 3.2,
    gravity: 0.6,
    jumpVelocity: 10,
    jumpBoostFrames: 14,
    jumpBoostAccel: 0.5,
    maxFallSpeed: 18
  };

  function unitsToPx(units) {
    return units * UNIT;
  }

  /** @type {{x:number,y:number,w:number,h:number,isTall:boolean,color:string,vy:number,grounded:boolean,heightUnits:number}} */
  const player = {
    x: 60,
    y: 0, // set in reset
    w: PLAYER.baseWidth,
    h: unitsToPx(PLAYER.minUnits),
    isTall: false,
    color: '#ffc93d',
    vy: 0,
    grounded: false,
    heightUnits: PLAYER.minUnits
  };

  /** @type {Rect[]} */
  let staticColliders = [];
  /** @type {Rect[]} */
  let dynamicBarriers = []; // Active only when player is short
  /** @type {Rect} */
  let goal;
  /** @type {Rect[]} */
  let hazards = [];
  /** @type {{x:number,y:number,age:number,maxAge:number,text:string}[]} */
  let bubbles = [];
  /** @type {boolean[]} */
  let clearedHazards = [];
  /** @type {{x:number,y:number,w:number,h:number,vx:number,left:number,right:number}[]} */
  let monsters = [];
  let currentLevel = 1;
  let lives = 3;
  let loseMsgEl = null;

  const input = {
    left: false,
    right: false,
    jumpHeld: false
  };

  function resetLevel() {
    // Reset player
    player.x = 60;
    player.heightUnits = PLAYER.minUnits;
    player.h = unitsToPx(player.heightUnits);
    player.isTall = false;
    player.vy = 0;
    player.grounded = true;
    player.y = WORLD.groundY - player.h;

    // Build level
    staticColliders = [];
    dynamicBarriers = [];
    hazards = [];
    clearedHazards = [];
    monsters = [];

    // World boundaries (left/right walls)
    staticColliders.push({ x: -1000, y: 0, w: 1000, h: WORLD.height });
    staticColliders.push({ x: WORLD.width, y: 0, w: 1000, h: WORLD.height });

    // (Removed) Overhead obstacle for jump freedom

    // A solid block to the left to encourage going right
    staticColliders.push({ x: 180, y: WORLD.groundY - 80, w: 40, h: 80 });

    // No dynamic barriers in new rules

    // Ground obstacles by level: level N has N obstacles (1..7), heights 2..5u
    const count = Math.min(7, Math.max(1, currentLevel));
    const baseX = 320;
    const spacing = Math.max(80, 120 - currentLevel * 8);
    hazards = [];
    for (let i = 0; i < count; i++) {
      const cycle = [2, 3, 4, 5, 3, 4, 5];
      const huBase = cycle[i % cycle.length];
      const hu = Math.min(5, Math.max(2, huBase + Math.floor((currentLevel - 1) / 3)));
      const heightPx = unitsToPx(hu);
      const widthPx = unitsToPx(1); // 1 unit wide
      hazards.push({ x: baseX + i * spacing, y: WORLD.groundY - heightPx, w: widthPx, h: heightPx });
    }
    clearedHazards = new Array(hazards.length).fill(false);

    // Monsters: one per level, very slow patrol between obstacles
    const mCount = count;
    for (let i = 0; i < mCount; i++) {
      const left = (hazards[i]?.x ?? baseX) - 20;
      const right = left + Math.max(100, spacing * 0.9);
      const mW = unitsToPx(1.2);
      const mH = unitsToPx(1.6);
      const startX = left + (right - left) * 0.5;
      monsters.push({ x: startX, y: WORLD.groundY - mH, w: mW, h: mH, vx: (i % 2 === 0 ? 1 : -1) * 0.6, left, right });
    }

    // Goal area
    goal = { x: 860, y: WORLD.groundY - 100, w: 60, h: 100 };
  }

  function setHeight(tall, silent = false) {
    // Growth +7 units, Shrink -2 units (clamped)
    const deltaUnits = tall ? 7 : -2;
    attemptHeightUnitsChange(deltaUnits, silent);
  }

  function attemptHeightUnitsChange(deltaUnits, silent = false) {
    const targetUnits = Math.max(PLAYER.minUnits, Math.min(PLAYER.maxUnits, player.heightUnits + deltaUnits));
    if (targetUnits === player.heightUnits) return;
    const prevH = player.h;
    const nextH = unitsToPx(targetUnits);
    const deltaPx = nextH - prevH;
    const prevY = player.y;
    // Anchor by feet
    player.y = player.y - deltaPx;
    player.h = nextH;
    // If collision, try smaller step (only when shrinking by 2)
    if (collidesWithAny(activeColliders())) {
      // revert and attempt minimal step in same direction
      player.y = prevY;
      player.h = prevH;
      const stepUnits = deltaUnits > 0 ? 1 : -1;
      const tryUnits = Math.max(PLAYER.minUnits, Math.min(PLAYER.maxUnits, player.heightUnits + stepUnits));
      if (tryUnits !== player.heightUnits) {
        const tryH = unitsToPx(tryUnits);
        const tryDelta = tryH - prevH;
        player.y = prevY - tryDelta;
        player.h = tryH;
        if (collidesWithAny(activeColliders())) {
          // revert if still colliding
          player.y = prevY;
          player.h = prevH;
          if (!silent) flashCanvas();
          return;
        } else {
          player.heightUnits = tryUnits;
        }
      } else {
        if (!silent) flashCanvas();
        return;
      }
    } else {
      player.heightUnits = targetUnits;
    }
    // Update grounded based on feet
    if (player.y + player.h > WORLD.groundY) {
      player.y = WORLD.groundY - player.h;
    }
    // Update tall flag: treat as tall only at max height
    player.isTall = player.heightUnits >= PLAYER.maxUnits;
    if (!silent) updateStateText();
  }

  function updateStateText() {
    stateText.textContent = player.isTall ? '高' : '矮';
    if (livesText) livesText.textContent = `生命：${lives}`;
  }

  function activeColliders() {
    // Obstacles and walls are solid and walkable; no lethal surfaces
    return staticColliders.concat(hazards);
  }

  function aabbIntersect(a, b) {
    return (
      a.x < b.x + b.w &&
      a.x + a.w > b.x &&
      a.y < b.y + b.h &&
      a.y + a.h > b.y
    );
  }

  function collidesWithAny(colliders) {
    for (let i = 0; i < colliders.length; i++) {
      if (aabbIntersect(player, colliders[i])) return true;
    }
    return false;
  }

  function resolveHorizontal(dx) {
    if (dx === 0) return;
    const step = Math.sign(dx) * 1;
    let remaining = Math.abs(dx);
    while (remaining > 0) {
      player.x += step;
      if (collidesWithAny(activeColliders())) {
        player.x -= step;
        break;
      }
      remaining -= 1;
    }
  }

  function resolveVertical(dy) {
    if (dy === 0) return;
    const step = Math.sign(dy) * 1;
    let remaining = Math.abs(dy);
    let landed = false;
    while (remaining > 0) {
      // Ground clamp if moving down
      if (step > 0) {
        const nextFeet = player.y + player.h + step;
        if (nextFeet >= WORLD.groundY) {
          player.y = WORLD.groundY - player.h;
          player.vy = 0;
          landed = true;
          break;
        }
      }
      player.y += step;
      if (collidesWithAny(activeColliders())) {
        player.y -= step;
        player.vy = 0;
        if (step > 0) {
          landed = true; // landed on something (can be hazard) but non-lethal
        }
        break;
      }
      remaining -= 1;
    }
    player.grounded = landed || (player.y + player.h >= WORLD.groundY - 0.001);
  }

  let isJumping = false;
  let jumpBoostFramesLeft = 0;
  function attemptJump() {
    if (player.grounded) {
      player.vy = -PLAYER.jumpVelocity;
      player.grounded = false;
      isJumping = true;
      jumpBoostFramesLeft = PLAYER.jumpBoostFrames;
      spawnBubble('Emily Come On', player.x + player.w / 2, player.y - 12);
    }
  }

  function spawnBubble(text, x, y) {
    bubbles.push({ x, y, age: 0, maxAge: 60, text });
  }

  function update() {
    const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    resolveHorizontal(dx * PLAYER.speed);

    // Gravity and vertical motion
    player.vy += PLAYER.gravity;
    if (player.vy > PLAYER.maxFallSpeed) player.vy = PLAYER.maxFallSpeed;
    resolveVertical(player.vy);

    // Jump hold to modulate height
    if (isJumping && input.jumpHeld && jumpBoostFramesLeft > 0 && player.vy < 0) {
      player.vy -= PLAYER.jumpBoostAccel;
      jumpBoostFramesLeft--;
    }

    // Update bubbles (float up and fade out)
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      b.age += 1;
      b.y -= 0.8;
      if (b.age > b.maxAge) bubbles.splice(i, 1);
    }

    // Monsters patrol and collision effect (shrink if tall)
    for (const m of monsters) {
      m.x += m.vx;
      if (m.x < m.left) { m.x = m.left; m.vx = Math.abs(m.vx); }
      if (m.x + m.w > m.right) { m.x = m.right - m.w; m.vx = -Math.abs(m.vx); }
      if (aabbIntersect(player, m)) {
        if (player.isTall) {
          // force shrink to min height, non-lethal
          const delta = PLAYER.minUnits - player.heightUnits;
          attemptHeightUnitsChange(delta, /*silent=*/false);
        }
      }
    }

    // Win/level advance: ONLY when touching the goal flag
    if (goal && aabbIntersect(player, goal)) {
      if (currentLevel < 7) {
        currentLevel++;
        start();
        if (levelSelect) levelSelect.value = String(currentLevel);
      } else {
        winOverlay.classList.remove('hidden');
      }
    }
  }

  function drawBackground() {
    // Sky
    ctx.fillStyle = WORLD.bgSky;
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);
    // Parallax hills
    ctx.fillStyle = WORLD.bgHills;
    for (let i = 0; i < 6; i++) {
      const x = i * 200 - 60;
      const y = WORLD.height - 200 - (i % 2) * 20;
      ctx.beginPath();
      ctx.arc(x, y, 220, 0, Math.PI * 2);
      ctx.fill();
    }
    // Ground
    ctx.fillStyle = WORLD.ground;
    ctx.fillRect(0, WORLD.groundY, WORLD.width, WORLD.height - WORLD.groundY);
  }

  function drawLevel() {
    // Static colliders
    ctx.fillStyle = '#31406e';
    for (const r of staticColliders) ctx.fillRect(r.x, r.y, r.w, r.h);

    // (No dynamic barriers)

    // Hazards
    for (const r of hazards) {
      // spike-like pillar
      ctx.fillStyle = '#d94e4e';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = '#b13b3b';
      ctx.fillRect(r.x + 3, r.y + 6, r.w - 6, r.h - 12);
    }

    // Monsters
    for (const m of monsters) {
      ctx.fillStyle = '#5ed1f3';
      roundedRect(ctx, m.x, m.y, m.w, m.h, 6);
      ctx.fill();
      // eyes
      ctx.fillStyle = '#0b2740';
      ctx.fillRect(m.x + 6, m.y + 6, 4, 4);
      ctx.fillRect(m.x + m.w - 10, m.y + 6, 4, 4);
    }

    // Goal
    ctx.fillStyle = '#31d17c';
    ctx.fillRect(goal.x, goal.y, goal.w, goal.h);
    // Flag
    ctx.fillStyle = '#0c7b46';
    ctx.fillRect(goal.x + goal.w / 2 - 2, goal.y - 40, 4, 40);
    ctx.fillStyle = '#31d17c';
    ctx.beginPath();
    ctx.moveTo(goal.x + goal.w / 2 + 2, goal.y - 38);
    ctx.lineTo(goal.x + goal.w / 2 + 42, goal.y - 28);
    ctx.lineTo(goal.x + goal.w / 2 + 2, goal.y - 18);
    ctx.closePath();
    ctx.fill();
  }

  function drawPlayer() {
    // Body
    roundedRect(ctx, player.x, player.y, player.w, player.h, 8);
    ctx.fillStyle = player.color;
    ctx.fill();
    // Label 'Emily'
    ctx.fillStyle = '#0a1a12';
    ctx.font = 'bold 14px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';
    const label = 'Emily';
    const tw = ctx.measureText(label).width;
    ctx.fillText(label, player.x + (player.w - tw) / 2, player.y + player.h - 10);
    // Eyes
    ctx.fillStyle = '#11162c';
    ctx.fillRect(player.x + 12, player.y + (player.h * 0.25), 8, 8);
    ctx.fillRect(player.x + 30, player.y + (player.h * 0.25), 8, 8);
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(player.x + 6, WORLD.groundY + 8, player.w - 12, 6);
  }

  function roundedRect(context, x, y, w, h, r) {
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + w, y, x + w, y + h, r);
    context.arcTo(x + w, y + h, x, y + h, r);
    context.arcTo(x, y + h, x, y, r);
    context.arcTo(x, y, x + w, y, r);
  }

  function drawBubbles() {
    if (bubbles.length === 0) return;
    ctx.font = '16px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';
    for (const b of bubbles) {
      const alpha = Math.max(0, 1 - b.age / b.maxAge);
      ctx.globalAlpha = Math.min(1, alpha + 0.1);
      const paddingX = 10, paddingY = 6;
      const textW = ctx.measureText(b.text).width;
      const w = textW + paddingX * 2;
      const h = 24;
      const bx = Math.max(8, Math.min(WORLD.width - w - 8, b.x - w / 2));
      const by = Math.max(8, b.y - h);
      // Bubble background
      ctx.fillStyle = 'rgba(49,209,124,0.85)';
      roundedRect(ctx, bx, by, w, h, 12);
      ctx.fill();
      // Text
      ctx.fillStyle = '#0a1a12';
      ctx.fillText(b.text, bx + paddingX, by + h - paddingY);
      ctx.globalAlpha = 1;
    }
  }

  function render() {
    drawBackground();
    drawLevel();
    drawPlayer();
    drawBubbles();
  }

  function loseLife() {
    lives = Math.max(0, lives - 1);
    flashCanvas();
    if (lives <= 0) {
      // Game over -> reset lives and level, restart
      lives = 3;
      currentLevel = 1;
    }
    start();
  }

  let rafId = 0;
  function loop() {
    update();
    render();
    rafId = requestAnimationFrame(loop);
  }

  function start() {
    resetLevel();
    updateStateText();
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
    winOverlay.classList.add('hidden');
    updateMusicButtons();
    // Level select init
    if (levelSelect) {
      levelSelect.value = String(currentLevel);
      levelSelect.onchange = () => {
        const val = parseInt(levelSelect.value, 10);
        if (!isNaN(val)) {
          currentLevel = Math.max(1, Math.min(7, val));
          start();
        }
      };
    }
  }

  // Simple flash to indicate invalid action
  let flashTimer = 0;
  function flashCanvas() {
    flashTimer = 8;
  }

  const originalRender = render;
  render = function() {
    originalRender();
    if (flashTimer > 0) {
      ctx.fillStyle = 'rgba(255,90,95,0.20)';
      ctx.fillRect(0, 0, WORLD.width, WORLD.height);
      flashTimer--;
    }
  };

  // Inputs: keyboard
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { input.left = true; }
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { input.right = true; }
    if (e.key === 'ArrowUp') { e.preventDefault(); attemptJump(); }
    if (e.key === 'ArrowDown') { setHeight(false); }
    if (e.key === 'w' || e.key === 'W') { setHeight(true); }
    if (e.code === 'Space' || e.key === ' ') { e.preventDefault(); attemptJump(); input.jumpHeld = true; }
    if (e.key === 'r' || e.key === 'R') { start(); }
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { input.left = false; }
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { input.right = false; }
    if (e.code === 'Space' || e.key === ' ') { input.jumpHeld = false; isJumping = false; }
  });

  // Inputs: on-screen buttons
  bindHold(leftBtn, (down) => { input.left = down; });
  bindHold(rightBtn, (down) => { input.right = down; });
  bindTap(tallBtn, () => setHeight(true));
  bindTap(shortBtn, () => setHeight(false));
  if (jumpBtn) {
    jumpBtn.addEventListener('mousedown', (e) => { e.preventDefault(); attemptJump(); input.jumpHeld = true; });
    jumpBtn.addEventListener('touchstart', (e) => { e.preventDefault(); attemptJump(); input.jumpHeld = true; }, { passive: false });
    const end = (e) => { e.preventDefault(); input.jumpHeld = false; isJumping = false; };
    window.addEventListener('mouseup', end);
    window.addEventListener('touchend', end, { passive: false });
    window.addEventListener('touchcancel', end, { passive: false });
  }
  if (musicPlayBtn) bindTap(musicPlayBtn, playMusic);
  if (musicStopBtn) bindTap(musicStopBtn, stopMusic);
  if (fullResetBtn) bindTap(fullResetBtn, () => { lives = 3; currentLevel = 1; start(); });
  restartBtn.addEventListener('click', start);
  nextBtn.addEventListener('click', start);

  function bindHold(el, handler) {
    let pressing = false;
    const onDown = (e) => { e.preventDefault(); pressing = true; handler(true); };
    const onUp = (e) => { e.preventDefault(); if (pressing) { pressing = false; handler(false); } };
    el.addEventListener('mousedown', onDown);
    el.addEventListener('touchstart', onDown, { passive: false });
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchend', onUp, { passive: false });
    window.addEventListener('touchcancel', onUp, { passive: false });
    window.addEventListener('blur', () => handler(false));
  }

  function bindTap(el, handler) {
    el.addEventListener('click', (e) => { e.preventDefault(); handler(); });
    el.addEventListener('touchstart', (e) => { e.preventDefault(); handler(); }, { passive: false });
  }

  // Music controls (separate start/stop)
  let musicEnabled = false;
  function updateMusicButtons() {
    if (musicPlayBtn) musicPlayBtn.disabled = musicEnabled;
    if (musicStopBtn) musicStopBtn.disabled = !musicEnabled;
  }
  async function playMusic() {
    if (!bgmEl) return;
    try {
      await bgmEl.play();
      musicEnabled = true;
      updateMusicButtons();
    } catch (err) {
      flashCanvas();
    }
  }
  function stopMusic() {
    if (!bgmEl) return;
    bgmEl.pause();
    musicEnabled = false;
    updateMusicButtons();
  }

  // Autoplay immediately (muted) and on interaction
  function setupAutoplayOnce() {
    if (!bgmEl) return;
    const tryStart = () => {
      if (musicEnabled) return cleanup();
      bgmEl.play()
        .then(() => { musicEnabled = true; updateMusicButtons(); cleanup(); })
        .catch(() => {
          bgmEl.muted = true;
          bgmEl.play().then(() => {
            musicEnabled = true;
            updateMusicButtons();
            const unmute = () => { bgmEl.muted = false; cleanupUnmute(); };
            const cleanupUnmute = () => {
              window.removeEventListener('click', unmute, true);
              window.removeEventListener('keydown', unmute, true);
              window.removeEventListener('touchstart', unmute, true);
            };
            window.addEventListener('click', unmute, true);
            window.addEventListener('keydown', unmute, true);
            window.addEventListener('touchstart', unmute, true);
            cleanup();
          }).catch(() => {});
        });
    };
    const cleanup = () => {
      window.removeEventListener('click', tryStart, true);
      window.removeEventListener('keydown', tryStart, true);
      window.removeEventListener('touchstart', tryStart, true);
    };
    // try immediately muted
    bgmEl.muted = true;
    bgmEl.play().then(() => { musicEnabled = true; updateMusicButtons(); }).catch(() => {});
    // and also register interaction-based attempts
    window.addEventListener('click', tryStart, true);
    window.addEventListener('keydown', tryStart, true);
    window.addEventListener('touchstart', tryStart, true);
  }

  // Kick off: bind controls and auto-start (同时保留“开始游戏”和 Enter)
  resetLevel();
  updateStateText();
  render();
  if (startBtn) bindTap(startBtn, start);
  window.addEventListener('keydown', (e) => { if (e.key === 'Enter') { start(); } });
  setupAutoplayOnce();
  // 自动开始，避免用户未点击时画面停留预览
  start();
})();

