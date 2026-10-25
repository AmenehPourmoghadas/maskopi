// Background music. The list of tracks is public/music/catalog.json:
// - an entry with "src" plays that audio file (e.g. a Pixabay track), looped;
// - an entry without "src" plays the matching tune composed below in SYNTHS.
// Browsers only allow sound after the first tap, so the music starts on the
// first tap or key press. The 🔊 button mutes it, remembered on this device.
const Music = (() => {
  const MUTE_KEY = "maskopi.muted";

  // Notes are MIDI numbers per 16th-note step (null is a rest). Drum patterns
  // are one bar of 16 steps: "x" plays a hit.
  const SYNTHS = {
    playful: {
      bpm: 112, wave: "triangle", bassWave: "square",
      melody: [72, null, 76, 79, 76, null, 72, null, 74, null, 77, 81, 79, null, 77, 74,
               72, null, 76, 79, 84, null, 81, 79, 77, 76, 74, null, 72, null, null, null],
      bass: [48, null, null, null, 55, null, null, null, 50, null, null, null, 55, null, null, null,
             48, null, null, null, 53, null, null, null, 55, null, null, null, 48, null, null, null],
      drums: { kick: "x.......x.......", hat: "..x...x...x...x.", snare: "....x.......x..." },
    },
    // D harmonic minor with an echo, a heartbeat drum and a ghostly theremin.
    halloween: {
      bpm: 84, wave: "triangle", bassWave: "sawtooth", echo: true, theremin: true,
      melody: [62, 65, 69, 73, 74, 73, 69, 65, 62, 65, 70, 74, 73, 69, 65, 61,
               62, 65, 69, 74, 77, 76, 73, 69, 70, 69, 65, 62, 61, null, 62, null],
      bass: [38, null, null, null, 38, null, null, null, 34, null, null, null, 33, null, null, null,
             38, null, null, null, 38, null, null, null, 34, null, null, null, 33, null, 33, null],
      drums: { kick: "x..x............" },
    },
    calm: {
      bpm: 72, wave: "sine", bassWave: "triangle", echo: true, noteLen: 6, bassLen: 14,
      melody: [72, null, null, null, 76, null, null, null, 79, null, null, null, 83, null, null, null,
               81, null, null, null, 77, null, null, null, 74, null, null, null, 76, null, null, null],
      bass: [48, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
             53, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
    },
    // G mixolydian, syncopated: a 70s "tie-dye" groove.
    groovy: {
      bpm: 100, wave: "square", bassWave: "sawtooth",
      melody: [67, null, null, 70, null, 72, null, null, 74, null, 72, 70, 67, null, null, null,
               65, null, 67, null, 70, null, 72, 74, 77, null, 74, null, 72, 70, 67, null],
      bass: [43, null, 55, null, 43, null, null, 53, 41, null, 53, null, 41, null, 43, null,
             43, null, 55, null, 43, null, null, 53, 41, null, 53, null, 41, null, 43, null],
      drums: { kick: "x.....x...x.....", hat: "..x...x...x...x.", snare: "....x.......x..." },
    },
    adventure: {
      bpm: 128, wave: "square", bassWave: "sawtooth",
      melody: [74, null, 74, 76, 78, null, 81, null, 79, null, 78, 76, 74, null, null, null,
               74, null, 74, 76, 78, null, 81, null, 83, null, 81, 79, 81, null, null, null],
      bass: [38, null, 38, null, 45, null, 45, null, 43, null, 43, null, 45, null, 45, null,
             38, null, 38, null, 45, null, 45, null, 43, null, 43, null, 45, null, 45, null],
      drums: { kick: "x...x...x...x...", hat: "..x...x...x...x.", snare: "....x.......x..." },
    },
    // "Jingle Bells" (public domain, 1857) with sleigh bells.
    winter: {
      bpm: 96, wave: "triangle", bassWave: "sine", noteLen: 3, bassLen: 7,
      melody: [76, null, null, null, 76, null, null, null, 76, null, null, null, null, null, null, null,
               76, null, null, null, 76, null, null, null, 76, null, null, null, null, null, null, null,
               76, null, null, null, 79, null, null, null, 72, null, null, null, null, null, 74, null,
               76, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
      bass: [48, null, null, null, null, null, null, null, 43, null, null, null, null, null, null, null,
             48, null, null, null, null, null, null, null, 43, null, null, null, null, null, null, null,
             48, null, null, null, null, null, null, null, 43, null, null, null, null, null, null, null,
             48, null, null, null, null, null, null, null, 43, null, null, null, null, null, null, null],
      drums: { hat: "x.x.x.x.x.x.x.x." },
    },
  };

  const catalog = fetch("/music/catalog.json")
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => []);
  const buffers = new Map(); // file src -> Promise<AudioBuffer>

  let ctx = null;
  let noise = null;
  let theme = null;
  let bus = null;
  let source = null;
  let melodyOut = null;
  let bassOut = null;
  let timer = null;
  let step = 0;
  let nextTime = 0;
  let muted = false;
  let paused = false; // e.g. while the microphone is recording
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

  function envelope(node, time, peak, length) {
    node.gain.setValueAtTime(0.0001, time);
    node.gain.exponentialRampToValueAtTime(peak, time + 0.01);
    node.gain.exponentialRampToValueAtTime(0.0001, time + length);
  }

  function tone(freq, time, dur, wave, volume, out) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = wave;
    osc.frequency.value = freq;
    envelope(gain, time, volume, dur);
    osc.connect(gain).connect(out);
    osc.start(time);
    osc.stop(time + dur + 0.05);
  }

  function kick(time) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(40, time + 0.12);
    envelope(gain, time, 0.6, 0.25);
    osc.connect(gain).connect(bus);
    osc.start(time);
    osc.stop(time + 0.3);
  }

  function noiseHit(time, filterType, freq, volume, length) {
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    src.buffer = noise;
    filter.type = filterType;
    filter.frequency.value = freq;
    envelope(gain, time, volume, length);
    src.connect(filter).connect(gain).connect(bus);
    src.start(time);
    src.stop(time + length + 0.05);
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

  function schedule(t) {
    const stepDur = 60 / t.bpm / 4;
    while (nextTime < ctx.currentTime + 0.15) {
      const i = step % t.melody.length;
      const beat = step % 16;
      if (t.melody[i] != null) tone(hz(t.melody[i]), nextTime, stepDur * (t.noteLen ?? 1.8), t.wave, 0.22, melodyOut);
      if (t.bass[i] != null) tone(hz(t.bass[i]), nextTime, stepDur * (t.bassLen ?? 3.5), t.bassWave, 0.2, bassOut);
      if (t.drums?.kick?.[beat] === "x") kick(nextTime);
      if (t.drums?.snare?.[beat] === "x") noiseHit(nextTime, "bandpass", 1800, 0.3, 0.15);
      if (t.drums?.hat?.[beat] === "x") noiseHit(nextTime, "highpass", 7000, 0.12, 0.05);
      if (t.theremin && step % (t.melody.length * 2) === 0) theremin(nextTime + stepDur * 4);
      nextTime += stepDur;
      step++;
    }
  }

  function startSynth(t) {
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
    schedule(t);
    timer = setInterval(() => schedule(t), 25);
  }

  function load(src) {
    if (!buffers.has(src)) {
      const promise = fetch(src)
        .then((r) => r.arrayBuffer())
        .then((data) => ctx.decodeAudioData(data));
      promise.catch(() => buffers.delete(src));
      buffers.set(src, promise);
    }
    return buffers.get(src);
  }

  async function start() {
    if (!ctx || !theme || muted || paused || bus || ctx.state !== "running") return;
    const myBus = ctx.createGain();
    bus = myBus;
    myBus.connect(ctx.destination);

    const entry = (await catalog).find((t) => t.id === theme);
    if (bus !== myBus) return; // stopped or changed while loading
    if (entry?.src) {
      myBus.gain.value = 0.4;
      const buffer = await load(entry.src).catch(() => null);
      if (bus !== myBus || !buffer) return;
      source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(myBus);
      source.start();
    } else if (SYNTHS[theme]) {
      myBus.gain.value = 0.12;
      startSynth(SYNTHS[theme]);
    }
  }

  function stop() {
    clearInterval(timer);
    timer = null;
    const oldSource = source;
    source = null;
    if (!bus) return;
    const oldBus = bus;
    bus = null;
    oldBus.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
    setTimeout(() => {
      try {
        oldSource?.stop();
      } catch {
        // Already stopped.
      }
      oldBus.disconnect();
    }, 600);
  }

  // Sound may only start from a tap; keep listening because tablets can
  // suspend audio again (for example after a phone call).
  function unlock() {
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      ctx = new AudioCtx();
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
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

  function setTheme(id) {
    const next = id || null;
    if (next === theme) return;
    stop();
    theme = next;
    render();
    start();
  }

  function setPaused(value) {
    paused = value;
    if (paused) stop();
    else start();
  }

  return { setTheme, setPaused, catalog: () => catalog };
})();
