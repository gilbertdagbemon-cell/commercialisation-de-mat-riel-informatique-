import { getPublicVendors } from './supabase.js';
import { escapeHtml, safeHttpUrl, digitsOnly } from './utils.js';
import { openVendorPicker } from './vendor-picker.js';

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
  return openVendorPicker({ channel: social.key, vendors });
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
        openSocialPicker(social, vendors);
      });
    });
  } catch (_) {
    container.innerHTML = '';
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initSocialFooter, { once: true });
else initSocialFooter();
