/* =============================================================
   UNDERSCIENCE · audio.js
   Motor de áudio ambiente generativo (Web Audio API pura).
   Drones evolutivos + notas cintilantes com reverbe sintetizado.
   Cada "espécime" pode definir um clima (raiz, escala, brilho).
   Expõe: window.UnderAudio() -> engine
   ============================================================= */
(function () {
  'use strict';

  // Escalas em semitons a partir da raiz.
  var SCALES = {
    pentMinor: [0, 3, 5, 7, 10],
    pentMajor: [0, 2, 4, 7, 9],
    lydian: [0, 2, 4, 6, 7, 9, 11],
    dorian: [0, 2, 3, 5, 7, 9, 10],
    hirajoshi: [0, 2, 3, 7, 8]
  };

  function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  function UnderAudio() {
    var ctx = null;
    var master = null, wet = null, dry = null, conv = null, comp = null, lp = null, lfo = null, lfoGain = null;
    var enabled = false;
    var started = false;
    var schedTimer = null;
    var nextNoteTime = 0;
    var droneVoices = [];
    var step = 0;

    var mood = {
      root: 50,            // nota MIDI raiz (~ Ré2)
      scale: 'pentMinor',
      tempo: 2.6,          // segundos por evento melódico
      brightness: 1200,    // corte do filtro
      density: 0.6
    };

    function makeImpulse(seconds, decay) {
      var rate = ctx.sampleRate;
      var len = Math.max(1, Math.floor(rate * seconds));
      var buf = ctx.createBuffer(2, len, rate);
      for (var ch = 0; ch < 2; ch++) {
        var d = buf.getChannelData(ch);
        for (var i = 0; i < len; i++) {
          d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
        }
      }
      return buf;
    }

    function ensure() {
      if (ctx) return true;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();

      master = ctx.createGain();
      master.gain.value = 0.0;

      comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.knee.value = 24;
      comp.ratio.value = 6;
      comp.attack.value = 0.008;
      comp.release.value = 0.3;

      lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = mood.brightness;
      lp.Q.value = 0.6;

      // LFO suave modulando o brilho.
      lfo = ctx.createOscillator();
      lfo.frequency.value = 0.05;
      lfoGain = ctx.createGain();
      lfoGain.gain.value = 500;
      lfo.connect(lfoGain);
      lfoGain.connect(lp.frequency);
      lfo.start();

      conv = ctx.createConvolver();
      conv.buffer = makeImpulse(4.2, 3.0);
      wet = ctx.createGain(); wet.gain.value = 0.55;
      dry = ctx.createGain(); dry.gain.value = 0.75;

      // roteamento: vozes -> lp -> (dry + wet->conv) -> comp -> master -> saída
      lp.connect(dry);
      lp.connect(conv);
      conv.connect(wet);
      dry.connect(comp);
      wet.connect(comp);
      comp.connect(master);
      master.connect(ctx.destination);

      buildDrones();
      return true;
    }

    function buildDrones() {
      // 3 vozes de drone levemente desafinadas sustentando raiz + quinta.
      var roots = [mood.root - 12, mood.root - 12, mood.root - 5];
      for (var i = 0; i < roots.length; i++) {
        var osc = ctx.createOscillator();
        osc.type = i === 2 ? 'triangle' : 'sine';
        osc.frequency.value = midiToFreq(roots[i]);
        osc.detune.value = (i - 1) * 6;
        var g = ctx.createGain();
        g.gain.value = 0.0;
        osc.connect(g);
        g.connect(lp);
        osc.start();
        droneVoices.push({ osc: osc, gain: g, base: roots[i] });
      }
    }

    function setDroneLevel(level, when) {
      for (var i = 0; i < droneVoices.length; i++) {
        var target = level * (i === 2 ? 0.06 : 0.09);
        droneVoices[i].gain.gain.cancelScheduledValues(when);
        droneVoices[i].gain.gain.setTargetAtTime(target, when, 1.6);
      }
    }

    function playNote(time, midi, dur, gain, type) {
      var osc = ctx.createOscillator();
      osc.type = type || 'sine';
      osc.frequency.value = midiToFreq(midi);
      var g = ctx.createGain();
      var peak = gain == null ? 0.12 : gain;
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(peak, time + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, time + (dur || 2.2));
      // leve panorâmica estéreo
      var pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      osc.connect(g);
      if (pan) { pan.pan.value = Math.random() * 1.4 - 0.7; g.connect(pan); pan.connect(lp); }
      else { g.connect(lp); }
      osc.start(time);
      osc.stop(time + (dur || 2.2) + 0.1);
    }

    function scheduler() {
      if (!ctx) return;
      var ahead = 0.4;
      while (nextNoteTime < ctx.currentTime + ahead) {
        var scale = SCALES[mood.scale] || SCALES.pentMinor;
        if (Math.random() < mood.density) {
          var deg = scale[(Math.random() * scale.length) | 0];
          var oct = 12 * (1 + ((Math.random() * 3) | 0));
          var midi = mood.root + deg + oct;
          var bright = step % 4 === 0;
          playNote(nextNoteTime, midi, bright ? 3.4 : 2.0,
                   bright ? 0.10 : 0.07, bright ? 'sine' : 'triangle');
        }
        // ocasional contraponto grave
        if (Math.random() < 0.18) {
          var deg2 = scale[(Math.random() * scale.length) | 0];
          playNote(nextNoteTime + 0.5, mood.root + deg2, 4.5, 0.05, 'sine');
        }
        step++;
        var swing = 0.85 + Math.random() * 0.6;
        nextNoteTime += mood.tempo * swing * 0.5;
      }
      schedTimer = setTimeout(scheduler, 120);
    }

    return {
      ensure: ensure,
      isEnabled: function () { return enabled; },
      isReady: function () { return !!ctx; },

      start: function () {
        if (!ensure()) return false;
        if (ctx.state === 'suspended') ctx.resume();
        enabled = true;
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setTargetAtTime(0.55, ctx.currentTime, 1.2);
        setDroneLevel(1, ctx.currentTime);
        if (!started) {
          started = true;
          nextNoteTime = ctx.currentTime + 0.2;
          scheduler();
        }
        return true;
      },

      stop: function () {
        if (!ctx) { enabled = false; return; }
        enabled = false;
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setTargetAtTime(0.0, ctx.currentTime, 0.6);
        setDroneLevel(0, ctx.currentTime);
      },

      toggle: function () {
        if (enabled) { this.stop(); return false; }
        this.start(); return true;
      },

      setMood: function (m) {
        for (var k in m) if (m.hasOwnProperty(k)) mood[k] = m[k];
        if (!ctx) return;
        lp.frequency.cancelScheduledValues(ctx.currentTime);
        lp.frequency.setTargetAtTime(mood.brightness, ctx.currentTime, 1.5);
        for (var i = 0; i < droneVoices.length; i++) {
          var dv = droneVoices[i];
          var newBase = i === 2 ? mood.root - 5 : mood.root - 12;
          dv.osc.frequency.setTargetAtTime(midiToFreq(newBase), ctx.currentTime, 2.0);
        }
      },

      // sfx curto para interações (cliques, sementes, etc.)
      ping: function (freq, opts) {
        if (!ctx || !enabled) return;
        opts = opts || {};
        var t = ctx.currentTime;
        var osc = ctx.createOscillator();
        osc.type = opts.type || 'sine';
        osc.frequency.setValueAtTime(freq || 660, t);
        if (opts.glide) osc.frequency.exponentialRampToValueAtTime((freq || 660) * opts.glide, t + (opts.dur || 0.18));
        var g = ctx.createGain();
        var peak = opts.gain == null ? 0.08 : opts.gain;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(peak, t + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, t + (opts.dur || 0.18));
        osc.connect(g); g.connect(lp);
        osc.start(t); osc.stop(t + (opts.dur || 0.18) + 0.05);
      }
    };
  }

  window.UnderAudio = UnderAudio;
})();
