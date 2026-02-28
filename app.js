const header = document.querySelector('.site-header');
const menuToggle = document.getElementById('menu-toggle');
const navLinks = [...document.querySelectorAll('.main-nav a, .header-actions a')];
const revealNodes = [...document.querySelectorAll('[data-reveal]')];
const yearEl = document.getElementById('year');
const heroGenreWheel = document.getElementById('hero-genre-wheel');

if (yearEl) {
  yearEl.textContent = new Date().getFullYear();
}

if (menuToggle && header) {
  menuToggle.addEventListener('click', () => {
    const expanded = menuToggle.getAttribute('aria-expanded') === 'true';
    menuToggle.setAttribute('aria-expanded', String(!expanded));
    header.classList.toggle('open', !expanded);
  });

  navLinks.forEach((link) => {
    link.addEventListener('click', () => {
      header.classList.remove('open');
      menuToggle.setAttribute('aria-expanded', 'false');
    });
  });
}

if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;

        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    },
    {
      threshold: 0.15,
      rootMargin: '0px 0px -32px 0px',
    },
  );

  revealNodes.forEach((node, index) => {
    node.style.transitionDelay = `${Math.min(index * 35, 260)}ms`;
    observer.observe(node);
  });
} else {
  revealNodes.forEach((node) => node.classList.add('is-visible'));
}

if (heroGenreWheel) {
  const genres = [
    { key: 'fantasy', name: 'Fantasy' },
    { key: 'romance', name: 'Romance' },
    { key: 'sci-fi', name: 'Sci-Fi' },
    { key: 'mystery', name: 'Mystery' },
    { key: 'horror', name: 'Horror' },
    { key: 'comedy', name: 'Comedy' },
    { key: 'nonfiction', name: 'Nonfiction' },
    { key: 'historical', name: 'Historical' },
  ];
  const genreKeys = genres.map((genre) => genre.key);

  let genreIndex = 0;
  const renderGenre = (genre) => {
    heroGenreWheel.classList.remove(...genreKeys);
    heroGenreWheel.classList.add(genre.key);
    heroGenreWheel.textContent = genre.name;
  };

  const cycleGenre = () => {
    heroGenreWheel.classList.add('is-exit');
    window.setTimeout(() => {
      genreIndex = (genreIndex + 1) % genres.length;
      renderGenre(genres[genreIndex]);
      heroGenreWheel.classList.remove('is-exit');
      heroGenreWheel.classList.add('is-enter');
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          heroGenreWheel.classList.remove('is-enter');
        });
      });
    }, 140);
  };

  renderGenre(genres[genreIndex]);
  window.setInterval(cycleGenre, 600);
}
