const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const aimControl = document.getElementById('aimControl');
const powerControl = document.getElementById('powerControl');
const curveControl = document.getElementById('curveControl');
const throwButton = document.getElementById('throwBall');
const resetButton = document.getElementById('resetGame');

const aimValue = document.getElementById('aimValue');
const powerValue = document.getElementById('powerValue');
const curveValue = document.getElementById('curveValue');
const frameLabel = document.getElementById('frameLabel');
const rollLabel = document.getElementById('rollLabel');
const pinsLabel = document.getElementById('pinsLabel');
const scoreLabel = document.getElementById('scoreLabel');
const scoreFrames = document.getElementById('scoreFrames');

const WIDTH = 900;
const HEIGHT = 560;
const LANE_TOP = 70;
const LANE_BOTTOM = HEIGHT - 48;
const PIN_RADIUS = 13;
const BALL_RADIUS = 16;
const MAX_FRAMES = 10;

const state = {
  isRolling: false,
  frameIndex: 0,
  shotInFrame: 0,
  frameRolls: [],
  pins: [],
  fallenPins: new Set(),
  animationFrameId: null,
  ballPosition: null,
  lastImpact: null,
};

function createPinRack() {
  const rows = [1, 2, 3, 4];
  const spacingX = 54;
  const spacingY = 42;
  const originX = WIDTH / 2;
  const originY = 150;
  const pins = [];
  let id = 0;

  rows.forEach((count, row) => {
    const rowWidth = spacingX * (count - 1);
    for (let index = 0; index < count; index += 1) {
      pins.push({
        id,
        x: originX - rowWidth / 2 + index * spacingX,
        y: originY + row * spacingY,
      });
      id += 1;
    }
  });

  return pins;
}

function resetGame() {
  state.isRolling = false;
  state.frameIndex = 0;
  state.shotInFrame = 0;
  state.frameRolls = Array.from({ length: MAX_FRAMES }, () => []);
  state.fallenPins = new Set();
  state.pins = createPinRack();
  state.ballPosition = null;
  state.lastImpact = null;
  if (state.animationFrameId) {
    cancelAnimationFrame(state.animationFrameId);
    state.animationFrameId = null;
  }
  syncControlLabels();
  updateUi();
  drawLane();
}

function syncControlLabels() {
  aimValue.textContent = `${Number(aimControl.value)}°`;
  powerValue.textContent = `${Number(powerControl.value)}%`;
  curveValue.textContent = `${Number(curveControl.value)}`;
}

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = WIDTH * dpr;
  canvas.height = HEIGHT * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawLane();
}

function drawLane() {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);

  const laneGradient = ctx.createLinearGradient(0, LANE_TOP, 0, LANE_BOTTOM);
  laneGradient.addColorStop(0, '#e0b172');
  laneGradient.addColorStop(1, '#a96a2c');

  ctx.fillStyle = '#4f3116';
  ctx.fillRect(95, 28, WIDTH - 190, HEIGHT - 56);
  ctx.fillStyle = laneGradient;
  ctx.fillRect(122, LANE_TOP, WIDTH - 244, LANE_BOTTOM - LANE_TOP);

  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  for (let line = 0; line < 5; line += 1) {
    const x = 150 + line * 150;
    ctx.beginPath();
    ctx.moveTo(x, LANE_TOP);
    ctx.lineTo(x, LANE_BOTTOM);
    ctx.stroke();
  }

  ctx.fillStyle = '#153555';
  ctx.fillRect(122, 36, WIDTH - 244, 56);

  drawPins();
  drawBall();
  drawLastImpact();
}

function drawPins() {
  state.pins.forEach((pin) => {
    const standing = !state.fallenPins.has(pin.id);
    ctx.save();
    ctx.translate(pin.x, pin.y);
    if (!standing) {
      ctx.rotate(1.2);
      ctx.globalAlpha = 0.55;
    }
    ctx.fillStyle = '#f8fbff';
    ctx.beginPath();
    ctx.roundRect(-10, -20, 20, 40, 8);
    ctx.fill();
    ctx.fillStyle = '#d5303e';
    ctx.fillRect(-10, -8, 20, 5);
    ctx.fillRect(-10, 0, 20, 5);
    ctx.restore();
  });
}

function drawBall() {
  const ball = state.ballPosition ?? { x: WIDTH / 2, y: HEIGHT - 80 };
  const gradient = ctx.createRadialGradient(ball.x - 4, ball.y - 4, 4, ball.x, ball.y, BALL_RADIUS);
  gradient.addColorStop(0, '#6dd0ff');
  gradient.addColorStop(1, '#1158d6');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, BALL_RADIUS, 0, Math.PI * 2);
  ctx.fill();
}

function drawLastImpact() {
  if (!state.lastImpact) {
    return;
  }

  ctx.save();
  ctx.strokeStyle = 'rgba(82, 210, 115, 0.65)';
  ctx.setLineDash([8, 6]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(state.lastImpact.x, state.lastImpact.y, 36, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function standingPinsCount() {
  return state.pins.length - state.fallenPins.size;
}

function formatRoll(frameIndex, rollIndex, rollValue) {
  const frame = state.frameRolls[frameIndex];
  if (rollValue === undefined) {
    return '';
  }

  if (frameIndex < MAX_FRAMES - 1) {
    if (rollIndex === 0 && rollValue === 10) {
      return 'X';
    }
    if (rollIndex === 1 && frame[0] + rollValue === 10) {
      return '/';
    }
  } else {
    if (rollValue === 10) {
      return 'X';
    }
    if (rollIndex > 0) {
      const previous = frame[rollIndex - 1];
      if (previous !== 10 && previous + rollValue === 10) {
        return '/';
      }
    }
  }

  return String(rollValue);
}

function computeScore(rolls = state.frameRolls.flat()) {
  let score = 0;
  let index = 0;

  for (let frame = 0; frame < MAX_FRAMES; frame += 1) {
    const first = rolls[index];
    if (first === undefined) {
      break;
    }

    if (first === 10) {
      const bonusOne = rolls[index + 1];
      const bonusTwo = rolls[index + 2];
      if (bonusOne === undefined || bonusTwo === undefined) {
        break;
      }
      score += 10 + bonusOne + bonusTwo;
      index += 1;
      continue;
    }

    const second = rolls[index + 1];
    if (second === undefined) {
      break;
    }

    if (first + second === 10) {
      const bonus = rolls[index + 2];
      if (bonus === undefined) {
        break;
      }
      score += 10 + bonus;
    } else {
      score += first + second;
    }

    index += 2;
  }

  return score;
}

function getFrameTotals() {
  const totals = [];
  const rolls = state.frameRolls.flat();
  let running = 0;
  let index = 0;

  for (let frame = 0; frame < MAX_FRAMES; frame += 1) {
    const first = rolls[index];
    if (first === undefined) {
      totals.push('');
      continue;
    }

    if (first === 10) {
      const bonusOne = rolls[index + 1];
      const bonusTwo = rolls[index + 2];
      if (bonusOne === undefined || bonusTwo === undefined) {
        totals.push('');
      } else {
        running += 10 + bonusOne + bonusTwo;
        totals.push(String(running));
      }
      index += 1;
      continue;
    }

    const second = rolls[index + 1];
    if (second === undefined) {
      totals.push('');
      continue;
    }

    if (first + second === 10) {
      const bonus = rolls[index + 2];
      if (bonus === undefined) {
        totals.push('');
      } else {
        running += 10 + bonus;
        totals.push(String(running));
      }
    } else {
      running += first + second;
      totals.push(String(running));
    }

    index += 2;
  }

  return totals;
}

function renderScoreboard() {
  const totals = getFrameTotals();
  scoreFrames.innerHTML = '';

  state.frameRolls.forEach((frame, frameIndex) => {
    const card = document.createElement('article');
    card.className = `frame${frameIndex === state.frameIndex && !isGameComplete() ? ' is-active' : ''}`;

    const frameNumber = document.createElement('div');
    frameNumber.className = 'frame-number';
    frameNumber.textContent = `Frame ${frameIndex + 1}`;

    const rolls = document.createElement('div');
    rolls.className = 'frame-rolls';
    const rollsToShow = frameIndex === MAX_FRAMES - 1 ? 3 : 2;
    for (let rollIndex = 0; rollIndex < rollsToShow; rollIndex += 1) {
      const slot = document.createElement('span');
      slot.textContent = formatRoll(frameIndex, rollIndex, frame[rollIndex]);
      rolls.appendChild(slot);
    }

    const total = document.createElement('div');
    total.className = 'frame-score';
    total.innerHTML = `<span>Total</span><span>${totals[frameIndex]}</span>`;

    card.append(frameNumber, rolls, total);
    scoreFrames.appendChild(card);
  });
}

function updateUi() {
  frameLabel.textContent = String(Math.min(state.frameIndex + 1, MAX_FRAMES));
  rollLabel.textContent = state.frameIndex >= MAX_FRAMES ? '—' : String(state.shotInFrame + 1);
  pinsLabel.textContent = String(standingPinsCount());
  scoreLabel.textContent = String(computeScore());
  throwButton.disabled = state.isRolling || isGameComplete();
  throwButton.textContent = isGameComplete() ? 'Game Over' : 'Throw Ball';
  renderScoreboard();
}

function isGameComplete() {
  return state.frameIndex >= MAX_FRAMES;
}

function resetRackForNextFrame() {
  state.fallenPins = new Set();
  state.lastImpact = null;
}

function advanceFrameIfNeeded(pinsDown) {
  const frame = state.frameRolls[state.frameIndex];
  const isTenth = state.frameIndex === MAX_FRAMES - 1;
  const remaining = standingPinsCount();

  if (!isTenth) {
    if (state.shotInFrame === 0 && pinsDown === 10) {
      state.frameIndex += 1;
      state.shotInFrame = 0;
      resetRackForNextFrame();
      return;
    }

    if (state.shotInFrame === 1) {
      state.frameIndex += 1;
      state.shotInFrame = 0;
      resetRackForNextFrame();
      return;
    }

    state.shotInFrame = 1;
    return;
  }

  const [first = 0, second = 0] = frame;
  if (state.shotInFrame === 0) {
    state.shotInFrame = 1;
    if (pinsDown === 10) {
      resetRackForNextFrame();
    }
    return;
  }

  if (state.shotInFrame === 1) {
    const earnsFillBall = first === 10 || first + second === 10;
    if (earnsFillBall) {
      state.shotInFrame = 2;
      if (remaining === 0 || first === 10) {
        resetRackForNextFrame();
      }
    } else {
      state.frameIndex += 1;
    }
    return;
  }

  state.frameIndex += 1;
}

function knockPins(impactX, impactY, power, curve) {
  const hitPins = [];
  const reachableRadius = 52 + power * 0.18;

  state.pins.forEach((pin) => {
    if (state.fallenPins.has(pin.id)) {
      return;
    }
    const distance = Math.hypot(pin.x - impactX, pin.y - impactY);
    const curveBoost = 1 - Math.min(0.28, Math.abs(curve) / 180);
    const threshold = reachableRadius * curveBoost;
    if (distance <= threshold) {
      hitPins.push(pin);
    }
  });

  const toFall = new Set(hitPins.map((pin) => pin.id));
  hitPins.forEach((pin) => {
    state.pins.forEach((candidate) => {
      if (state.fallenPins.has(candidate.id) || toFall.has(candidate.id)) {
        return;
      }
      const distance = Math.hypot(pin.x - candidate.x, pin.y - candidate.y);
      if (distance < 58 && Math.random() < power / 120) {
        toFall.add(candidate.id);
      }
    });
  });

  if (toFall.size === 0) {
    const nearest = state.pins
      .filter((pin) => !state.fallenPins.has(pin.id))
      .map((pin) => ({ pin, distance: Math.hypot(pin.x - impactX, pin.y - impactY) }))
      .sort((left, right) => left.distance - right.distance)[0];
    if (nearest && nearest.distance < reachableRadius * 1.2 && power > 85) {
      toFall.add(nearest.pin.id);
    }
  }

  toFall.forEach((id) => state.fallenPins.add(id));
  return toFall.size;
}

function recordRoll(pinsDown) {
  state.frameRolls[state.frameIndex].push(pinsDown);
}

function releaseBall() {
  if (state.isRolling || isGameComplete()) {
    return;
  }

  state.isRolling = true;
  state.lastImpact = null;
  updateUi();

  const aim = Number(aimControl.value);
  const power = Number(powerControl.value);
  const curve = Number(curveControl.value);

  const start = performance.now();
  const duration = 1500 - power * 5;
  const startX = WIDTH / 2;
  const endX = WIDTH / 2 + aim * 4.3 + curve * 1.4;
  const endY = 198;

  const animate = (timestamp) => {
    const progress = Math.min((timestamp - start) / duration, 1);
    const eased = 1 - (1 - progress) ** 3;
    const curveOffset = Math.sin(progress * Math.PI) * curve * 3.2;
    const x = startX + (endX - startX) * eased + curveOffset;
    const y = HEIGHT - 80 - (HEIGHT - 278) * eased;

    state.ballPosition = { x, y };
    drawLane();

    if (progress < 1) {
      state.animationFrameId = requestAnimationFrame(animate);
      return;
    }

    const impactY = endY;
    state.lastImpact = { x, y: impactY };
    const pinsDown = knockPins(x, impactY, power, curve);
    recordRoll(pinsDown);
    advanceFrameIfNeeded(pinsDown);

    state.ballPosition = null;
    state.isRolling = false;
    updateUi();
    drawLane();
  };

  state.animationFrameId = requestAnimationFrame(animate);
}

[aimControl, powerControl, curveControl].forEach((control) => {
  control.addEventListener('input', syncControlLabels);
});

throwButton.addEventListener('click', releaseBall);
resetButton.addEventListener('click', resetGame);
window.addEventListener('resize', resizeCanvas);

resetGame();
resizeCanvas();
