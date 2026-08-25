import { getPublicVendors } from './supabase.js';
import { escapeHtml, safeHttpUrl, digitsOnly } from './utils.js';

const FALLBACK_AVATAR = 'ordimarket-logo.png';

function buildWhatsAppUrl(vendor, product = null) {
  const digits = digitsOnly(vendor.whatsapp_number || vendor.phone || '');
  if (!digits) return '';
  const message = product
    ? `Bonjour, je suis intéressé par le produit : ${product.title}${product.price ? ` au prix de ${product.price}` : ''}.`
    : 'Bonjour, je souhaite avoir des informations sur vos produits OrdiMarket.';
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

function getActionUrl(vendor, channel, product) {
  if (channel === 'whatsapp') return buildWhatsAppUrl(vendor, product);
  const value = channel === 'facebook'
    ? vendor.facebook_url
    : channel === 'instagram'
      ? vendor.instagram_url
      : channel === 'tiktok'
        ? vendor.tiktok_url
        : channel === 'telegram'
          ? vendor.telegram_url
          : channel === 'youtube'
            ? vendor.youtube_url
            : vendor.linkedin_url;
  return safeHttpUrl(value || '', '');
}

function getInitials(name) {
  return String(name || 'V')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part.charAt(0).toUpperCase())
    .join('') || 'V';
}

function createAvatar(vendor) {
  const photo = safeHttpUrl(vendor.photo_url || '', '');
  if (photo) {
    return `<img class="vendor-picker-avatar" src="${escapeHtml(photo)}" alt="${escapeHtml(vendor.full_name || 'Vendeur')}" loading="lazy" data-vendor-fallback="${escapeHtml(FALLBACK_AVATAR)}">`;
  }
  return `<span class="vendor-picker-avatar vendor-picker-avatar-initials" aria-hidden="true">${escapeHtml(getInitials(vendor.full_name))}</span>`;
}

function actionLabel(channel) {
  const labels = {
    whatsapp: 'Contacter sur WhatsApp',
    facebook: 'Ouvrir Facebook',
    instagram: 'Ouvrir Instagram',
    tiktok: 'Ouvrir TikTok',
    telegram: 'Ouvrir Telegram',
    youtube: 'Ouvrir YouTube',
    linkedin: 'Ouvrir LinkedIn',
  };
  return labels[channel] || 'Contacter';
}

function actionIcon(channel) {
  const icons = {
    whatsapp: 'bxl-whatsapp',
    facebook: 'bxl-facebook',
    instagram: 'bxl-instagram',
    tiktok: 'bxl-tiktok',
    telegram: 'bxl-telegram',
    youtube: 'bxl-youtube',
    linkedin: 'bxl-linkedin',
  };
  return icons[channel] || 'bx-link-external';
}

export function openVendorPicker({ channel = 'whatsapp', product = null, vendors = null } = {}) {
  const load = vendors ? Promise.resolve(vendors) : getPublicVendors();
  return load.then(list => {
    const matches = (Array.isArray(list) ? list : []).filter(vendor => getActionUrl(vendor, channel, product));
    const title = product ? 'Choisissez votre conseiller' : `Choisissez un vendeur sur ${channel.charAt(0).toUpperCase() + channel.slice(1)}`;
    const subtitle = product
      ? `Sélectionnez un conseiller pour commander « ${product.title} » directement.`
      : 'Sélectionnez un conseiller pour accéder directement à son moyen de contact.';

    const backdrop = document.createElement('div');
    backdrop.className = 'vendor-picker-modal-backdrop';
    backdrop.innerHTML = `
      <div class="vendor-picker-modal" role="dialog" aria-modal="true" aria-labelledby="vendor-picker-modal-title">
        <button type="button" class="vendor-picker-modal-close" aria-label="Fermer">&times;</button>
        <div class="vendor-picker-modal-header">
          <span class="section-kicker">CONTACT ORDIMARKET</span>
          <h3 id="vendor-picker-modal-title">${escapeHtml(title)}</h3>
          <p>${escapeHtml(subtitle)}</p>
        </div>
        <div class="vendor-picker-modal-list">
          ${matches.length ? matches.map(vendor => {
            const href = getActionUrl(vendor, channel, product);
            return `
              <article class="vendor-picker-card">
                <div class="vendor-picker-card-main">
                  ${createAvatar(vendor)}
                  <div class="vendor-picker-card-info">
                    <strong>${escapeHtml(vendor.full_name || 'Conseiller OrdiMarket')}</strong>
                    <span>${escapeHtml(vendor.role_title || 'Conseiller Ventes')}</span>
                  </div>
                </div>
                <a class="vendor-picker-action vendor-picker-action-${escapeHtml(channel)}" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">
                  <i class="bx ${actionIcon(channel)}" aria-hidden="true"></i>
                  <span>${escapeHtml(actionLabel(channel))}</span>
                </a>
              </article>`;
          }).join('') : `
            <div class="vendor-picker-empty">
              <i class="bx bx-user-x" aria-hidden="true"></i>
              <strong>Aucun conseiller disponible</strong>
              <p>Aucun vendeur n’a encore renseigné ce moyen de contact.</p>
            </div>`}
        </div>
      </div>`;

    document.body.appendChild(backdrop);
    document.body.classList.add('vendor-picker-open');

    const close = () => {
      backdrop.remove();
      document.body.classList.remove('vendor-picker-open');
      document.removeEventListener('keydown', onKeyDown);
    };
    const onKeyDown = event => {
      if (event.key === 'Escape') close();
    };

    backdrop.querySelector('.vendor-picker-modal-close')?.addEventListener('click', close);
    backdrop.addEventListener('click', event => {
      if (event.target === backdrop) close();
    });
    backdrop.querySelectorAll('[data-vendor-fallback]').forEach(img => {
      img.addEventListener('error', () => {
        img.src = img.dataset.vendorFallback;
      }, { once: true });
    });
    document.addEventListener('keydown', onKeyDown);
    backdrop.querySelector('.vendor-picker-modal-close')?.focus();
  });
}

window.OrdiMarketVendorPicker = { open: openVendorPicker };
