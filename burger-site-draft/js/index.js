    /* ---------- Carousel ---------- */
    (function () {
      const root = document.querySelector('[data-carousel]');
      if (!root) return;

      const slides = Array.from(root.querySelectorAll('.carousel__slide'));
      const dots   = Array.from(document.querySelectorAll('[data-carousel-dot]'));
      const prev   = document.querySelector('[data-carousel-prev]');
      const next   = document.querySelector('[data-carousel-next]');

      let index = 0;
      let timer = null;
      const DELAY = 6000;

      function go(i) {
        index = (i + slides.length) % slides.length;
        slides.forEach((s, n) => s.classList.toggle('is-active', n === index));
        dots.forEach((d, n)   => d.classList.toggle('is-active', n === index));
      }
      function play() {
        stop();
        timer = setInterval(() => go(index + 1), DELAY);
      }
      function stop() {
        if (timer) { clearInterval(timer); timer = null; }
      }

      prev.addEventListener('click', () => { go(index - 1); play(); });
      next.addEventListener('click', () => { go(index + 1); play(); });
      dots.forEach((d, n) => d.addEventListener('click', () => { go(n); play(); }));

      // Pause on hover, resume on leave
      root.parentElement.addEventListener('mouseenter', stop);
      root.parentElement.addEventListener('mouseleave', play);

      // Keyboard arrows when carousel is in viewport
      document.addEventListener('keydown', (e) => {
        if (!root.parentElement.matches(':hover')) return;
        if (e.key === 'ArrowLeft')  { go(index - 1); play(); }
        if (e.key === 'ArrowRight') { go(index + 1); play(); }
      });

      play();
    })();

    /* ---------- Footer year ---------- */
    document.querySelectorAll('[data-year]').forEach(el => {
      el.textContent = new Date().getFullYear();
    });
