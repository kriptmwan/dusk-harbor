// Procedural sound: every effect is synthesised with WebAudio, so the game
// ships no audio files and makes no network request. Sounds are created lazily
// on the first user gesture (browsers block audio before interaction).
export function createAudio() {
  let ctx = null;
  let master = null;
  let enabled = true;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') void ctx.resume();
      return ctx;
    }
    const AudioCtx = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioCtx) return null;
    ctx = new AudioCtx();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
    return ctx;
  }

  function noiseBuffer(duration) {
    const audio = ensure();
    if (!audio) return null;
    const buffer = audio.createBuffer(1, Math.floor(audio.sampleRate * duration), audio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  // A short burst of filtered noise: the body of every gunshot and explosion.
  function burst({ duration, type, frequency, gain, decay, when = 0 }) {
    const audio = ensure();
    if (!audio || !enabled) return;
    const t0 = audio.currentTime + when;
    const source = audio.createBufferSource();
    source.buffer = noiseBuffer(duration + 0.05);
    const filter = audio.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    const amp = audio.createGain();
    amp.gain.setValueAtTime(gain, t0);
    amp.gain.exponentialRampToValueAtTime(0.001, t0 + decay);
    source.connect(filter);
    filter.connect(amp);
    amp.connect(master);
    source.start(t0);
    source.stop(t0 + duration + 0.05);
  }

  // A short pitched blip: clicks, beeps, hit ticks.
  function blip({ frequency, endFrequency, duration, gain, type = 'square', when = 0 }) {
    const audio = ensure();
    if (!audio || !enabled) return;
    const t0 = audio.currentTime + when;
    const osc = audio.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, t0);
    if (endFrequency) osc.frequency.exponentialRampToValueAtTime(endFrequency, t0 + duration);
    const amp = audio.createGain();
    amp.gain.setValueAtTime(gain, t0);
    amp.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(amp);
    amp.connect(master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  const SHOTS = {
    rifle: { duration: 0.16, type: 'lowpass', frequency: 1800, gain: 0.9, decay: 0.14 },
    smg: { duration: 0.1, type: 'bandpass', frequency: 2400, gain: 0.7, decay: 0.09 },
    pistol: { duration: 0.12, type: 'bandpass', frequency: 1600, gain: 0.8, decay: 0.11 },
    marksman: { duration: 0.3, type: 'lowpass', frequency: 1200, gain: 1.0, decay: 0.28 },
    enemy: { duration: 0.14, type: 'lowpass', frequency: 900, gain: 0.45, decay: 0.12 },
  };

  return {
    unlock() { ensure(); },
    setEnabled(value) { enabled = value; },
    shot(kind, distant = false) {
      const spec = SHOTS[kind] ?? SHOTS.rifle;
      burst({ ...spec, gain: distant ? spec.gain * 0.5 : spec.gain });
      if (!distant) blip({ frequency: 220, endFrequency: 60, duration: 0.07, gain: 0.25, type: 'sawtooth' });
    },
    dryFire() { blip({ frequency: 1200, duration: 0.03, gain: 0.15 }); },
    reload() {
      blip({ frequency: 900, duration: 0.04, gain: 0.2 });
      blip({ frequency: 600, duration: 0.04, gain: 0.2, when: 0.18 });
      blip({ frequency: 1100, duration: 0.05, gain: 0.25, when: 0.42 });
    },
    hit() { blip({ frequency: 2400, duration: 0.05, gain: 0.3, type: 'sine' }); },
    kill() {
      blip({ frequency: 1800, duration: 0.06, gain: 0.3, type: 'sine' });
      blip({ frequency: 2600, duration: 0.08, gain: 0.3, type: 'sine', when: 0.07 });
    },
    hurt() { burst({ duration: 0.12, type: 'lowpass', frequency: 500, gain: 0.5, decay: 0.1 }); },
    step() { burst({ duration: 0.05, type: 'lowpass', frequency: 300, gain: 0.08, decay: 0.05 }); },
    plantBeep() { blip({ frequency: 1400, duration: 0.09, gain: 0.3, type: 'sine' }); },
    bombTick() { blip({ frequency: 1800, duration: 0.04, gain: 0.22, type: 'sine' }); },
    explosion() {
      burst({ duration: 0.9, type: 'lowpass', frequency: 400, gain: 1.0, decay: 0.85 });
      blip({ frequency: 90, endFrequency: 30, duration: 0.7, gain: 0.6, type: 'sine' });
    },
    grenadePin() { blip({ frequency: 1500, duration: 0.03, gain: 0.2 }); },
    buy() {
      blip({ frequency: 880, duration: 0.06, gain: 0.25, type: 'sine' });
      blip({ frequency: 1320, duration: 0.08, gain: 0.25, type: 'sine', when: 0.06 });
    },
    denied() { blip({ frequency: 220, duration: 0.12, gain: 0.25, type: 'square' }); },
    roundWin() {
      [523, 659, 784].forEach((f, i) => blip({ frequency: f, duration: 0.16, gain: 0.25, type: 'sine', when: i * 0.11 }));
    },
    roundLoss() {
      [392, 330, 262].forEach((f, i) => blip({ frequency: f, duration: 0.18, gain: 0.25, type: 'sine', when: i * 0.12 }));
    },
  };
}
