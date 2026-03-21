/* sounds.js — Sound effects for ToDoddle */
(function () {
  'use strict';

  /* ── File-based playback ── */
  function makeAudio(src) {
    const a = new Audio(src);
    a.preload = 'auto';
    return a;
  }

  const SFX = {
    addTask    : makeAudio('addtask.mp3'),
    priority   : makeAudio('priority.mp3'),
    scratchOff : makeAudio('taskscratchoff.mp3'),
    gojoDance  : makeAudio('gojodance.mp3'),
  };

  function playFile(audio) {
    try {
      audio.currentTime = 0;
      audio.play().catch(() => {});
    } catch (e) {}
  }

  /* ── Web Audio synth (kept for unpin only) ── */
  let _ctx = null;
  function ac() {
    if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
    return _ctx;
  }
  function tone(freq, type, start, dur, peak) {
    const c   = ac();
    const osc = c.createOscillator();
    const env = c.createGain();
    osc.connect(env); env.connect(c.destination);
    osc.type = type; osc.frequency.value = freq;
    const t = c.currentTime + start;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(peak, t + 0.01);
    env.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.start(t); osc.stop(t + dur + 0.02);
  }
  function _unpin() {
    tone(392,    'sine', 0,    0.14, 0.14);
    tone(293.66, 'sine', 0.10, 0.22, 0.10);
  }

  /* ── Public API ── */
  let _on = localStorage.getItem('sfx') !== 'false';

  window.SoundFX = {
    isOn     () { return _on; },
    toggle   () { _on = !_on; localStorage.setItem('sfx', _on); return _on; },
    play     (fn) { if (_on) { try { fn(); } catch (e) {} } },

    addTask   () { if (_on) playFile(SFX.addTask);    },
    complete  () { if (_on) playFile(SFX.scratchOff); },
    pin       () { if (_on) playFile(SFX.priority);   },
    unpin     () { window.SoundFX.play(_unpin);        },
    gojoDance () {
      if (!_on) return;
      playFile(SFX.gojoDance);
      setTimeout(() => { SFX.gojoDance.pause(); SFX.gojoDance.currentTime = 0; }, 5000);
    },
  };
})();
