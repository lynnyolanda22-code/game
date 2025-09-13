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

  // Player constants
  const PLAYER = {
    baseWidth: 50,
    shortHeight: 60,
    tallHeight: 120,
    speed: 3.2,
    gravity: 0.6,
    jumpVelocity: 10.5,
    maxFallSpeed: 18
  };

  /** @type {{x:number,y:number,w:number,h:number,isTall:boolean,color:string}} */
  const player = {
    x: 60,
    y: WORLD.groundY - PLAYER.shortHeight,
    w: PLAYER.baseWidth,
    h: PLAYER.shortHeight,
    isTall: false,
    color: '#ffc93d',
    vy: 0,
    grounded: false
  };

  /** @type {Rect[]} */
  let staticColliders = [];
  /** @type {Rect[]} */
  let dynamicBarriers = []; // Active only when player is short
  /** @type {Rect} */
  let goal;

  const input = {
    left: false,
    right: false
  };

  function resetLevel() {
    // Reset player
    player.x = 60;
    player.isTall = false;
    setHeight(false, /*silent=*/true);

    // Build level
    staticColliders = [];
    dynamicBarriers = [];

    // World boundaries (left/right walls)
    staticColliders.push({ x: -1000, y: 0, w: 1000, h: WORLD.height });
    staticColliders.push({ x: WORLD.width, y: 0, w: 1000, h: WORLD.height });

    // Ground ceiling tunnel: only short can pass under the low ceiling
    // Ceiling slab: from x=320 to 520, ceiling sits 90px above ground
    const ceilingTopY = 0;
    const ceilingHeightFromTop = WORLD.groundY - 90; // top down to this Y
    staticColliders.push({ x: 320, y: ceilingTopY, w: 200, h: ceilingHeightFromTop });

    // A solid block to the left to encourage going right
    staticColliders.push({ x: 180, y: WORLD.groundY - 80, w: 40, h: 80 });

    // A barrier that is active only when player is short (requires tall form)
    dynamicBarriers.push({ x: 650, y: WORLD.groundY - 140, w: 24, h: 140 });

    // Goal area
    goal = { x: 860, y: WORLD.groundY - 100, w: 60, h: 100 };
  }

  function setHeight(tall, silent = false) {
    if (player.isTall === tall) return;
    const nextHeight = tall ? PLAYER.tallHeight : PLAYER.shortHeight;
    const delta = nextHeight - player.h;
    // Anchor by feet: adjust y upward when growing, downward when shrinking
    const prevY = player.y;
    player.y = player.y - delta;
    const prevH = player.h;
    player.h = nextHeight;
    // If this causes a collision, revert and do nothing
    if (collidesWithAny(activeColliders())) {
      player.y = prevY;
      player.h = prevH;
      if (!silent) flashCanvas();
      return;
    }
    player.isTall = tall;
    if (!silent) updateStateText();
  }

  function updateStateText() {
    stateText.textContent = player.isTall ? '高' : '矮';
  }

  function activeColliders() {
    // Dynamic barriers only block when player is short
    if (player.isTall) return staticColliders;
    return staticColliders.concat(dynamicBarriers);
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
        if (step > 0) landed = true; // landed on something
        break;
      }
      remaining -= 1;
    }
    player.grounded = landed || (player.y + player.h >= WORLD.groundY - 0.001);
  }

  function attemptJump() {
    if (player.grounded) {
      player.vy = -PLAYER.jumpVelocity;
      player.grounded = false;
    }
  }

  function update() {
    const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    resolveHorizontal(dx * PLAYER.speed);

    // Gravity and vertical motion
    player.vy += PLAYER.gravity;
    if (player.vy > PLAYER.maxFallSpeed) player.vy = PLAYER.maxFallSpeed;
    resolveVertical(player.vy);

    // Win check
    if (aabbIntersect(player, goal)) {
      winOverlay.classList.remove('hidden');
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

    // Dynamic barrier (only visible when active i.e., player short)
    if (!player.isTall) {
      ctx.fillStyle = '#ff5a5f';
      for (const r of dynamicBarriers) ctx.fillRect(r.x, r.y, r.w, r.h);
    } else {
      // Hint outline when inactive
      ctx.strokeStyle = 'rgba(255,90,95,0.35)';
      ctx.lineWidth = 2;
      for (const r of dynamicBarriers) ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
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

  function render() {
    drawBackground();
    drawLevel();
    drawPlayer();
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
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') { setHeight(true); }
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') { setHeight(false); }
    if (e.code === 'Space' || e.key === ' ') { e.preventDefault(); attemptJump(); }
    if (e.key === 'r' || e.key === 'R') { start(); }
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { input.left = false; }
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { input.right = false; }
  });

  // Inputs: on-screen buttons
  bindHold(leftBtn, (down) => { input.left = down; });
  bindHold(rightBtn, (down) => { input.right = down; });
  bindTap(tallBtn, () => setHeight(true));
  bindTap(shortBtn, () => setHeight(false));
  if (jumpBtn) bindTap(jumpBtn, attemptJump);
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

  // Kick off
  start();
})();

