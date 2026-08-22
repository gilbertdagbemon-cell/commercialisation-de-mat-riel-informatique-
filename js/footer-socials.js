import { getPublicVendors } from './supabase.js';
import { escapeHtml, safeHttpUrl, digitsOnly } from './utils.js';

const SOCIALS = [
  { key: 'whatsapp', label: 'WhatsApp', icon: 'bxl-whatsapp', urlKey: 'whatsapp_number', kind: 'whatsapp' },
  { key: 'facebook', label: 'Facebook', icon: 'bxl-facebook', urlKey: 'facebook_url' },
  { key: 'instagram', label: 'Instagram', icon: 'bxl-instagram', urlKey: 'instagram_url' },
  { key: 'tiktok', label: 'TikTok', icon: 'bxl-tiktok', urlKey: 'tiktok_url' },
  { key: 'telegram', label: 'Telegram', icon: 'bxl-telegram', urlKey: 'telegram_url' },
  { key: 'youtube', label: 'YouTube', icon: 'bxl-youtube', urlKey: 'youtube_url' },
  { key: 'linkedin', label: 'LinkedIn', icon: 'bxl-linkedin', urlKey: 'linkedin_url' },
];

function socialUrl(vendor, social) {
  if (social.kind === 'whatsapp') {
    const digits = digitsOnly(vendor.whatsapp_number || vendor.phone || '');
    return digits ? `https://wa.me/${digits}` : '';
  }
  return safeHttpUrl(vendor[social.urlKey] || '', '');
}

function openSocialPicker(social, vendors) {
  const matches = vendors.filter(v => socialUrl(v, social));
  if (!matches.length) return;
  if (matches.length === 1) {
    window.open(socialUrl(matches[0], social), '_blank', 'noopener,noreferrer');
    return;
  }
  const backdrop = document.createElement('div');
  backdrop.className = 'social-picker-backdrop';
  backdrop.innerHTML = `<div class="social-picker" role="dialog" aria-modal="true" aria-labelledby="social-picker-title">
    <button type="button" class="social-picker-close" aria-label="Fermer">&times;</button>
    <span class="section-kicker">RÉSEAUX SOCIAUX</span>
    <h3 id="social-picker-title">Choisissez un vendeur sur ${escapeHtml(social.label)}</h3>
    <div class="social-picker-list">${matches.map((v, i) => `<a class="social-picker-option" href="${escapeHtml(socialUrl(v, social))}" target="_blank" rel="noopener noreferrer"><span class="social-picker-avatar">${escapeHtml((v.full_name || 'V').charAt(0).toUpperCase())}</span><span><strong>${escapeHtml(v.full_name)}</strong><small>${escapeHtml(v.role_title || 'Conseiller Ventes')}</small></span><i class="bx bx-right-arrow-alt" aria-hidden="true"></i></a>`).join('')}</div>
  </div>`;
  document.body.appendChild(backdrop);
  const close = () => backdrop.remove();
  backdrop.querySelector('.social-picker-close')?.addEventListener('click', close);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
  backdrop.querySelector('a')?.focus();
}

async function initSocialFooter() {
  const container = document.querySelector('[data-social-footer]');
  if (!container) return;
  try {
    const vendors = await getPublicVendors();
    // Toujours afficher les 7 réseaux dans l'ordre demandé.
    // Si aucun vendeur n'a encore renseigné un réseau, l'icône reste visible
    // mais désactivée afin que la zone du footer ne paraisse jamais vide.
    container.innerHTML = SOCIALS.map(social => {
      const available = vendors.some(v => socialUrl(v, social));
      return `<button type="button" class="footer-social-link${available ? '' : ' is-disabled'}" data-social="${social.key}" aria-label="${escapeHtml(social.label)}" title="${escapeHtml(social.label)}${available ? '' : ' — aucun profil disponible'}" ${available ? '' : 'aria-disabled="true"'}><i class="bx ${social.icon}" aria-hidden="true"></i></button>`;
    }).join('');
    container.querySelectorAll('[data-social]').forEach(button => {
      button.addEventListener('click', () => {
        const social = SOCIALS.find(item => item.key === button.dataset.social);
        if (!social) return;
        const matches = vendors.filter(v => socialUrl(v, social));
        if (!matches.length) {
          const backdrop = document.createElement('div');
          backdrop.className = 'social-picker-backdrop';
          backdrop.innerHTML = `<div class="social-picker" role="dialog" aria-modal="true" aria-labelledby="social-empty-title"><button type="button" class="social-picker-close" aria-label="Fermer">&times;</button><span class="section-kicker">RÉSEAUX SOCIAUX</span><h3 id="social-empty-title">${escapeHtml(social.label)}</h3><p class="social-picker-empty">Aucun vendeur n’a encore renseigné de profil ${escapeHtml(social.label)}.</p></div>`;
          document.body.appendChild(backdrop);
          const close = () => backdrop.remove();
          backdrop.querySelector('.social-picker-close')?.addEventListener('click', close);
          backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
          backdrop.querySelector('.social-picker-close')?.focus();
          return;
        }
        openSocialPicker(social, vendors);
      });
    });
  } catch (_) {
    container.innerHTML = '';
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initSocialFooter, { once: true });
else initSocialFooter();
