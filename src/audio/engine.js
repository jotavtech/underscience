/*
 * UNDERSCIENCE — generative audio engine
 * ------------------------------------------------------------------
 * A self-composing ambient soundtrack built entirely with the Web Audio
 * API — no audio files. A lookahead scheduler weaves four layers:
 *
 *   drone   continuous detuned oscillators, filter slowly opening/closing
 *   pad     long evolving chords drawn from the active world's scale
 *   bells   sparse FM-ish bell tones (the "sparkle"), probabilistic
 *   sub     a slow heartbeat pulse on the root
 *
 * Each world sets a musical "mood" (root, scale, chords, density, timbre)
 * so the music shifts with the visuals. An AnalyserNode taps the final mix
 * and exposes bass / mid / treble / beat levels that drive the shaders.
 *
 * Browsers block audio until a user gesture, so nothing starts until
 * start() is called from a click/key.
 */
(function (root) {
  'use strict';
  var US = (root.US = root.US || {});

  var SEMI = function (n) { return Math.pow(2, n / 12); };

  // scales as semitone offsets from the root
  var SCALES = {
    lydian:      [0, 2, 4, 6, 7, 9, 11],
    dorian:      [0, 2, 3, 5, 7, 9, 10],
    phrygian:    [0, 1, 3, 5, 7, 8, 10],
    majPent:     [0, 2, 4, 7, 9],
    minPent:     [0, 3, 5, 7, 10],
    aeolian:     [0, 2, 3, 5, 7, 8, 10]
  };

  // per-world musical moods. roots are in Hz (low octave anchor).
  var MOODS = {
    aether: {
      root: 73.42,  scale: 'lydian',  bell: 0.55, beat: 2.4,
      chords: [[0, 4, 7], [0, 2, 7], [-3, 2, 5], [0, 4, 9]],
      droneType: 'sawtooth', cutoff: 700, bright: 0.6
    },
    lattice: {
      root: 110.0,  scale: 'majPent', bell: 0.85, beat: 1.8,
      chords: [[0, 4, 7], [2, 5, 9], [4, 7, 11], [0, 5, 7]],
      droneType: 'sawtooth', cutoff: 1100, bright: 0.9
    },
    currents: {
      root: 98.0,   scale: 'dorian',  bell: 0.6, beat: 2.0,
      chords: [[0, 3, 7], [-2, 3, 5], [0, 5, 10], [2, 5, 9]],
      droneType: 'triangle', cutoff: 800, bright: 0.7
    },
    singularity: {
      root: 55.0,   scale: 'phrygian', bell: 0.35, beat: 2.8,
      chords: [[0, 3, 7], [0, 1, 8], [-1, 3, 6], [0, 3, 6]],
      droneType: 'sawtooth', cutoff: 480, bright: 0.35
    },
    genesis: {
      root: 82.41,  scale: 'minPent', bell: 0.7, beat: 2.1,
      chords: [[0, 3, 7], [0, 5, 10], [3, 7, 10], [-2, 3, 7]],
      droneType: 'triangle', cutoff: 760, bright: 0.65
    }
  };

  function AudioEngine() {
    this.ctx = null;
    this.started = false;
    this.muted = false;
    this.volume = 0.85;
    this.mood = MOODS.aether;
    this.moodName = 'aether';
    this._levels = { audio: 0, bass: 0, mid: 0, treble: 0, beat: 0 };
    this._prevBass = 0;
    this._beatEnv = 0;
    this._lookahead = 0.1;     // seconds of scheduling lookahead
    this._nextBeatTime = 0;
    this._beatIndex = 0;
    this._timer = null;
  }

  AudioEngine.prototype._ensureContext = function () {
    if (this.ctx) return;
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) { this.unsupported = true; return; }
    var ctx = new AC();
    this.ctx = ctx;

    // master bus: master -> reverb(wet) + dry -> compressor -> analyser/out
    var master = ctx.createGain();
    master.gain.value = 0.0; // fade in on start
    this.master = master;

    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 24;
    comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.25;

    var wet = ctx.createGain(); wet.gain.value = 0.5;
    var dry = ctx.createGain(); dry.gain.value = 0.85;
    var reverb = ctx.createConvolver();
    reverb.buffer = this._impulse(3.6, 2.6);

    master.connect(dry); dry.connect(comp);
    master.connect(reverb); reverb.connect(wet); wet.connect(comp);

    var analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.78;
    this.analyser = analyser;
    this._freq = new Uint8Array(analyser.frequencyBinCount);

    comp.connect(analyser);
    comp.connect(ctx.destination);

    this._buildDrone();
  };

  // generated reverb impulse response (decaying, slightly colored noise)
  AudioEngine.prototype._impulse = function (seconds, decay) {
    var ctx = this.ctx, rate = ctx.sampleRate;
    var len = Math.floor(seconds * rate);
    var buf = ctx.createBuffer(2, len, rate);
    for (var c = 0; c < 2; c++) {
      var d = buf.getChannelData(c);
      for (var i = 0; i < len; i++) {
        var t = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
      }
    }
    return buf;
  };

  // continuous drone: detuned oscillators through a slowly modulated filter
  AudioEngine.prototype._buildDrone = function () {
    var ctx = this.ctx;
    var g = ctx.createGain(); g.gain.value = 0.16;
    var filt = ctx.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = this.mood.cutoff; filt.Q.value = 6;
    // slow LFO opening/closing the filter for movement
    var lfo = ctx.createOscillator(); lfo.frequency.value = 0.05;
    var lfoGain = ctx.createGain(); lfoGain.gain.value = 260;
    lfo.connect(lfoGain); lfoGain.connect(filt.frequency); lfo.start();

    var oscs = [];
    var detunes = [-7, -0.2, 0.15, 7, 12];
    for (var i = 0; i < detunes.length; i++) {
      var o = ctx.createOscillator();
      o.type = this.mood.droneType;
      o.frequency.value = this.mood.root;
      o.detune.value = detunes[i];
      var og = ctx.createGain();
      og.gain.value = i === 0 || i === 3 ? 0.25 : 0.5;
      o.connect(og); og.connect(filt); o.start();
      oscs.push({ o: o, g: og });
    }
    filt.connect(g); g.connect(this.master);
    this.drone = { g: g, filt: filt, oscs: oscs, lfo: lfo, lfoGain: lfoGain };
  };

  AudioEngine.prototype.setMood = function (name) {
    if (!MOODS[name] || name === this.moodName) return;
    this.moodName = name;
    var m = this.mood = MOODS[name];
    if (!this.ctx || !this.drone) return;
    var ctx = this.ctx, t = ctx.currentTime;
    // glide the drone to the new root & timbre
    var d = this.drone;
    for (var i = 0; i < d.oscs.length; i++) {
      d.oscs[i].o.type = m.droneType;
      d.oscs[i].o.frequency.cancelScheduledValues(t);
      d.oscs[i].o.frequency.setTargetAtTime(m.root, t, 1.8);
    }
    d.filt.frequency.cancelScheduledValues(t);
    d.filt.frequency.setTargetAtTime(m.cutoff, t, 2.0);
  };

  // one voice: oscillator -> gain envelope -> (optional filter) -> master
  AudioEngine.prototype._voice = function (freq, time, dur, opts) {
    var ctx = this.ctx;
    opts = opts || {};
    var o = ctx.createOscillator();
    o.type = opts.type || 'sine';
    o.frequency.value = freq;
    if (opts.detune) o.detune.value = opts.detune;
    var g = ctx.createGain();
    var peak = (opts.gain || 0.2);
    var atk = opts.attack != null ? opts.attack : 0.02;
    var rel = opts.release != null ? opts.release : 0.6;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(peak, time + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, time + atk + dur + rel);
    var node = o;
    if (opts.filter) {
      var f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = opts.filter; f.Q.value = opts.q || 1;
      o.connect(f); node = f;
    }
    node.connect(g); g.connect(this.master);
    o.start(time);
    o.stop(time + atk + dur + rel + 0.05);
    // a second partial for bell shimmer
    if (opts.bell) {
      var o2 = ctx.createOscillator();
      o2.type = 'sine'; o2.frequency.value = freq * 2.01;
      var g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.0001, time);
      g2.gain.exponentialRampToValueAtTime(peak * 0.4, time + atk);
      g2.gain.exponentialRampToValueAtTime(0.0001, time + atk + dur + rel * 0.7);
      o2.connect(g2); g2.connect(this.master);
      o2.start(time); o2.stop(time + atk + dur + rel + 0.05);
    }
  };

  AudioEngine.prototype._scaleFreq = function (degree, octave) {
    var sc = SCALES[this.mood.scale];
    var n = ((degree % sc.length) + sc.length) % sc.length;
    var oct = octave + Math.floor(degree / sc.length);
    return this.mood.root * SEMI(sc[n]) * Math.pow(2, oct);
  };

  // schedule everything that falls inside the next beat
  AudioEngine.prototype._scheduleBeat = function (time) {
    var m = this.mood;
    var idx = this._beatIndex++;

    // pad chord every 4 beats
    if (idx % 4 === 0) {
      var chord = m.chords[(idx / 4) % m.chords.length | 0];
      for (var i = 0; i < chord.length; i++) {
        var f = m.root * SEMI(chord[i]) * 2; // mid octave
        this._voice(f, time, m.beat * 3.4, {
          type: m.droneType === 'sawtooth' ? 'triangle' : 'sine',
          gain: 0.06, attack: 1.2, release: 2.4,
          filter: 900 + m.bright * 1400, q: 0.7
        });
      }
    }

    // sub heartbeat on the root every 2 beats
    if (idx % 2 === 0) {
      this._voice(m.root * 0.5, time, 0.18, {
        type: 'sine', gain: 0.5, attack: 0.01, release: 0.5
      });
    }

    // bells: probabilistic sparkle on scale tones
    if (Math.random() < m.bell) {
      var deg = (Math.random() * 7) | 0;
      var octv = 2 + ((Math.random() < 0.4) ? 1 : 0);
      var f2 = this._scaleFreq(deg, octv);
      var off = Math.random() * m.beat * 0.5;
      this._voice(f2, time + off, 0.05, {
        type: 'sine', gain: 0.10 + 0.06 * m.bright, attack: 0.005,
        release: 1.6 + Math.random(), bell: true
      });
      // sometimes a quick answering note
      if (Math.random() < 0.4) {
        var f3 = this._scaleFreq(deg + 2, octv);
        this._voice(f3, time + off + m.beat * 0.33, 0.05, {
          type: 'sine', gain: 0.07, attack: 0.005, release: 1.2, bell: true
        });
      }
    }
  };

  AudioEngine.prototype._tick = function () {
    if (!this.ctx) return;
    var now = this.ctx.currentTime;
    while (this._nextBeatTime < now + this._lookahead) {
      this._scheduleBeat(this._nextBeatTime);
      this._nextBeatTime += this.mood.beat * (0.92 + Math.random() * 0.16);
    }
  };

  AudioEngine.prototype.start = function () {
    this._ensureContext();
    if (!this.ctx) return false;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (!this.started) {
      this.started = true;
      this._nextBeatTime = this.ctx.currentTime + 0.15;
      var self = this;
      this._timer = setInterval(function () { self._tick(); }, 60);
    }
    var t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, t, 1.5);
    return true;
  };

  AudioEngine.prototype.setMuted = function (m) {
    this.muted = m;
    if (this.ctx && this.master) {
      var t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(m ? 0 : this.volume, t, 0.4);
    }
  };

  AudioEngine.prototype.setVolume = function (v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (!this.muted && this.ctx && this.master) {
      this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.2);
    }
  };

  // read analyser; compute normalized band levels + beat envelope
  AudioEngine.prototype.update = function () {
    var L = this._levels;
    if (!this.analyser) return L;
    this.analyser.getByteFrequencyData(this._freq);
    var f = this._freq, n = f.length;
    var bEnd = Math.max(2, (n * 0.06) | 0);
    var mEnd = (n * 0.28) | 0;
    var sum = 0, bass = 0, mid = 0, treble = 0;
    var i;
    for (i = 0; i < bEnd; i++) bass += f[i];
    for (i = bEnd; i < mEnd; i++) mid += f[i];
    for (i = mEnd; i < n; i++) treble += f[i];
    for (i = 0; i < n; i++) sum += f[i];
    bass /= (bEnd * 255); mid /= ((mEnd - bEnd) * 255); treble /= ((n - mEnd) * 255);
    var audio = sum / (n * 255);

    // beat from positive bass flux
    var flux = Math.max(0, bass - this._prevBass);
    this._prevBass = bass;
    this._beatEnv = Math.max(this._beatEnv * 0.90, flux * 6.0);
    var beat = Math.min(1, this._beatEnv);

    // light smoothing
    L.bass += (bass - L.bass) * 0.5;
    L.mid += (mid - L.mid) * 0.5;
    L.treble += (treble - L.treble) * 0.5;
    L.audio += (audio - L.audio) * 0.5;
    L.beat = beat;
    return L;
  };

  AudioEngine.prototype.getLevels = function () { return this._levels; };

  US.AudioEngine = AudioEngine;
})(typeof window !== 'undefined' ? window : globalThis);
