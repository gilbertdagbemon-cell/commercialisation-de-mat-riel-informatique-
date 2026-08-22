// OrdiMarket — configuration publique partagée
// Cette configuration ne contient que des valeurs destinées au navigateur.
export const SUPABASE_URL = 'https://cxwsjejfxfknctrtyjjc.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_vLTETicm3M_VfC3oiyOnog_Tvphju5b';
export const STORAGE_BUCKETS = { productMedia: 'product-media', adminAvatars: 'admin-avatars' };
export const WHATSAPP_DEFAULT_MESSAGE = (title, price) =>
  `Bonjour, je suis intéressé(e) par : ${title}${price ? ' (' + price + ')' : ''}. Est-il toujours disponible ?`;
