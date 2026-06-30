/*
 * Custom cursor: a dot that tracks the pointer exactly and a ring that
 * eases behind it. Grows over interactive elements, shrinks on press.
 * Disabled automatically on touch devices (see CSS).
 */
(function (root) {
  'use strict';
  var US = (root.US = root.US || {});

  US.initCursor = function () {
    var el = document.getElementById('cursor');
    if (!el || matchMedia('(pointer: coarse)').matches) return null;
    var dot = el.querySelector('.cursor__dot');
    var ring = el.querySelector('.cursor__ring');

    var tx = window.innerWidth / 2, ty = window.innerHeight / 2;
    var rx = tx, ry = ty;

    window.addEventListener('mousemove', function (e) {
      tx = e.clientX; ty = e.clientY;
      dot.style.transform = 'translate(' + tx + 'px,' + ty + 'px)';
    }, { passive: true });

    window.addEventListener('mousedown', function () { el.classList.add('is-down'); });
    window.addEventListener('mouseup', function () { el.classList.remove('is-down'); });

    // hot state over anything clickable
    document.addEventListener('mouseover', function (e) {
      var t = e.target;
      var hot = t.closest && t.closest('button, a, .rail button, .ctl');
      el.classList.toggle('is-hot', !!hot);
    });

    (function loop() {
      rx += (tx - rx) * 0.18; ry += (ty - ry) * 0.18;
      ring.style.transform = 'translate(' + rx + 'px,' + ry + 'px)';
      requestAnimationFrame(loop);
    })();
    return el;
  };
})(typeof window !== 'undefined' ? window : globalThis);
