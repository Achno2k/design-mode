(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // copy buttons
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.top = '-1000px';
      document.body.appendChild(area);
      area.select();
      var done = false;
      try { done = document.execCommand('copy'); } catch (e) { done = false; }
      document.body.removeChild(area);
      done ? resolve() : reject(new Error('copy failed'));
    });
  }
  Array.prototype.forEach.call(document.querySelectorAll('.copy[data-copy]'), function (button) {
    var timer = null;
    button.addEventListener('click', function () {
      copyText(button.getAttribute('data-copy')).then(function () {
        button.classList.add('copy--done');
        button.setAttribute('aria-label', 'Copied');
        clearTimeout(timer);
        timer = setTimeout(function () {
          button.classList.remove('copy--done');
          button.setAttribute('aria-label', 'Copy command');
        }, 1200);
      });
    });
  });

  // scroll reveal (also draws the callout lines on the panel)
  var targets = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
  if (reduced || !('IntersectionObserver' in window)) {
    targets.forEach(function (el) { el.setAttribute('data-shown', 'true'); });
  } else {
    var reveal = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.setAttribute('data-shown', 'true');
        reveal.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    targets.forEach(function (el) { reveal.observe(el); });
  }

  // "Day to day": the rest of the loop behind a More button
  var moreButton = document.getElementById('loop-toggle');
  var more = document.getElementById('loop-more');
  if (moreButton && more) {
    moreButton.addEventListener('click', function () {
      var open = more.hidden;
      more.hidden = !open;
      moreButton.setAttribute('aria-expanded', open ? 'true' : 'false');
      moreButton.textContent = open ? 'Less' : 'More';
    });
  }
})();
