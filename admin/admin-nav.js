const shell = document.querySelector('.admin-shell');
const side = document.querySelector('.admin-side');

async function addTeamLink() {
  try {
    const { getCurrentAdmin } = await import('./supabase-client.js');
    const admin = await getCurrentAdmin();
    if (admin?.role !== 'super_admin') return;
    const nav = side?.querySelector('.admin-nav');
    if (!nav || nav.querySelector('[data-team-link]')) return;
    const link = document.createElement('a');
    link.href = 'team.html'; link.dataset.teamLink = '1';
    link.innerHTML = "<i class='bx bx-group'></i> Équipe admin";
    nav.appendChild(link);
  } catch (_) {}
}

function addFaqLink() {
  const nav = side?.querySelector('.admin-nav');
  if (!nav || nav.querySelector('[data-faq-link]')) return;
  const link = document.createElement('a');
  link.href = 'faq.html'; link.dataset.faqLink = '1';
  link.innerHTML = "<i class='bx bx-help-circle'></i> FAQ";
  if (location.pathname.endsWith('/faq.html') || location.pathname.endsWith('\\faq.html')) link.classList.add('active');
  nav.appendChild(link);
}

if (shell && side) {
  const toggle = document.createElement('button');
  toggle.type = 'button'; toggle.className = 'admin-menu-toggle'; toggle.setAttribute('aria-label','Ouvrir le menu'); toggle.setAttribute('aria-expanded','false'); toggle.innerHTML="<i class='bx bx-menu'></i>";
  shell.prepend(toggle);
  const close=()=>{shell.classList.remove('menu-open');toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','Ouvrir le menu');toggle.innerHTML="<i class='bx bx-menu'></i>"};
  toggle.addEventListener('click',()=>{const open=shell.classList.toggle('menu-open');toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',open?'Fermer le menu':'Ouvrir le menu');toggle.innerHTML=open?"<i class='bx bx-x'></i>":"<i class='bx bx-menu'></i>"});
  side.querySelectorAll('a').forEach(a=>a.addEventListener('click',close));
  document.addEventListener('click',e=>{if(shell.classList.contains('menu-open')&&!side.contains(e.target)&&e.target!==toggle)close()});
  addFaqLink();
  addTeamLink();
}
