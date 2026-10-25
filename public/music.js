// Background music, composed in code with the Web Audio API: no audio files,
// no copyright issues. Browsers only allow sound after the first tap, so the
// music starts on the first tap or key press. The 🔊 button mutes it, and the
// choice is remembered on this device.
const Music = (() => {
  const MUTE_KEY = "maskopi.muted";

  // MIDI note numbers per 16th-note step; null is a rest.
  const THEMES = {
    playful: {
      bpm: 112,
      wave: "triangle",
      bassWave: "square",
      melody: [72, null, 76, 79, 76, null, 72, null, 74, null, 77, 81, 79, null, 77, 74,
               72, null, 76, 79, 84, null, 81, 79, 77, 76, 74, null, 72, null, null, null],
      bass: [48, null, null, null, 55, null, null, null, 50, null, null, null, 55, null, null, null,
             48, null, null, null, 53, null, null, null, 55, null, null, null, 48, null, null, null],
    },
    // D harmonic minor, slow, with an echo and a ghostly theremin swoop.
    halloween: {
      bpm: 84,
      wave: "triangle",
      bassWave: "sawtooth",
      echo: true,
      theremin: true,
      melody: [62, 65, 69, 73, 74, 73, 69, 65, 62, 65, 70, 74, 73, 69, 65, 61,
               62, 65, 69, 74, 77, 76, 73, 69, 70, 69, 65, 62, 61, null, 62, null],
      bass: [38, null, null, null, 38, null, null, null, 34, null, null, null, 33, null, null, null,
             38, null, null, null, 38, null, null, null, 34, null, null, null, 33, null, 33, null],
    },
  };

  let ctx = null;
  let master = null;
  let theme = null;
  let bus = null;
  let melodyOut = null;
  let bassOut = null;
  let timer = null;
  let step = 0;
  let nextTime = 0;
  let muted = false;
  try {
    muted = localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    // Storage unavailable: start unmuted.
  }

  const button = document.createElement("button");
  button.type = "button";
  button.className = "sound-toggle";
  button.hidden = true;
  button.onclick = () => {
    muted = !muted;
    try {
      localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    } catch {
      // Not remembered, but still works for this visit.
    }
    if (muted) stop();
    else start();
    render();
  };
  document.body.append(button);

  function render() {
    button.hidden = !theme;
    button.textContent = muted ? "🔇" : "🔊";
    button.title = muted ? "Turn music on" : "Turn music off";
    button.setAttribute("aria-label", button.title);
  }

  const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

  function tone(freq, time, dur, wave, volume, out) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = wave;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(volume, time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(gain).connect(out);
    osc.start(time);
    osc.stop(time + dur + 0.05);
  }

  function theremin(time) {
    const osc = ctx.createOscillator();
    const vibrato = ctx.createOscillator();
    const depth = ctx.createGain();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(hz(69), time);
    osc.frequency.exponentialRampToValueAtTime(hz(74), time + 1.5);
    vibrato.frequency.value = 6;
    depth.gain.value = 8;
    vibrato.connect(depth).connect(osc.frequency);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.15, time + 0.4);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 2.5);
    osc.connect(gain).connect(melodyOut);
    osc.start(time);
    vibrato.start(time);
    osc.stop(time + 2.6);
    vibrato.stop(time + 2.6);
  }

  function schedule() {
    const t = THEMES[theme];
    const stepDur = 60 / t.bpm / 4;
    while (nextTime < ctx.currentTime + 0.15) {
      const i = step % t.melody.length;
      if (t.melody[i] != null) tone(hz(t.melody[i]), nextTime, stepDur * 1.8, t.wave, 0.25, melodyOut);
      if (t.bass[i] != null) tone(hz(t.bass[i]), nextTime, stepDur * 3.5, t.bassWave, 0.18, bassOut);
      if (t.theremin && step % (t.melody.length * 2) === 0) theremin(nextTime + stepDur * 4);
      nextTime += stepDur;
      step++;
    }
  }

  function start() {
    if (!ctx || !theme || muted || timer || ctx.state !== "running") return;
    const t = THEMES[theme];
    bus = ctx.createGain();
    bus.connect(master);

    melodyOut = bus;
    if (t.echo) {
      const delay = ctx.createDelay();
      const feedback = ctx.createGain();
      delay.delayTime.value = 0.36;
      feedback.gain.value = 0.35;
      melodyOut = ctx.createGain();
      melodyOut.connect(bus);
      melodyOut.connect(delay);
      delay.connect(feedback).connect(delay);
      delay.connect(bus);
    }
    bassOut = ctx.createBiquadFilter();
    bassOut.type = "lowpass";
    bassOut.frequency.value = 700;
    bassOut.connect(bus);

    step = 0;
    nextTime = ctx.currentTime + 0.05;
    schedule();
    timer = setInterval(schedule, 25);
  }

  function stop() {
    clearInterval(timer);
    timer = null;
    if (!bus) return;
    const old = bus;
    bus = null;
    old.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
    setTimeout(() => old.disconnect(), 600);
  }

  // Sound may only start from a tap; keep listening because tablets can
  // suspend audio again (for example after a phone call).
  function unlock() {
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      ctx = new AudioCtx();
      master = ctx.createGain();
      master.gain.value = 0.12;
      master.connect(ctx.destination);
    }
    if (ctx.state === "running") start();
    else ctx.resume().then(start, () => {});
  }
  document.addEventListener("pointerdown", unlock, true);
  document.addEventListener("keydown", unlock, true);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else start();
  });

  function setTheme(name) {
    const next = THEMES[name] ? name : null;
    if (next === theme) return;
    stop();
    theme = next;
    render();
    start();
  }

  return { setTheme };
})();
