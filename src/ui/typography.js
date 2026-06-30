/*
 * Kinetic typography helper.
 * splitText() wraps every word of an element in
 *   <span class="t-word"><i>word</i></span>
 * and assigns a staggered transition-delay so that, when the parent gains
 * the `.is-in` class, the words rise and un-blur one after another. The CSS
 * does the actual animating.
 */
(function (root) {
  'use strict';
  var US = (root.US = root.US || {});

  US.splitText = function (el, baseDelay) {
    if (!el) return;
    var text = el.getAttribute('data-text');
    if (text == null) { text = el.textContent; el.setAttribute('data-text', text); }
    var words = text.split(/(\s+)/); // keep whitespace tokens
    el.textContent = '';
    var d = baseDelay || 0;
    var i = 0;
    words.forEach(function (w) {
      if (/^\s+$/.test(w)) { el.appendChild(document.createTextNode(' ')); return; }
      var span = document.createElement('span');
      span.className = 't-word';
      var inner = document.createElement('i');
      inner.textContent = w;
      inner.style.transitionDelay = (d + i * 0.055) + 's';
      span.appendChild(inner);
      el.appendChild(span);
      i++;
    });
  };
})(typeof window !== 'undefined' ? window : globalThis);
