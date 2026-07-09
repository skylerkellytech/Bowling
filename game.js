(function () {
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const scoreboard = document.getElementById("scoreboard");
  const statusText = document.getElementById("statusText");
  const curveReadout = document.getElementById("curveReadout");
  const meterFill = document.getElementById("meterFill");
  const rollButton = document.getElementById("rollButton");
  const curveButton = document.getElementById("curveButton");
  const restartButton = document.getElementById("restartButton");

  const lane = {
    top: 58,
    bottom: 510,
    leftBottom: 145,
    rightBottom: 755,
    leftTop: 290,
    rightTop: 610,
    gutterOffset: 56,
  };

  const pinLayout = [
    { x: 0, y: 0, row: 0 },
    { x: -22, y: 22, row: 1 },
    { x: 22, y: 22, row: 1 },
    { x: -44, y: 44, row: 2 },
    { x: 0, y: 44, row: 2 },
    { x: 44, y: 44, row: 2 },
    { x: -66, y: 66, row: 3 },
    { x: -22, y: 66, row: 3 },
    { x: 22, y: 66, row: 3 },
    { x: 66, y: 66, row: 3 },
  ];

  const deckOrigin = { x: 450, y: 118 };
  const pinRadius = 9;
  const CURVE_INPUT_SCALE_FACTOR = 0.95;
  const CURVE_METER_FREQUENCY = 10;
  const PIN_CHAIN_REACTION_RANGE = 120;
  const PIN_CHAIN_REACTION_BASE_CHANCE = 0.66;
  const PIN_IMPACT_ASSIST = 0.32;
  const PIN_IMPACT_ASSIST_RANGE = 240;
  const EXPLOSION_PARTICLE_COUNT = 18;
  const MAX_DELTA_TIME = 0.033;

  const state = createInitialState();

  function createInitialState() {
    return {
      frames: Array.from({ length: 10 }, () => ({ rolls: [] })),
      currentFrame: 0,
      standingPins: Array(10).fill(true),
      explosions: [],
      ball: resetBall(),
      qte: { active: false, timer: 0, duration: 1.2, value: 0, locked: false },
      postRollTimer: 0,
      gameOver: false,
      lastTime: 0,
      animationFrame: null,
      message: "Move with ← → and press Enter or Roll Ball.",
    };
  }

  function resetBall() {
    return {
      x: 450,
      y: lane.bottom - 24,
      radius: 17,
      speed: 0,
      rolling: false,
      curve: 0,
      targetCurve: 0,
      resolved: false,
    };
  }

  function resetForNewGame() {
    cancelAnimationFrame(state.animationFrame);
    Object.assign(state, createInitialState());
    renderScoreboard();
    updateStatus();
    syncButtons();
    state.animationFrame = requestAnimationFrame(loop);
  }

  function getPinPosition(index) {
    const pin = pinLayout[index];
    return { x: deckOrigin.x + pin.x, y: deckOrigin.y + pin.y };
  }

  function getLaneEdges(y) {
    const t = (y - lane.top) / (lane.bottom - lane.top);
    const left = lane.leftTop + (lane.leftBottom - lane.leftTop) * t;
    const right = lane.rightTop + (lane.rightBottom - lane.rightTop) * t;
    return { left, right };
  }

  function currentFrameState() {
    return state.frames[state.currentFrame];
  }

  function currentRollNumber() {
    return currentFrameState().rolls.length;
  }

  function pinsStandingCount() {
    return state.standingPins.filter(Boolean).length;
  }

  function updateStatus(message) {
    if (message) {
      state.message = message;
    }
    statusText.textContent = state.gameOver
      ? `Game over! Final score: ${getRunningTotals().filter((value) => value !== null).pop() ?? 0}`
      : state.message;
  }

  function syncButtons() {
    const canRoll = !state.gameOver && !state.ball.rolling && state.postRollTimer <= 0;
    rollButton.disabled = !canRoll;
    curveButton.disabled = !state.qte.active || state.qte.locked;
  }

  function renderScoreboard() {
    const totals = getRunningTotals();

    scoreboard.innerHTML = state.frames
      .map((frame, index) => {
        const active = !state.gameOver && index === state.currentFrame ? " active" : "";
        const rolls = formatFrameRolls(index, frame.rolls);
        const boxCount = index === 9 ? 3 : 2;
        const rollBoxes = Array.from({ length: boxCount }, (_, boxIndex) => {
          return `<span class="roll-box">${rolls[boxIndex] ?? ""}</span>`;
        }).join("");

        return `
          <article class="frame${active}">
            <div class="frame-header">
              <span>Frame ${index + 1}</span>
              <span>${index === 9 ? "Final" : ""}</span>
            </div>
            <div class="frame-rolls">${rollBoxes}</div>
            <div class="frame-total">
              <span>Total</span>
              <span>${totals[index] ?? ""}</span>
            </div>
          </article>
        `;
      })
      .join("");
  }

  function formatFrameRolls(frameIndex, rolls) {
    if (frameIndex < 9) {
      const first = rolls[0];
      const second = rolls[1];
      return [
        first === 10 ? "X" : first ?? "",
        first === 10 ? "" : first != null && second != null && first + second === 10 ? "/" : second ?? "",
      ];
    }

    return rolls.map((roll, index) => {
      if (roll === 10) {
        return "X";
      }

      if (index > 0) {
        const previous = rolls[index - 1];
        const priorFrameWasStrike = index === 1 && rolls[0] === 10;
        if (roll + previous === 10 && !priorFrameWasStrike) {
          return "/";
        }
      }

      return roll ?? "";
    });
  }

  function getRunningTotals() {
    const rolls = state.frames.flatMap((frame) => frame.rolls);
    const totals = [];
    let total = 0;
    let rollIndex = 0;

    for (let frameIndex = 0; frameIndex < 10; frameIndex += 1) {
      const frameRolls = state.frames[frameIndex].rolls;

      if (frameIndex < 9) {
        if (frameRolls.length === 0) {
          totals.push(null);
          continue;
        }

        if (frameRolls[0] === 10) {
          if (rolls[rollIndex + 1] == null || rolls[rollIndex + 2] == null) {
            totals.push(null);
          } else {
            total += 10 + rolls[rollIndex + 1] + rolls[rollIndex + 2];
            totals.push(total);
          }
          rollIndex += 1;
          continue;
        }

        if (frameRolls.length < 2) {
          totals.push(null);
          rollIndex += frameRolls.length;
          continue;
        }

        const frameScore = frameRolls[0] + frameRolls[1];
        if (frameScore === 10) {
          if (rolls[rollIndex + 2] == null) {
            totals.push(null);
          } else {
            total += 10 + rolls[rollIndex + 2];
            totals.push(total);
          }
        } else {
          total += frameScore;
          totals.push(total);
        }
        rollIndex += 2;
      } else {
        if (
          frameRolls.length < 2 ||
          ((frameRolls[0] === 10 || frameRolls[0] + frameRolls[1] === 10) && frameRolls.length < 3)
        ) {
          totals.push(null);
        } else {
          total += frameRolls.reduce((sum, roll) => sum + roll, 0);
          totals.push(total);
        }
      }
    }

    return totals;
  }

  function startRoll() {
    if (state.gameOver || state.ball.rolling || state.postRollTimer > 0) {
      return;
    }

    state.ball.rolling = true;
    state.ball.speed = 350;
    state.ball.curve = 0;
    state.ball.targetCurve = 0;
    state.ball.resolved = false;
    state.qte.active = true;
    state.qte.timer = 0;
    state.qte.value = 0;
    state.qte.locked = false;

    updateStatus("Quick action! Press Space or Lock Curve to set your hook.");
    syncButtons();
  }

  function lockCurve() {
    if (!state.qte.active || state.qte.locked) {
      return;
    }

    state.qte.locked = true;
    state.qte.active = false;
    state.ball.targetCurve = Number((state.qte.value * CURVE_INPUT_SCALE_FACTOR).toFixed(2));
    updateCurveReadout(state.ball.targetCurve);
    updateStatus(
      Math.abs(state.ball.targetCurve) < 0.1
        ? "Straight shot locked in."
        : `${state.ball.targetCurve < 0 ? "Left" : "Right"} curve locked in.`
    );
    syncButtons();
  }

  function updateCurveReadout(value) {
    if (!state.qte.active && Math.abs(value) < 0.1) {
      curveReadout.textContent = "Straight";
      return;
    }

    if (value < -0.15) {
      curveReadout.textContent = `Hook Left ${Math.round(Math.abs(value) * 100)}%`;
    } else if (value > 0.15) {
      curveReadout.textContent = `Hook Right ${Math.round(Math.abs(value) * 100)}%`;
    } else {
      curveReadout.textContent = "Straight";
    }
  }

  function updateMeter(value) {
    meterFill.style.left = `${50 + value * 47}%`;
    updateCurveReadout(value);
  }

  function finishQteIfNeeded() {
    if (state.qte.active && state.qte.timer >= state.qte.duration) {
      lockCurve();
    }
  }

  function updateBall(dt) {
    if (!state.ball.rolling) {
      return;
    }

    if (state.qte.active) {
      state.qte.timer += dt;
      state.qte.value = Math.sin(state.qte.timer * CURVE_METER_FREQUENCY);
      updateMeter(state.qte.value);
      finishQteIfNeeded();
    }

    state.ball.curve += (state.ball.targetCurve - state.ball.curve) * Math.min(1, dt * 2.8);
    const progress = Math.max(0, Math.min(1, (lane.bottom - state.ball.y) / (lane.bottom - lane.top)));
    state.ball.x += state.ball.curve * (55 + progress * 105) * dt;
    state.ball.y -= state.ball.speed * dt;

    const edges = getLaneEdges(state.ball.y);
    state.ball.x = Math.max(edges.left + state.ball.radius, Math.min(edges.right - state.ball.radius, state.ball.x));

    if (state.ball.y <= deckOrigin.y + 88 && !state.ball.resolved) {
      resolveImpact();
    }
  }

  function resolveImpact() {
    state.ball.resolved = true;
    state.ball.rolling = false;
    state.postRollTimer = 1.15;
    const fallenPins = calculatePinsDown();

    fallenPins.forEach((pinIndex) => {
      state.standingPins[pinIndex] = false;
      spawnExplosion(getPinPosition(pinIndex));
    });

    const pinsDown = fallenPins.length;
    recordRoll(pinsDown);
    updateStatus(pinsDown ? `${pinsDown} pins explode off the deck!` : "No pins down. Reset and try the spare.");
    syncButtons();
  }

  function calculatePinsDown() {
    const impactPoint = {
      x: state.ball.x + state.ball.curve * 22,
      y: deckOrigin.y + 8,
    };

    const standing = state.standingPins
      .map((isStanding, index) => ({ isStanding, index, position: getPinPosition(index) }))
      .filter((pin) => pin.isStanding);

    const primaryHits = standing
      .filter((pin) => distance(pin.position, impactPoint) < 38)
      .map((pin) => pin.index);

    if (primaryHits.length === 0) {
      const closest = standing
        .map((pin) => ({ ...pin, distance: distance(pin.position, impactPoint) }))
        .sort((a, b) => a.distance - b.distance)[0];
      if (!closest || closest.distance > 64) {
        return [];
      }
      primaryHits.push(closest.index);
    }

    const fallen = new Set(primaryHits);
    const queue = [...primaryHits];

    while (queue.length > 0) {
      const sourceIndex = queue.shift();
      const sourcePosition = getPinPosition(sourceIndex);

      standing.forEach((pin) => {
        if (fallen.has(pin.index)) {
          return;
        }

        const relation = distance(sourcePosition, pin.position);
        const impactDistance = distance(pin.position, impactPoint);
        const forwardBonus = pin.position.y >= sourcePosition.y ? 0.12 : 0.03;
        const chance =
          PIN_CHAIN_REACTION_BASE_CHANCE -
          relation / PIN_CHAIN_REACTION_RANGE +
          forwardBonus +
          Math.max(0, PIN_IMPACT_ASSIST - impactDistance / PIN_IMPACT_ASSIST_RANGE);

        if (Math.random() < chance) {
          fallen.add(pin.index);
          queue.push(pin.index);
        }
      });
    }

    return Array.from(fallen);
  }

  function recordRoll(pinsDown) {
    const frame = currentFrameState();
    frame.rolls.push(pinsDown);
    renderScoreboard();

    if (state.currentFrame < 9) {
      if (pinsDown === 10 && frame.rolls.length === 1) {
        advanceFrame();
        return;
      }

      if (frame.rolls.length === 2) {
        advanceFrame();
        return;
      }

      prepareNextShot(false);
      return;
    }

    handleTenthFrame();
  }

  function handleTenthFrame() {
    const frame = currentFrameState();

    if (frame.rolls.length === 1) {
      prepareNextShot(frame.rolls[0] === 10);
      return;
    }

    if (frame.rolls.length === 2) {
      const earnedFillBall = frame.rolls[0] === 10 || frame.rolls[0] + frame.rolls[1] === 10;
      if (!earnedFillBall) {
        endGame();
        return;
      }

      prepareNextShot(true);
      return;
    }

    endGame();
  }

  function prepareNextShot(resetPins) {
    if (resetPins) {
      state.standingPins = Array(10).fill(true);
    }

    state.ball = resetBall();
    state.qte.active = false;
    state.qte.locked = false;
    state.qte.value = 0;
    updateMeter(0);
    syncButtons();
  }

  function advanceFrame() {
    if (state.currentFrame >= 9) {
      endGame();
      return;
    }

    state.currentFrame += 1;
    state.standingPins = Array(10).fill(true);
    state.ball = resetBall();
    state.qte.active = false;
    state.qte.locked = false;
    state.qte.value = 0;
    updateMeter(0);
    renderScoreboard();
    syncButtons();
  }

  function endGame() {
    state.gameOver = true;
    state.ball = resetBall();
    state.qte.active = false;
    state.qte.locked = false;
    state.qte.value = 0;
    updateMeter(0);
    renderScoreboard();
    updateStatus();
    syncButtons();
  }

  function spawnExplosion(position) {
    for (let index = 0; index < EXPLOSION_PARTICLE_COUNT; index += 1) {
      const angle = (Math.PI * 2 * index) / EXPLOSION_PARTICLE_COUNT + Math.random() * 0.2;
      const speed = 85 + Math.random() * 130;
      state.explosions.push({
        x: position.x,
        y: position.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 4 + Math.random() * 4,
        life: 0.65 + Math.random() * 0.35,
        age: 0,
        hue: 18 + Math.random() * 48,
      });
    }
  }

  function updateExplosions(dt) {
    state.explosions = state.explosions.filter((particle) => {
      particle.age += dt;
      if (particle.age >= particle.life) {
        return false;
      }

      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 145 * dt;
      particle.vx *= 0.985;
      return true;
    });
  }

  function maybeAdvanceAfterDelay(dt) {
    if (state.postRollTimer <= 0) {
      return;
    }

    state.postRollTimer -= dt;
    if (state.postRollTimer > 0) {
      return;
    }

    if (!state.gameOver) {
      if (state.currentFrame === 9) {
        const frame = currentFrameState();
        if (frame.rolls.length === 1) {
          updateStatus(frame.rolls[0] === 10 ? "Strike! Bonus balls stay alive in frame 10." : "Final frame spare attempt.");
        } else if (frame.rolls.length === 2) {
          updateStatus("Bonus ball time!");
        }
      } else {
        updateStatus("Line up your next roll.");
      }
    }
  }

  function drawLane() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#0d1730";
    ctx.fillRect(0, 0, canvas.width, 78);

    ctx.fillStyle = "rgba(255,255,255,0.08)";
    for (let board = 0; board < 11; board += 1) {
      const x = 190 + board * 46;
      ctx.fillRect(x, 78, 4, 430);
    }

    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.beginPath();
    ctx.moveTo(lane.leftBottom, lane.bottom);
    ctx.lineTo(lane.leftTop, lane.top);
    ctx.lineTo(lane.rightTop, lane.top);
    ctx.lineTo(lane.rightBottom, lane.bottom);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#6b431d";
    ctx.beginPath();
    ctx.moveTo(lane.leftBottom - lane.gutterOffset, lane.bottom);
    ctx.lineTo(lane.leftTop - 38, lane.top);
    ctx.lineTo(lane.leftTop, lane.top);
    ctx.lineTo(lane.leftBottom, lane.bottom);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(lane.rightBottom + lane.gutterOffset, lane.bottom);
    ctx.lineTo(lane.rightTop + 38, lane.top);
    ctx.lineTo(lane.rightTop, lane.top);
    ctx.lineTo(lane.rightBottom, lane.bottom);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(lane.leftBottom, lane.bottom);
    ctx.lineTo(lane.leftTop, lane.top);
    ctx.moveTo(lane.rightBottom, lane.bottom);
    ctx.lineTo(lane.rightTop, lane.top);
    ctx.stroke();

    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(lane.leftBottom, 432);
    ctx.lineTo(lane.rightBottom, 432);
    ctx.stroke();

    ctx.fillStyle = "rgba(255,255,255,0.75)";
    [[390, 308], [450, 308], [510, 308], [420, 236], [480, 236], [450, 192]].forEach(([x, y]) => {
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawPins() {
    state.standingPins.forEach((isStanding, index) => {
      if (!isStanding) {
        return;
      }

      const pin = getPinPosition(index);
      ctx.fillStyle = "#fff8f5";
      ctx.strokeStyle = "#b3b9c7";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(pin.x, pin.y, 10, 16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#e13a44";
      ctx.fillRect(pin.x - 10, pin.y - 3, 20, 3);
    });
  }

  function drawBall() {
    const shadowY = Math.min(lane.bottom, state.ball.y + 12);
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.beginPath();
    ctx.ellipse(state.ball.x, shadowY, state.ball.radius + 4, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    const gradient = ctx.createRadialGradient(
      state.ball.x - 6,
      state.ball.y - 8,
      2,
      state.ball.x,
      state.ball.y,
      state.ball.radius + 5
    );
    gradient.addColorStop(0, "#8be4ff");
    gradient.addColorStop(0.45, "#277ac2");
    gradient.addColorStop(1, "#0a2f62");

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(state.ball.x, state.ball.y, state.ball.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.75)";
    [[-4, -5], [0, 0], [5, -3]].forEach(([dx, dy]) => {
      ctx.beginPath();
      ctx.arc(state.ball.x + dx, state.ball.y + dy, 2.2, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawExplosions() {
    state.explosions.forEach((particle) => {
      const alpha = 1 - particle.age / particle.life;
      ctx.fillStyle = `hsla(${particle.hue}, 100%, 60%, ${alpha})`;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size * alpha, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawFrameInfo() {
    const frameLabel = `Frame ${state.currentFrame + 1}`;
    const rollLabel = `Roll ${currentRollNumber() + 1}`;
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "bold 24px Arial";
    ctx.fillText(frameLabel, 30, 42);
    ctx.font = "18px Arial";
    ctx.fillText(rollLabel, 780, 42);
    ctx.fillText(`Pins standing: ${pinsStandingCount()}`, 350, 42);
  }

  function loop(timestamp) {
    const dt = Math.min(MAX_DELTA_TIME, (timestamp - state.lastTime) / 1000 || 0);
    state.lastTime = timestamp;

    updateBall(dt);
    updateExplosions(dt);
    maybeAdvanceAfterDelay(dt);

    drawLane();
    drawPins();
    drawExplosions();
    drawBall();
    drawFrameInfo();

    state.animationFrame = requestAnimationFrame(loop);
  }

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft" && !state.ball.rolling && state.postRollTimer <= 0 && !state.gameOver) {
      state.ball.x = Math.max(lane.leftBottom + 30, state.ball.x - 26);
    } else if (event.key === "ArrowRight" && !state.ball.rolling && state.postRollTimer <= 0 && !state.gameOver) {
      state.ball.x = Math.min(lane.rightBottom - 30, state.ball.x + 26);
    } else if (event.key === "Enter") {
      startRoll();
    } else if (event.code === "Space") {
      event.preventDefault();
      lockCurve();
    }
  });

  rollButton.addEventListener("click", startRoll);
  curveButton.addEventListener("click", lockCurve);
  restartButton.addEventListener("click", resetForNewGame);

  renderScoreboard();
  updateMeter(0);
  updateStatus("Move with ← → and press Enter or Roll Ball.");
  syncButtons();
  state.animationFrame = requestAnimationFrame(loop);
})();
