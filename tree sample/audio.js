/* Browser-only synthesis. Its RNG never changes the visual forest's RNG. */
class ForestSound {
  constructor() {
    this.enabled = true;
    this.events = [];
    this.cursor = 0;
    this.voices = new Set();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.silence();
    });
  }
  unlock() {
    if (!this.enabled) return;
    try {
      if (!this.context) {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) return;
        this.context = new Audio();
        this.output = this.context.createGain();
        this.output.gain.value = 0.65;
        this.output.connect(this.context.destination);
      }
      // Called directly inside pointer/click handlers, including on iOS.
      this.context.resume().catch(() => {});
    } catch (error) {
      console.warn('Forest audio unavailable', error);
    }
  }
  toggle() {
    this.enabled = !this.enabled;
    if (this.enabled) this.unlock();
    else this.silence();
    return this.enabled;
  }
  silence() {
    if (!this.context) return;
    const now = this.context.currentTime;
    for (const voice of this.voices) {
      voice.envelope.gain.cancelScheduledValues(now);
      voice.envelope.gain.setTargetAtTime(0, now, 0.025);
      for (const oscillator of voice.oscillators) oscillator.stop(now + 0.15);
    }
  }
  reset() {
    this.silence();
    this.events = [];
    this.cursor = 0;
  }
  plant(seed, trees, width, height) {
    this.reset();
    let state = (seed ^ 0x41554449) >>> 0;
    const random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
    const scale = [0, 2, 4, 7, 9];
    const root = [45, 48, 50, 52][Math.floor(random() * 4)];
    const normalizer = Math.sqrt(6 / Math.max(6, trees.length));
    for (const tree of trees) {
      const size = Math.min(1, -tree.minY * tree.scaleY / height);
      const degree = Math.max(0, Math.min(7, Math.round((0.94 - size) * 12)));
      const base = root + scale[degree % 5] + 12 * Math.floor(degree / 5);
      const pan = Math.max(-0.65, Math.min(0.65,
        ((tree.offsetX + (width - 1080) / 2) / width * 2 - 1) * 0.65));
      for (let stage = 0; stage < 4; stage++) {
        const geometry = stage === 3 ? tree.leaves : tree.segments;
        const candidates = geometry.filter(v => v.start >= stage && v.start < stage + 0.9);
        const selected = candidates[Math.floor(random() * candidates.length)];
        const phase = selected ? Math.max(0.06, Math.min(0.84, selected.start - stage)) : 0.08 + random() * 0.65;
        this.events.push({ at: stage + phase, midi: base + (stage > 1 ? 12 : 0),
          pan, stage, amplitude: normalizer * (stage === 3 ? 0.026 : 0.044),
          detune: (random() - 0.5) * 7 });
        if (stage >= 2) this.events.push({ at: stage + Math.min(0.96, phase + 0.13 + random() * 0.15),
          midi: base + 7 + (stage === 3 ? 12 : 0), pan, stage,
          amplitude: normalizer * 0.018, detune: (random() - 0.5) * 7 });
      }
    }
    this.events.sort((a, b) => a.at - b.at);
  }
  update(progress) {
    while (this.cursor < this.events.length && this.events[this.cursor].at <= progress) {
      const event = this.events[this.cursor++];
      // Muted/hidden/suspended events are consumed, never replayed in a burst.
      if (this.enabled && !document.hidden && this.context?.state === 'running') this.play(event);
    }
  }
  play(event) {
    if (this.voices.size >= 24) return;
    const ctx = this.context, now = ctx.currentTime;
    const envelope = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = event.stage === 3 ? 1800 : 1100;
    filter.Q.value = 0.4;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    if (pan.pan) pan.pan.value = event.pan;
    envelope.connect(filter); filter.connect(pan); pan.connect(this.output);
    const duration = event.stage === 3 ? 1.9 : 1.35;
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(event.amplitude, now + 0.12);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    envelope.gain.linearRampToValueAtTime(0, now + duration + 0.05);
    const frequency = 440 * 2 ** ((event.midi - 69) / 12);
    const oscillators = [1, 2].map((harmonic, i) => {
      const oscillator = ctx.createOscillator(), level = ctx.createGain();
      oscillator.type = 'sine'; oscillator.frequency.value = frequency * harmonic;
      oscillator.detune.value = event.detune;
      level.gain.value = i === 0 ? 0.85 : 0.15;
      oscillator.connect(level); level.connect(envelope);
      oscillator.start(now); oscillator.stop(now + duration + 0.1);
      oscillator.onended = () => { oscillator.disconnect(); level.disconnect(); };
      return oscillator;
    });
    const voice = { envelope, oscillators };
    this.voices.add(voice);
    oscillators[1].addEventListener('ended', () => {
      envelope.disconnect(); filter.disconnect(); pan.disconnect(); this.voices.delete(voice);
    });
  }
}
