// All sound is synthesized with WebAudio — no audio files. A tiny step sequencer
// plays a sunset synthwave loop (bass, hats, pad), and one-shots cover gunfire,
// punches, crashes, sirens, pickups and mission jingles. Everything is created
// lazily on the first user gesture, so the page never needs autoplay permission.
export function createAudio() {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;
  let sirenHigh = false;
  let noiseBuffer = null;
  let musicOn = false;
  let nextNoteTime = 0;
  let step = 0;

  // A minor-key sunset loop: Am — F — C — G, one bar each, 16 steps a bar.
  const CHORDS = [
    [57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62],
  ];
  const BASS = [45, 41, 36, 43];
  const BPM = 96;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.16;
      musicGain.connect(master);
      // Engine: a sawtooth through a lowpass, pitch follows speed.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 50;
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      // Siren: a square wave that alternates two tones.
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'square';
      sirenOsc.frequency.value = 660;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      // Shared white-noise buffer for shots, crashes and hats.
      const len = ctx.sampleRate;
      noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
      return true;
    } catch {
      return false;
    }
  }

  function midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function tone(freq, time, dur, type, gain, dest) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(gain, time + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, time + dur);
    osc.connect(g);
    g.connect(dest || musicGain);
    osc.start(time);
    osc.stop(time + dur + 0.05);
  }

  function noise(time, dur, gain, filterFreq, dest) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(dest || master);
    src.start(time);
    src.stop(time + dur + 0.05);
  }

  function scheduleStep(time) {
    const bar = Math.floor(step / 16) % 4;
    const beat = step % 16;
    const chord = CHORDS[bar];
    if (beat === 0) {
      tone(midiToFreq(BASS[bar]), time, 0.9, 'triangle', 0.5);
      for (const note of chord) tone(midiToFreq(note), time, 1.6, 'sine', 0.07);
    }
    if (beat === 8) tone(midiToFreq(BASS[bar] + 12), time, 0.4, 'triangle', 0.3);
    if (beat % 4 === 2) noise(time, 0.05, 0.12, 8000, musicGain);
    if (beat % 2 === 0) tone(midiToFreq(chord[step % 3] + 24), time, 0.18, 'square', 0.03);
    step += 1;
  }

  return {
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
    /** The audio clock, for the music sequencer. */
    now() { return ctx ? ctx.currentTime : 0; },
    /** Call every frame; advances the music sequencer. */
    update(dt, now) {
      if (!ctx || !musicOn) return;
      const stepDur = 60 / BPM / 4;
      if (nextNoteTime < now) nextNoteTime = now + 0.05;
      while (nextNoteTime < now + 0.12) {
        scheduleStep(nextNoteTime);
        nextNoteTime += stepDur;
      }
      // Siren alternates tone twice a second while it is on.
      sirenTimer -= dt;
      if (sirenTimer <= 0) {
        sirenTimer = 0.5;
        sirenHigh = !sirenHigh;
        if (sirenGain.gain.value > 0) sirenOsc.frequency.value = sirenHigh ? 880 : 660;
      }
    },
    startMusic() {
      if (!ensure()) return;
      musicOn = true;
      nextNoteTime = ctx.currentTime + 0.1;
    },
    stopMusic() { musicOn = false; },
    setEngine(speed01, on) {
      if (!ctx) return;
      const t = ctx.currentTime;
      engineGain.gain.setTargetAtTime(on ? 0.05 + speed01 * 0.07 : 0, t, 0.08);
      engineOsc.frequency.setTargetAtTime(55 + speed01 * 165, t, 0.08);
      engineFilter.frequency.setTargetAtTime(380 + speed01 * 900, t, 0.1);
    },
    setSiren(on, distance) {
      if (!ctx) return;
      const t = ctx.currentTime;
      const vol = on ? Math.max(0, 0.09 - distance * 0.0012) : 0;
      sirenGain.gain.setTargetAtTime(vol, t, 0.2);
    },
    gunshot() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      noise(t, 0.16, 0.5, 2600);
      tone(140, t, 0.12, 'sine', 0.4, master);
    },
    punch() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      noise(t, 0.08, 0.3, 900);
      tone(90, t, 0.1, 'sine', 0.35, master);
    },
    crash(strength) {
      if (!ensure()) return;
      const t = ctx.currentTime;
      noise(t, 0.3, Math.min(0.6, 0.2 + strength * 0.4), 500);
      tone(60, t, 0.25, 'sine', 0.4, master);
    },
    pickup() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      tone(880, t, 0.12, 'sine', 0.25, master);
      tone(1320, t + 0.09, 0.18, 'sine', 0.25, master);
    },
    jingle() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      [523, 659, 784, 1046].forEach((f, i) => tone(f, t + i * 0.11, 0.22, 'triangle', 0.3, master));
    },
    fail() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      [392, 330, 262].forEach((f, i) => tone(f, t + i * 0.14, 0.25, 'sawtooth', 0.16, master));
    },
    click() {
      if (!ensure()) return;
      tone(660, ctx.currentTime, 0.05, 'square', 0.12, master);
    },
  };
}
