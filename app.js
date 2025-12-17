/**********************
 * Embedded config loader (Option B)
 **********************/
function readEmbeddedConfig() {
  const el = document.getElementById("exerciseConfig");
  if (!el) throw new Error("Missing <script id='exerciseConfig' type='application/json'> in index.html");
  return JSON.parse(el.textContent);
}

/**********************
 * Audio (no external files)
 **********************/
let audioCtx = null;
let soundEnabled = false;

function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
  soundEnabled = true;
  const st = document.getElementById("soundState");
  if (st) st.textContent = "On";
}

function tickSound() {
  if (!soundEnabled) return;
  ensureAudio();
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = "square";
  o.frequency.value = 1400;
  g.gain.value = 0.04;
  o.connect(g).connect(audioCtx.destination);
  o.start();
  o.stop(audioCtx.currentTime + 0.05);
}

const voiceCache = {};

function playVoice(file) {
  if (!soundEnabled) return;
  ensureAudio();

  if (!voiceCache[file]) {
    const audio = new Audio(`audio/${file}`);
    audio.preload = "auto";
    voiceCache[file] = audio;
  }

  const a = voiceCache[file].cloneNode();
  a.play().catch(() => {});
}


function shouldTickThisSecond(totalSeconds, currentSecond) {
  // currentSecond counts DOWN (e.g. 10 → 1)
  if (totalSeconds <= 5) return true;
  return currentSecond <= 5;
}

function repStartSound() {
  if (!soundEnabled) return;
  ensureAudio();
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(880, audioCtx.currentTime);
  g.gain.setValueAtTime(0.001, audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.06, audioCtx.currentTime + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
  o.connect(g).connect(audioCtx.destination);
  o.start();
  o.stop(audioCtx.currentTime + 0.14);
}

/**********************
 * Helpers (pause/skip safe timers)
 **********************/
function makeToken() {
  return { abort: false, paused: false };
}
let runToken = makeToken();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pauseGate(token) {
  while (!token.abort && token.paused) await sleep(120);
}

async function sleepPausable(ms, token, step = 80) {
  let elapsed = 0;
  while (!token.abort && elapsed < ms) {
    await pauseGate(token);
    if (token.abort) return;
    const slice = Math.min(step, ms - elapsed);
    await sleep(slice);
    elapsed += slice;
  }
}

function clampInt(v, min, fallback) {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, n);
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/**********************
 * Controls (Pause/Play + optional Skip)
 **********************/
function renderControls(mount, token, { showSkip = false, onSkip = null } = {}) {
  const row = document.createElement("div");
  row.className = "controlRow";
  row.innerHTML = `
    <button class="pauseBtn" type="button" id="pauseBtn">Pause</button>
    ${showSkip ? `<button class="skipBtn" type="button" id="skipBtn">Skip</button>` : ""}
  `;
  mount.appendChild(row);

  const pauseBtn = row.querySelector("#pauseBtn");
  const sync = () => (pauseBtn.textContent = token.paused ? "Play" : "Pause");
  sync();

  pauseBtn.addEventListener("click", () => {
    token.paused = !token.paused;
    sync();
  });

  if (showSkip && onSkip) {
    row.querySelector("#skipBtn").addEventListener("click", onSkip);
  }
}

/**********************
 * UI: buttons + config card
 **********************/
function renderExerciseButtons(exercises, appCfg) {
  const container = document.getElementById("exerciseButtons");
  container.innerHTML = "";

  exercises.forEach((ex) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = ex.name;
    btn.addEventListener("click", () => {
      buildExerciseCard(ex, appCfg);
      setTimeout(
        () => document.getElementById("stage").scrollIntoView({ behavior: "smooth", block: "start" }),
        60
      );
    });
    container.appendChild(btn);
  });
}

function buildExerciseCard(ex, appCfg) {
  const stage = document.getElementById("stage");
  stage.innerHTML = "";

  const card = document.createElement("section");
  card.className = "card";
  card.innerHTML = `
    <div class="card-head">
      <h2>${escapeHtml(ex.name)}</h2>
      <div class="pill">Configure</div>
    </div>

    <div class="card-body">
      <div class="exercise-info">
        <div class="exercise-img" aria-label="exercise image">
          ${ex.image ? `<img src="${escapeHtml(ex.image)}" alt="${escapeHtml(ex.name)}">` : `<span>Image</span>`}
        </div>
        <p class="desc">${escapeHtml(ex.description)}</p>
      </div>

      <div class="form" role="group" aria-label="Exercise options">
        <label>Sets
          <input id="sets" type="number" min="1" step="1" inputmode="numeric" value="${ex.sets ?? 3}">
        </label>
        <label>Reps
          <input id="reps" type="number" min="1" step="1" inputmode="numeric" value="${ex.reps ?? 10}">
        </label>
        <label>Rep Duration (sec)
          <input id="repDur" type="number" min="1" step="1" inputmode="numeric" value="${ex.repDurationSeconds ?? 3}">
        </label>
		<label>Hold (sec)
			<input id="holdSeconds" type="number" min="0" step="1" value="${ex.holdSeconds ?? 0}" >
		</label>
        <label>Rest (sec)
          <input id="rest" type="number" min="0" step="1" inputmode="numeric" value="${ex.restSeconds ?? 30}">
        </label>

        <div class="checkline">
          <input id="bothSides" type="checkbox" ${ex.performBothSides ? "checked" : ""}>
          <span>Perform on both sides</span>
        </div>
      </div>

      <div class="actions">
        <button class="primary" id="startBtn" type="button">Start</button>
        <button class="ghost" id="stopBtn" type="button" disabled>Stop</button>
      </div>

      <div id="runMount"></div>
    </div>
  `;

  stage.appendChild(card);

  const startBtn = card.querySelector("#startBtn");
  const stopBtn = card.querySelector("#stopBtn");
  const runMount = card.querySelector("#runMount");

  startBtn.addEventListener("click", async () => {
    ensureAudio(); // user gesture

    // stop any previous run
    runToken.abort = true;
    runToken = makeToken();

    startBtn.disabled = true;
    stopBtn.disabled = false;

	const opts = {
	  sets: clampInt(card.querySelector("#sets").value, 1, ex.sets ?? 3),
	  reps: clampInt(card.querySelector("#reps").value, 1, ex.reps ?? 10),
	  repDur: clampInt(card.querySelector("#repDur").value, 1, ex.repDurationSeconds ?? 3),
	  rest: clampInt(card.querySelector("#rest").value, 0, ex.restSeconds ?? 30),
	  bothSides: card.querySelector("#bothSides").checked,
	  prepare: clampInt(appCfg.prepareSeconds ?? 5, 0, 5),
	  sideSwitchPause: clampInt(ex.sideSwitchSeconds ?? 5, 0, 5),
	  holdSeconds: clampInt(stage.querySelector("#holdSeconds").value,0,ex.holdSeconds ?? 0)
	};

    await runExercise({
      mount: runMount,
      label: ex.name,
      opts,
      token: runToken,
    });

    startBtn.disabled = false;
    stopBtn.disabled = true;
  });

  stopBtn.addEventListener("click", () => {
    runToken.abort = true;
    stopBtn.disabled = true;
    startBtn.disabled = false;
    runMount.innerHTML = `
      <div class="runner">
        <p class="phase" style="margin:0;">Stopped</p>
        <div class="status warn">You can adjust options and press Start again.</div>
      </div>
    `;
  });
}

/**********************
 * Runner phases (UI like your screenshots)
 **********************/
async function runExercise({ mount, label, opts, token }) {
  mount.innerHTML = "";
  const runner = document.createElement("div");
  runner.className = "runner";
  mount.appendChild(runner);

  // Helper: run one set for a given side (no rest inside)
  const runOneSetForSide = async (sideLabel, setIndex, advanceSetProgressAtEnd) => {
    if (token.abort) return;

	await repsPhase(
	  runner,
	  label,
	  sideLabel,
	  setIndex,
	  opts.sets,
	  opts.reps,
	  opts.repDur,
	  token,
	  {
		completedSetsBefore: setIndex - 1,
		advanceSetProgressAtEnd
	  },
	  opts.holdSeconds
	);

  };

  // Prepare happens once at the very start (before set 1 Right / or before first side)
  await preparePhase(runner, label, opts.bothSides ? "Right Side" : "", opts.prepare, token);
  if (token.abort) return;

  // Main loop: interleave by set when bothSides is true
  for (let set = 1; set <= opts.sets; set++) {
    if (token.abort) return;

    if (!opts.bothSides) {
      // Single-side: set completes after this repsPhase, so advance sets bar at end
      await runOneSetForSide("", set, true);
      if (token.abort) return;

      if (set < opts.sets) {
        await restPhase(runner, label, "", set, opts.sets, opts.rest, token);
        if (token.abort) return;
      }
      continue;
    }

    // BOTH SIDES: Set N Right
    await runOneSetForSide("Right Side", set, false); // do NOT advance sets bar yet
    if (token.abort) return;

    // Switch pause between Right and Left for the same set
    await switchSidesPhase(runner, label, opts.sideSwitchPause, token);
    if (token.abort) return;

    // Set N Left
    await runOneSetForSide("Left Side", set, true); // set is complete after left side -> advance sets bar
    if (token.abort) return;

    // Rest between sets (after the full set is done on both sides)
    if (set < opts.sets) {
      await restPhase(runner, label, "Left Side", set, opts.sets, opts.rest, token);
      if (token.abort) return;
    }
  }

  if (token.abort) return;

  runner.innerHTML = `
    <div class="runner-top">
      <p class="phase">Completed ✅</p>
      <p class="meta">${escapeHtml(label)}</p>
    </div>
    <div class="status done">All sets are finished.</div>
  `;
}


async function preparePhase(runner, label, sideLabel, seconds, token) {
  let skipped = false;

  runner.innerHTML = `
    <div class="runner-top">
      <p class="phase">Prepare</p>
      <p class="meta">${escapeHtml(label)}${sideLabel ? "<br>" + escapeHtml(sideLabel) : ""}</p>
    </div>

    <div class="big" id="bigNum">${seconds}</div>
    <p class="sub">Get into position…</p>

    <div class="barblock">
      <div class="barline">
        <span>Prepare timer</span>
        <span id="txt">${seconds}s</span>
      </div>
      <div class="progress"><div class="fill" id="fill"></div></div>
    </div>

    <div id="controlsMount"></div>
    <div class="status">A tick plays each second.</div>
  `;

  renderControls(runner.querySelector("#controlsMount"), token, {
    showSkip: true,
    onSkip: () => (skipped = true),
  });

  const bigNum = runner.querySelector("#bigNum");
  const txt = runner.querySelector("#txt");
  const fill = runner.querySelector("#fill");

  // update every second, tick each second
  for (let t = seconds; t >= 1; t--) {
    if (token.abort || skipped) break;
    await pauseGate(token);
    if (token.abort || skipped) break;

    tickSound();
    bigNum.textContent = String(t);
    txt.textContent = `${t}s`;
    fill.style.width = `${Math.round(((seconds - t) / seconds) * 100)}%`;

    await sleepPausable(1000, token, 60);
  }

  fill.style.width = "100%";
  await sleepPausable(120, token, 60);
}

async function switchSidesPhase(runner, label, seconds, token) {
  runner.innerHTML = `
    <div class="runner-top">
      <p class="phase">Switch sides</p>
      <p class="meta">${escapeHtml(label)}<br><span style="color:var(--muted)">Next: Left Side</span></p>
    </div>

    <div class="big" id="bigNum">${seconds}</div>
    <p class="sub">Ready up…</p>

    <div class="barblock">
      <div class="barline">
        <span>Pause</span>
        <span id="txt">${seconds}s</span>
      </div>
      <div class="progress"><div class="fill" id="fill"></div></div>
    </div>

    <div id="controlsMount"></div>
    <div class="status warn">Take a breath and reposition.</div>
  `;

  renderControls(runner.querySelector("#controlsMount"), token, { showSkip: false });

  const bigNum = runner.querySelector("#bigNum");
  const txt = runner.querySelector("#txt");
  const fill = runner.querySelector("#fill");

	for (let t = seconds; t >= 1; t--) {
	  if (token.abort) return;
	  await pauseGate(token);
	  if (token.abort) return;

	  if (shouldTickThisSecond(seconds, t)) {
		tickSound();
	  }

	  bigNum.textContent = String(t);
	  txt.textContent = `${t}s`;
	  fill.style.width = `${Math.round(((seconds - t) / seconds) * 100)}%`;

	  await sleepPausable(1000, token, 60);
	}


  fill.style.width = "100%";
  await sleepPausable(120, token, 60);
}

async function repsPhase(
  runner,
  label,
  sideLabel,
  setIndex,
  setTotal,
  repsTotal,
  repDurSec,
  token,
  progress,
  holdSeconds = 0
) {
  runner.innerHTML = `
    <div class="runner-top">
      <p class="phase">${escapeHtml(label)}</p>
      <p class="meta">
        Set ${setIndex} of ${setTotal}
        ${sideLabel ? "<br><span style='color:var(--muted)'>" + escapeHtml(sideLabel) + "</span>" : ""}
      </p>
    </div>

    <div class="big" id="repNum">${repsTotal}</div>
    <p class="sub">Reps remaining</p>
	  <p class="sub" id="holdText" style="display:none;font-weight:800;color:var(--warn);">
		HOLD
	  </p>	

    <div class="barblock">
		<div class="barline">
		  <span>Repetition duration</span>
		  <span><span id="repSec">0.0</span> / <span id="repTotal"></span>s</span>
		</div>
		<div class="progress"><div class="fill" id="repFill"></div></div>

      <div class="barline">
        <span>Total sets</span>
        <span>${setIndex} / ${setTotal}</span>
      </div>
      <div class="progress"><div class="fill" id="setFill"></div></div>
    </div>

    <div id="controlsMount"></div>
    <div class="status" id="statusLine">Rep 1 of ${repsTotal}</div>
  `;

  renderControls(runner.querySelector("#controlsMount"), token, { showSkip: false });

  const repNum = runner.querySelector("#repNum");
  const repFill = runner.querySelector("#repFill");
  const repSec = runner.querySelector("#repSec");
  const repTotalEl = runner.querySelector("#repTotal");
  const holdText = runner.querySelector("#holdText");
  const totalRepSeconds = repDurSec + holdSeconds;
  repTotalEl.textContent = totalRepSeconds;
  const setFill = runner.querySelector("#setFill");
  const statusLine = runner.querySelector("#statusLine");

  // IMPORTANT: sets bar represents completed SETS (not sides)
  const completedBefore = Math.max(0, Math.min(setTotal, progress.completedSetsBefore ?? (setIndex - 1)));
  setFill.style.width = `${Math.round((completedBefore / setTotal) * 100)}%`;

  for (let repRemaining = repsTotal; repRemaining >= 1; repRemaining--) {
    if (token.abort) return;
    await pauseGate(token);
    if (token.abort) return;

    repStartSound(); // start-of-rep sound

    repNum.textContent = String(repRemaining);
    const repNumber = repsTotal - repRemaining + 1;
    statusLine.textContent = `Rep ${repNumber} of ${repsTotal}`;

	const totalMs = (repDurSec + holdSeconds) * 1000;
	const moveHalfMs = (repDurSec * 1000) / 2;

	let elapsedTotal = 0;

	const advance = async (ms, showHold = false) => {
	  let elapsed = 0;
	  holdText.style.display = showHold ? "block" : "none";

	  while (!token.abort && elapsed < ms) {
		await pauseGate(token);
		if (token.abort) return;

		await sleepPausable(80, token, 60);
		elapsed += 80;
		elapsedTotal += 80;

		const pct = Math.min(100, (elapsedTotal / totalMs) * 100);
		repFill.style.width = `${pct}%`;
		repSec.textContent = Math.min(totalRepSeconds, elapsedTotal / 1000).toFixed(1);
	  }
	};


	if (holdSeconds > 0) {
	  await advance(moveHalfMs, false);

	  playVoice("hold.mp3");
	  await advance(holdSeconds * 1000, true);

	  playVoice("stop_hold.mp3");
	  await advance(moveHalfMs, false);
	} else {
	  await advance(repDurSec * 1000, false);
	}



    repFill.style.width = "0%";
    repSec.textContent = "0.0";
	holdText.style.display = "none";
    await sleepPausable(120, token, 60);
  }

  // Only advance sets progress when the whole set is complete
  if (progress.advanceSetProgressAtEnd) {
    const completedNow = Math.max(0, Math.min(setTotal, completedBefore + 1));
    setFill.style.width = `${Math.round((completedNow / setTotal) * 100)}%`;
    statusLine.textContent = `Set ${setIndex} complete.`;
    await sleepPausable(250, token, 60);
  } else {
    // Right side finished but set not yet complete
    statusLine.textContent = `Right side complete.`;
    await sleepPausable(200, token, 60);
  }
}


async function restPhase(runner, label, sideLabel, setIndex, setTotal, restSec, token) {
  let skipped = false;

  runner.innerHTML = `
    <div class="runner-top">
      <p class="phase">Rest</p>
      <p class="meta">
        Set ${setIndex} complete
        ${sideLabel ? "<br><span style='color:var(--muted)'>" + escapeHtml(sideLabel) + "</span>" : ""}
      </p>
    </div>

    <div class="big" id="bigNum">${restSec}</div>
    <p class="sub">Seconds remaining</p>

    <div class="barblock">
      <div class="barline">
        <span>Rest timer</span>
        <span id="txt">${restSec}s</span>
      </div>
      <div class="progress"><div class="fill" id="fill"></div></div>
    </div>

    <div id="controlsMount"></div>
    <div class="status warn">Next: Set ${setIndex + 1} of ${setTotal}</div>
  `;

  renderControls(runner.querySelector("#controlsMount"), token, {
    showSkip: true,
    onSkip: () => (skipped = true),
  });

  const bigNum = runner.querySelector("#bigNum");
  const txt = runner.querySelector("#txt");
  const fill = runner.querySelector("#fill");

  if (restSec <= 0 || skipped) {
    fill.style.width = "100%";
    await sleepPausable(120, token, 60);
    return;
  }

	for (let t = restSec; t >= 1; t--) {
	  if (token.abort || skipped) break;
	  await pauseGate(token);
	  if (token.abort || skipped) break;

	  if (shouldTickThisSecond(restSec, t)) {
		tickSound();
	  }

	  bigNum.textContent = String(t);
	  txt.textContent = `${t}s`;
	  fill.style.width = `${Math.round(((restSec - t) / restSec) * 100)}%`;

	  await sleepPausable(1000, token, 60);
	}


  fill.style.width = "100%";
  await sleepPausable(120, token, 60);
}

/**********************
 * Boot
 **********************/
document.addEventListener("DOMContentLoaded", () => {
  // sound toggle pill
  const pill = document.getElementById("audioPill");
  if (pill) {
    pill.addEventListener("click", () => {
      soundEnabled = !soundEnabled;
      document.getElementById("soundState").textContent = soundEnabled ? "On" : "Off";
      if (soundEnabled) ensureAudio();
    });
  }

  // load embedded config and render buttons
  let cfg;
  try {
    cfg = readEmbeddedConfig();
  } catch (e) {
    console.error(e);
    document.getElementById("stage").innerHTML =
      `<div class="runner"><p class="phase">Config error</p><div class="status warn">${escapeHtml(e.message)}</div></div>`;
    return;
  }

  const appCfg = cfg.app || {};
  const exercises = Array.isArray(cfg.exercises) ? cfg.exercises : [];

  renderExerciseButtons(exercises, appCfg);
  if (exercises[0]) buildExerciseCard(exercises[0], appCfg);
});
