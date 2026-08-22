export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function safeHttpUrl(value, fallback = '') {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  if (raw.startsWith('/') || raw.startsWith('./') || raw.startsWith('../')) return raw;
  try {
    const url = new URL(raw, window.location.href);
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.href;
  } catch (_) {}
  return fallback;
}

export function digitsOnly(value) {
  return String(value ?? '').replace(/\D/g, '');
}

export function initThemeToggle() {
  const body = document.body;
  if (!body || body.dataset.themeBound === '1') return;
  body.dataset.themeBound = '1';
  const saved = localStorage.getItem('ordimarket:theme');
  if (saved === 'dark' || saved === 'light') { body.classList.toggle('dark-theme', saved === 'dark'); body.classList.toggle('light-theme', saved === 'light'); }
  const buttons = document.querySelectorAll('[data-theme-toggle]');
  const update = () => buttons.forEach(button => {
    const dark = body.classList.contains('dark-theme');
    button.setAttribute('aria-label', dark ? 'Activer le mode clair' : 'Activer le mode sombre');
    button.setAttribute('aria-pressed', String(dark));
    button.innerHTML = `<i class="bx ${dark ? 'bx-sun' : 'bx-moon'}"></i>`;
  });
  buttons.forEach(button => button.addEventListener('click', () => {
    const dark = !body.classList.contains('dark-theme');
    body.classList.toggle('dark-theme', dark);
    body.classList.toggle('light-theme', !dark);
    localStorage.setItem('ordimarket:theme', dark ? 'dark' : 'light');
    update();
  }));
  update();
}

function initSiteShell() {
  const header = document.querySelector('header');
  if (header) {
    const updateHeader = () => header.classList.toggle('scrolled', window.scrollY > 20);
    updateHeader();
    window.addEventListener('scroll', updateHeader, { passive: true });
  }

  initThemeToggle();

  const menuBtn = document.querySelector('.mobile-menu-toggle');
  const nav = document.querySelector('nav');
  if (menuBtn && nav) {
    menuBtn.addEventListener('click', () => {
      const active = nav.classList.toggle('active');
      menuBtn.setAttribute('aria-expanded', String(active));
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSiteShell, { once: true });
} else {
  initSiteShell();
}
