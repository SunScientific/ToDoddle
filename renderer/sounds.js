/* sounds.js — Web Audio API sound effects for ToDoddle */
(function () {
  'use strict';

  let _ctx = null;
  function ac() {
    if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
    return _ctx;
  }

  /* play a single tone: freq (Hz), waveform, start offset (s), duration (s), peak gain */
  function tone(freq, type, start, dur, peak) {
    const c   = ac();
    const osc = c.createOscillator();
    const env = c.createGain();
    osc.connect(env);
    env.connect(c.destination);
    osc.type = type;
    osc.frequency.value = freq;
    const t = c.currentTime + start;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(peak, t + 0.01);
    env.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /* ── Sound definitions ── */

  /* Task complete: two-note ascending chime — light & satisfying */
  function _complete() {
    tone(659.25, 'sine', 0,    0.18, 0.22);   /* E5 */
    tone(987.77, 'sine', 0.13, 0.30, 0.28);   /* B5 */
  }

  /* Pin task: low cursed-energy rumble + sharp sting */
  function _pin() {
    tone(82.4,  'triangle', 0,    0.38, 0.40);  /* E2 low rumble  */
    tone(196,   'sawtooth', 0.04, 0.22, 0.20);  /* G3 mid growl   */
    tone(392,   'sine',     0.10, 0.14, 0.12);  /* G4 sting       */
  }

  /* Unpin: soft descending whisper */
  function _unpin() {
    tone(392,    'sine', 0,    0.14, 0.14);   /* G4 */
    tone(293.66, 'sine', 0.10, 0.22, 0.10);   /* D4 */
  }

  /* ── Public API ── */
  let _on = localStorage.getItem('sfx') !== 'false';

  window.SoundFX = {
    isOn  () { return _on; },
    toggle() { _on = !_on; localStorage.setItem('sfx', _on); return _on; },
    play  (fn) { if (_on) { try { fn(); } catch (e) {} } },
    complete () { window.SoundFX.play(_complete); },
    pin      () { window.SoundFX.play(_pin);      },
    unpin    () { window.SoundFX.play(_unpin);    },
  };
})();
