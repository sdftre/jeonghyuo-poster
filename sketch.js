new p5((p) => {
  // ── 화면과 저장 설정 ──────────────────
  const POSTER_WIDTH = 1080;
  const POSTER_HEIGHT = 2160;
  const EXPORT_FPS = 30;

  // ── 등장 설정 ─────────────────────────
  const TOTAL_PLAYS = 16;
  const INITIAL_BURST_DURATION = 0.5;

  const QUICK_CHANCE = 0.3;
  const QUICK_INTERVAL = [0.18, 0.45];
  const NORMAL_INTERVAL = [1.05, 1.85];

  const MAX_ACTIVE = 6;

  // ── 그래픽 설정 ───────────────────────
  const MAX_SIDES = 16;
  const STEPS = MAX_SIDES - 3;
  const FIRST_DURATION = 0.28;
  const LAST_DURATION = 0.07;

  const FADE_DURATION = 0.8;
  const CIRCLE_FINISH = 0.06;
  const COLOR_TURN_TIME = 2.5;

  const SHAPE_LINE_WIDTH = 0.2;
  const MARKER_LINE_WIDTH = 0.5;

  // 검정 채움의 시간에 따른 불투명도
  const DARK_FILL_OPACITY = 0.5;
  const LIGHT_FILL_OPACITY = 0.2;

  const TAU = Math.PI * 2;
  const TOP = -Math.PI / 2;

  const STRAIGHT_LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];

  const timeRatio = Math.pow(
    LAST_DURATION / FIRST_DURATION,
    1 / (STEPS - 1)
  );

  // 기존 24단계 버전의 총 변형 시간은 유지합니다.
  const previousRatio = Math.pow(LAST_DURATION / FIRST_DURATION, 1 / 23);
  const MORPH_DURATION = FIRST_DURATION *
    (1 - Math.pow(previousRatio, 24)) / (1 - previousRatio);
  const rawDuration = FIRST_DURATION *
    (1 - Math.pow(timeRatio, STEPS)) / (1 - timeRatio);
  const durationScale = MORPH_DURATION / rawDuration;

  let posterCanvas;
  let stages = [];
  let finalPolygon = [];

  let morphEndTime = 0;
  let singleDuration = 0;

  let schedule = [];
  let totalDuration = 0;
  let startedAt = 0;

  let activeRecorder = null;
  let isRecording = false;
  let stopQueued = false;

  const mix = (a, b, t) => a + (b - a) * t;
  const clamp = (t) => Math.max(0, Math.min(1, t));
  const smooth = (t) => t * t * (3 - 2 * t);
  const modulo = (a, b) => ((a % b) + b) % b;
  const cross2D = (a, b) => a.x * b.y - a.y * b.x;

  p.setup = () => {
    p.pixelDensity(1);
    posterCanvas = p.createCanvas(
      POSTER_WIDTH,
      POSTER_HEIGHT
    );

    p.frameRate(60);
    p.strokeJoin(p.ROUND);
    p.strokeCap(p.SQUARE);

    fitPreview();
    buildAnimation();
    restart();
  };

  // 표시 크기만 조절해 내부 좌표와 출력 해상도를 유지합니다.
  function fitPreview() {
    const scale = Math.min(
      window.innerWidth / POSTER_WIDTH,
      window.innerHeight / POSTER_HEIGHT
    ) * 0.96;

    Object.assign(posterCanvas.elt.style, {
      width: `${POSTER_WIDTH * scale}px`,
      height: `${POSTER_HEIGHT * scale}px`,
      position: "fixed",
      left: "50%",
      top: "50%",
      transform: "translate(-50%, -50%)",
      display: "block"
    });
  }

  p.draw = () => {
    p.background(255);

    const elapsed = (p.millis() - startedAt) / 1000;

    if (elapsed >= totalDuration) {
      finishRecording();
      p.noLoop();
      return;
    }

    const gridSize = Math.min(p.width, p.height) * 0.92;
    const cellSize = gridSize / 3;

    const left = (p.width - gridSize) / 2;
    const top = (p.height - gridSize) / 2;
    const radius = cellSize * 0.28;

    for (const animation of schedule) {
      if (
        elapsed < animation.start ||
        elapsed >= animation.end
      ) {
        continue;
      }

      const age = elapsed - animation.start;
      const state = getAnimationState(age);

      const column = animation.cell % 3;
      const row = Math.floor(animation.cell / 3);

      drawGraphic(
        left + (column + 0.5) * cellSize,
        top + (row + 0.5) * cellSize,
        radius,
        state
      );
    }
  };

  // ── 불규칙한 등장 일정 ────────────────
  function buildSchedule() {
    schedule = [];

    let active = [];
    let nextStart = 0;

    const weights = [
      p.random(0.7, 1.3),
      p.random(0.7, 1.3),
      p.random(0.7, 1.3)
    ];

    const weightSum = weights.reduce(
      (sum, value) => sum + value,
      0
    );

    const burstTimes = [
      0,
      INITIAL_BURST_DURATION * weights[0] / weightSum,
      INITIAL_BURST_DURATION *
        (weights[0] + weights[1]) / weightSum,
      INITIAL_BURST_DURATION
    ];

    for (let i = 0; i < TOTAL_PLAYS; i++) {
      if (i < 4) {
        nextStart = burstTimes[i];
      } else {
        nextStart += randomStartInterval();
      }

      active = active.filter(a => a.end > nextStart);

      if (active.length >= MAX_ACTIVE) {
        nextStart = Math.max(
          nextStart,
          Math.min(...active.map(a => a.end)) +
            p.random(0.06, 0.22)
        );

        active = active.filter(a => a.end > nextStart);
      }

      const activeCells = active.map(a => a.cell);
      const lastEndByCell = Array(9).fill(-Infinity);

      for (const animation of schedule) {
        lastEndByCell[animation.cell] = animation.end;
      }

      const freeCells = [];

      for (let cell = 0; cell < 9; cell++) {
        if (!activeCells.includes(cell)) {
          freeCells.push(cell);
        }
      }

      const restedCells = freeCells.filter(
        cell => nextStart - lastEndByCell[cell] >= 0.6
      );

      const candidates = restedCells.length
        ? restedCells
        : freeCells;

      const cell = chooseSpreadCell(
        candidates,
        activeCells
      );

      const animation = {
        cell,
        start: nextStart,
        end: nextStart + singleDuration
      };

      schedule.push(animation);
      active.push(animation);
    }

    totalDuration = Math.max(
      ...schedule.map(a => a.end)
    );
  }

  function randomStartInterval() {
    const range = p.random() < QUICK_CHANCE
      ? QUICK_INTERVAL
      : NORMAL_INTERVAL;

    return p.random(range[0], range[1]);
  }

  function chooseSpreadCell(candidates, activeCells) {
    let bestScore = Infinity;
    let bestCandidates = [];

    for (const candidate of candidates) {
      const cells = [...activeCells, candidate];
      const occupied = new Set(cells);

      const rows = [0, 0, 0];
      const columns = [0, 0, 0];

      for (const cell of cells) {
        rows[Math.floor(cell / 3)]++;
        columns[cell % 3]++;
      }

      const completedLines = STRAIGHT_LINES.filter(
        line => line.every(cell => occupied.has(cell))
      ).length;

      let overlap = 0;

      for (let i = 0; i < 3; i++) {
        overlap += rows[i] * (rows[i] - 1) / 2;
        overlap += columns[i] * (columns[i] - 1) / 2;
      }

      const score = completedLines * 100 + overlap;

      if (score < bestScore) {
        bestScore = score;
        bestCandidates = [candidate];
      } else if (score === bestScore) {
        bestCandidates.push(candidate);
      }
    }

    return bestCandidates[
      Math.floor(p.random(bestCandidates.length))
    ];
  }

  // ── 도형 애니메이션 ───────────────────
  function buildAnimation() {
    stages = [];

    let time = 0;
    let polygon = makePolygon(3, TOP - Math.PI / 3);

    for (let i = 0; i < STEPS; i++) {
      const angle = TOP + TAU * i / STEPS;
      const sides = polygon.length;

      const from = addVertex(polygon, angle);
      const to = makePolygon(sides + 1, angle);

      const duration =
        FIRST_DURATION * Math.pow(timeRatio, i) * durationScale;

      stages.push({
        sides,
        from,
        to,
        angle,
        start: time,
        end: time + duration,
        duration
      });

      time += duration;
      polygon = to;
    }

    finalPolygon = polygon;
    morphEndTime = time;
    singleDuration = morphEndTime + FADE_DURATION;
  }

  function getAnimationState(elapsed) {
    let points;
    let markerAngle;
    let bandCount;
    let opacity = 1;

    if (elapsed < morphEndTime) {
      const stage = stages.find(s => elapsed < s.end);

      const progress = clamp(
        (elapsed - stage.start) / stage.duration
      );

      points = stage.from.map((point, i) => ({
        x: mix(point.x, stage.to[i].x, progress),
        y: mix(point.y, stage.to[i].y, progress)
      }));

      markerAngle = stage.angle;
      bandCount = stage.sides;
    } else {
      const finishElapsed = elapsed - morphEndTime;

      const fade = clamp(
        finishElapsed / FADE_DURATION
      );
      const rounding = clamp(
        finishElapsed / CIRCLE_FINISH
      );

      opacity = 1 - smooth(fade);
      bandCount = finalPolygon.length;
      points = makeFinalOutline(rounding);

      markerAngle = mix(
        stages[stages.length - 1].angle,
        TOP + TAU,
        rounding
      );
    }

    const colorProgress = elapsed <= COLOR_TURN_TIME
      ? clamp(elapsed / COLOR_TURN_TIME)
      : 1 - clamp(
          (elapsed - COLOR_TURN_TIME) /
          (singleDuration - COLOR_TURN_TIME)
        );

    const fillOpacity = mix(
      DARK_FILL_OPACITY,
      LIGHT_FILL_OPACITY,
      colorProgress
    );

    const direction = {
      x: Math.cos(markerAngle),
      y: Math.sin(markerAngle)
    };

    return {
      points,
      bandCount,
      opacity,
      fillOpacity,
      direction,
      boundary: boundaryDistance(points, direction)
    };
  }

  function drawGraphic(centerX, centerY, radius, state) {
    p.push();
    p.translate(centerX, centerY);
    p.noStroke();

    for (let band = state.bandCount; band >= 1; band--) {
      const scale = band / state.bandCount;

      const bandOpacity =
        1 - 0.8 * (band - 1) / (state.bandCount - 1);

      const alpha = bandOpacity * state.fillOpacity * state.opacity;

      // 흰 배경에 검정을 합성한 값으로 채워 중첩을 방지합니다.
      p.fill(mix(255, 0, alpha));

      drawPolygon(state.points, radius * scale);
    }

    p.noFill();
    p.stroke(0, 255 * state.opacity);

    p.strokeWeight(SHAPE_LINE_WIDTH);
    drawPolygon(state.points, radius);

    p.strokeWeight(MARKER_LINE_WIDTH);

    const markerLength = radius / 3;
    const gap = markerLength / 2;
    const inner = state.boundary * radius + gap;
    const outer = inner + markerLength;

    p.line(
      state.direction.x * inner,
      state.direction.y * inner,
      state.direction.x * outer,
      state.direction.y * outer
    );

    p.pop();
  }

  function makePolygon(count, firstAngle) {
    return Array.from({ length: count }, (_, i) => {
      const angle = firstAngle + TAU * i / count;

      return {
        x: Math.cos(angle),
        y: Math.sin(angle)
      };
    });
  }

  function addVertex(polygon, angle) {
    const count = polygon.length;
    const sector = TAU / count;

    const firstAngle = Math.atan2(
      polygon[0].y,
      polygon[0].x
    );

    let relative = modulo(angle - firstAngle, TAU);

    if (relative < 1e-9 || TAU - relative < 1e-9) {
      relative = 0;
    }

    const edgeIndex = Math.min(
      count - 1,
      Math.floor(relative / sector)
    );

    const middleAngle =
      firstAngle + (edgeIndex + 0.5) * sector;

    const distance =
      Math.cos(Math.PI / count) /
      Math.cos(angle - middleAngle);

    const result = [{
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance
    }];

    for (let i = 1; i <= count; i++) {
      const point = polygon[(edgeIndex + i) % count];
      result.push({ x: point.x, y: point.y });
    }

    return result;
  }

  function drawPolygon(points, radius) {
    p.beginShape();

    for (const point of points) {
      p.vertex(point.x * radius, point.y * radius);
    }

    p.endShape(p.CLOSE);
  }

  function boundaryDistance(points, direction) {
    let nearest = Infinity;

    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];

      const edge = {
        x: b.x - a.x,
        y: b.y - a.y
      };

      const denominator = cross2D(direction, edge);
      if (Math.abs(denominator) < 1e-10) continue;

      const distance = cross2D(a, edge) / denominator;
      const alongEdge = cross2D(a, direction) / denominator;

      if (
        distance >= 0 &&
        alongEdge >= -1e-8 &&
        alongEdge <= 1 + 1e-8
      ) {
        nearest = Math.min(nearest, distance);
      }
    }

    return Number.isFinite(nearest) ? nearest : 1;
  }

  function makeFinalOutline(progress) {
    const count = finalPolygon.length;

    const firstAngle = Math.atan2(
      finalPolygon[0].y,
      finalPolygon[0].x
    );

    const samplesPerEdge = 12;
    const sampleCount = count * samplesPerEdge;
    const result = [];

    for (let i = 0; i < sampleCount; i++) {
      const edgeIndex = Math.floor(i / samplesPerEdge);
      const edgeProgress =
        (i % samplesPerEdge) / samplesPerEdge;

      const a = finalPolygon[edgeIndex];
      const b = finalPolygon[(edgeIndex + 1) % count];
      const angle = firstAngle + TAU * i / sampleCount;

      result.push({
        x: mix(
          mix(a.x, b.x, edgeProgress),
          Math.cos(angle),
          progress
        ),
        y: mix(
          mix(a.y, b.y, edgeProgress),
          Math.sin(angle),
          progress
        )
      });
    }

    return result;
  }

  // ── 영상 내보내기 ─────────────────────
  function exportVideo() {
    if (isRecording) return;

    if (typeof MediaRecorder === "undefined") {
      alert("이 브라우저에서는 영상 녹화를 지원하지 않습니다.");
      return;
    }

    const formats = [
      "video/mp4",
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm"
    ];

    const mimeType = formats.find(type =>
      MediaRecorder.isTypeSupported(type)
    );

    if (!mimeType) {
      alert("지원하는 영상 형식을 찾지 못했습니다.");
      return;
    }

    let stream;
    let recorder;

    try {
      stream = posterCanvas.elt.captureStream(EXPORT_FPS);

      recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 12000000
      });
    } catch (error) {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }

      alert("녹화를 시작하지 못했습니다: " + error.message);
      return;
    }

    const chunks = [];
    let failed = false;

    recorder.ondataavailable = event => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    recorder.onerror = event => {
      failed = true;

      alert(
        "녹화 중 오류가 발생했습니다: " +
        (event.error?.message || "브라우저 녹화 오류")
      );

      if (recorder.state !== "inactive") {
        recorder.stop();
      }

      stream.getTracks().forEach(track => track.stop());

      if (activeRecorder === recorder) {
        activeRecorder = null;
        isRecording = false;
        stopQueued = false;
      }
    };

    recorder.onstop = () => {
  stream.getTracks().forEach(track => track.stop());

  if (activeRecorder === recorder) {
    activeRecorder = null;
    isRecording = false;
    stopQueued = false;
  }

  if (failed || chunks.length === 0) {
    alert("영상 데이터가 저장되지 않았습니다.");
    return;
  }

  const actualType = recorder.mimeType || mimeType;
  const extension = actualType.includes("mp4")
    ? "mp4"
    : "webm";

  const blob = new Blob(chunks, {
    type: actualType
  });

  const previousLink = document.getElementById(
    "poster-download"
  );

  if (previousLink) {
    URL.revokeObjectURL(previousLink.href);
    previousLink.remove();
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.id = "poster-download";
  link.href = url;
  link.download = `drawing-poster.${extension}`;
  link.textContent = "녹화 완료 — 여기를 눌러 영상 다운로드";

  Object.assign(link.style, {
    position: "fixed",
    top: "16px",
    left: "16px",
    zIndex: "99999",
    padding: "14px 18px",
    background: "#111",
    color: "#fff",
    borderRadius: "8px",
    fontFamily: "sans-serif",
    fontSize: "14px",
    textDecoration: "none",
    cursor: "pointer"
  });

  link.addEventListener("mousedown", event => {
    event.stopPropagation();
  });

  link.addEventListener("click", event => {
    event.stopPropagation();
  });

  document.body.appendChild(link);
};

// 녹화가 시작되면 처음부터 재생
recorder.onstart = () => {
  if (!failed) restart();
};

p.noLoop();
p.background(255);

activeRecorder = recorder;
isRecording = true;
stopQueued = false;

try {
  recorder.start();
} catch (error) {
  stream.getTracks().forEach(track => track.stop());

  activeRecorder = null;
  isRecording = false;

  alert("녹화를 시작하지 못했습니다: " + error.message);
  restart();
}
}

function finishRecording() {
  if (!activeRecorder || stopQueued) return;

  const recorder = activeRecorder;
  stopQueued = true;

  setTimeout(() => {
    if (recorder.state === "recording") {
      recorder.stop();
    }
  }, 150);
}

function restart() {
  buildSchedule();
  startedAt = p.millis();
  p.loop();
}

p.mousePressed = () => {
  if (!isRecording) restart();
};

p.keyPressed = () => {
  if (isRecording) return;

  if (p.key === "s" || p.key === "S") {
    exportVideo();
    return false;
  }

  if (p.key === "r" || p.key === "R") {
    restart();
    return false;
  }
};

p.windowResized = () => {
  fitPreview();
};
});