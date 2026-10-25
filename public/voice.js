// Records the device microphone as a 16 kHz mono WAV file, a format every
// speech-to-text model accepts, whatever the browser's own recording format.
const Voice = (() => {
  const RATE = 16000;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const supported = !!(navigator.mediaDevices?.getUserMedia && AudioCtx);
  let stream = null;
  let ctx = null;
  let input = null;
  let processor = null;
  let chunks = [];

  async function start() {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    ctx = new AudioCtx();
    input = ctx.createMediaStreamSource(stream);
    processor = ctx.createScriptProcessor(4096, 1, 1);
    chunks = [];
    processor.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    input.connect(processor);
    processor.connect(ctx.destination);
  }

  async function stop() {
    processor.disconnect();
    input.disconnect();
    stream.getTracks().forEach((t) => t.stop());
    const rate = ctx.sampleRate;
    await ctx.close();
    return toWav(downsample(chunks, rate));
  }

  function downsample(parts, rate) {
    const length = parts.reduce((n, p) => n + p.length, 0);
    const all = new Float32Array(length);
    let offset = 0;
    for (const p of parts) {
      all.set(p, offset);
      offset += p.length;
    }
    const ratio = rate / RATE;
    const out = new Float32Array(Math.floor(length / ratio));
    for (let i = 0; i < out.length; i++) out[i] = all[Math.floor(i * ratio)];
    return out;
  }

  function toWav(samples) {
    const view = new DataView(new ArrayBuffer(44 + samples.length * 2));
    const text = (at, s) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
    text(0, "RIFF");
    view.setUint32(4, 36 + samples.length * 2, true);
    text(8, "WAVE");
    text(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, RATE, true);
    view.setUint32(28, RATE * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    text(36, "data");
    view.setUint32(40, samples.length * 2, true);
    samples.forEach((s, i) => {
      const v = Math.max(-1, Math.min(1, s));
      view.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
    });
    return new Blob([view], { type: "audio/wav" });
  }

  return { supported, start, stop };
})();
