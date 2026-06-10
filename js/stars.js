(function () {
  function createStars(selector, count) {
    var container = document.querySelector(selector);
    if (!container) return;

    var fragment = document.createDocumentFragment();

    for (var i = 0; i < count; i++) {
      var star = document.createElement('div');
      star.className = 'star';

      var size = (Math.random() * 2 + 1).toFixed(2);
      star.style.width = size + 'px';
      star.style.height = size + 'px';
      star.style.top = (Math.random() * 100).toFixed(2) + '%';
      star.style.left = (Math.random() * 100).toFixed(2) + '%';
      star.style.setProperty('--min-op', (Math.random() * 0.3).toFixed(2));
      star.style.animationDuration = (Math.random() * 4 + 3).toFixed(2) + 's';
      star.style.animationDelay = (Math.random() * 5).toFixed(2) + 's';

      fragment.appendChild(star);
    }

    container.appendChild(fragment);
  }

  document.addEventListener('DOMContentLoaded', function () {
    createStars('.stars', 140);
  });
})();
