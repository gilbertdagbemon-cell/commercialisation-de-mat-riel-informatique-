import { supabase, getPublicVendors } from './supabase.js';
import { escapeHtml, digitsOnly, safeHttpUrl } from './utils.js';
import { renderProductsGrid, updateFavoriteCounter } from './product-ui.js';

async function loadHomeProducts() {
  const grid = document.getElementById('products-grid');
  if (!grid) return;
  const { data, error } = await supabase
    .from('products')
    .select('*, brands(name), categories(name), media(id,type,url,position,is_cover)')
    .eq('is_published', true)
    .order('is_featured', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(6);
  if (error) {
    console.error('Chargement produits:', error);
    grid.innerHTML = '<div class="empty-state">Impossible de charger les produits pour le moment.</div>';
    return;
  }
  renderProductsGrid(data || [], grid, { showStock: true });
}


async function loadHomeFilters() {
  const [brandResult, categoryResult] = await Promise.all([
    supabase.from('brands').select('id,name').eq('is_active', true).order('name'),
    supabase.from('categories').select('id,name').eq('is_active', true).order('display_order').order('name'),
  ]);
  if (brandResult.error) throw brandResult.error;
  if (categoryResult.error) throw categoryResult.error;
  const categories = document.getElementById('categories-chips');
  const brands = document.getElementById('brands-chips');
  if (categories) categories.innerHTML = '<button type="button" class="chip active" data-filter-category="">Tous</button>' + (categoryResult.data || []).map(c => `<button type="button" class="chip" data-filter-category="${escapeHtml(c.id)}">${escapeHtml(c.name)}</button>`).join('');
  if (brands) brands.innerHTML = '<button type="button" class="chip active" data-filter-brand="">Toutes les marques</button>' + (brandResult.data || []).map(b => `<button type="button" class="chip" data-filter-brand="${escapeHtml(b.id)}">${escapeHtml(b.name)}</button>`).join('');
  const apply = async () => {
    const categoryId = categories?.querySelector('.chip.active')?.dataset.filterCategory || '';
    const brandId = brands?.querySelector('.chip.active')?.dataset.filterBrand || '';
    let query = supabase.from('products').select('*, brands(name), categories(name), media(id,type,url,position,is_cover)').eq('is_published', true).order('is_featured', { ascending: false }).order('created_at', { ascending: false }).limit(12);
    if (categoryId) query = query.eq('category_id', categoryId);
    if (brandId) query = query.eq('brand_id', brandId);
    const { data, error } = await query;
    if (error) throw error;
    renderProductsGrid(data || [], '#products-grid', { showStock: true });
  };
  [categories, brands].forEach(container => container?.addEventListener('click', async event => {
    const chip = event.target.closest('.chip');
    if (!chip) return;
    container.querySelectorAll('.chip').forEach(item => item.classList.remove('active'));
    chip.classList.add('active');
    try { await apply(); } catch (error) { console.error('Filtre accueil:', error); }
  }));
}

async function loadTestimonials() {
  const grid = document.getElementById('testimonials-grid');
  if (!grid) return;
  const { data, error } = await supabase
    .from('testimonials')
    .select('name,author_role,content,rating,avatar_url')
    .eq('is_published', true)
    .order('display_order', { ascending: true })
    .limit(12);
  if (error) { console.error('Chargement témoignages:', error); return; }
  grid.innerHTML = (data || []).map(item => `
    <article class="testi-card">
      <div class="testi-head">
        <img src="${escapeHtml(safeHttpUrl(item.avatar_url || '', 'ordimarket-logo.png'))}" alt="${escapeHtml(item.name)}" loading="lazy">
        <div><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.author_role || 'Client')}</span></div>
      </div>
      <div class="testi-stars">${'★'.repeat(Math.max(0, Math.min(5, Number(item.rating) || 5)))}</div>
      <p>${escapeHtml(item.content)}</p>
    </article>`).join('');
}



async function loadFaqs() {
  const list = document.getElementById('faq-list');
  if (!list) return;
  const { data, error } = await supabase
    .from('faqs')
    .select('id,question,answer')
    .eq('is_active', true)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) {
    console.error('Chargement FAQ:', error);
    list.innerHTML = '<p class="faq-empty">La FAQ est momentanément indisponible.</p>';
    return;
  }
  if (!data?.length) {
    list.innerHTML = '<p class="faq-empty">Aucune question fréquente pour le moment.</p>';
    return;
  }
  list.innerHTML = data.map(item => `<details class="faq-item"><summary aria-expanded="false">${escapeHtml(item.question)}<i class="bx bx-chevron-down" aria-hidden="true"></i></summary><div class="faq-answer">${escapeHtml(item.answer).replace(/\n/g, '<br>')}</div></details>`).join('');
  list.querySelectorAll('.faq-item').forEach(item => { const summary=item.querySelector('summary'); item.addEventListener('toggle', () => summary?.setAttribute('aria-expanded', String(item.open))); });
}

async function initVendorPicker() {
  const select = document.getElementById('vendor-select');
  const card = document.getElementById('selected-vendor');
  if (!select || !card) return;
  try {
    const vendors = await getPublicVendors();
    select.innerHTML = '<option value="">Choisir un conseiller</option>' + vendors.map((v, i) => `<option value="${i}">${escapeHtml(v.full_name)} — ${escapeHtml(v.role_title || 'Conseiller Ventes')}</option>`).join('');
    const render = () => {
      const vendor = vendors[Number(select.value)];
      if (!vendor) { card.hidden = true; card.innerHTML = ''; return; }
      const whatsapp = digitsOnly(vendor.whatsapp_number || vendor.phone || '');
      const href = whatsapp ? `https://wa.me/${whatsapp}` : '#';
      card.hidden = false;
      card.innerHTML = `<div class="vendor-picker-person"><img src="${escapeHtml(safeHttpUrl(vendor.photo_url || '', 'ordimarket-logo.png'))}" alt="${escapeHtml(vendor.full_name)}"><div><strong>${escapeHtml(vendor.full_name)}</strong><span>${escapeHtml(vendor.role_title || 'Conseiller Ventes')}</span></div></div>${whatsapp ? `<a class="vendor-whatsapp" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer"><i class='bx bxl-whatsapp'></i> WhatsApp</a>` : ''}`;
    };
    select.addEventListener('change', render);
  } catch (_) {
    // Fallback silencieux : le reste de la page doit rester fonctionnel
    // même si la RPC publique des vendeurs échoue (ex. JWT/PGRST303).
    select.innerHTML = '<option value="">Choisir un conseiller</option>';
    card.hidden = true;
    card.innerHTML = '';
  }
}

async function subscribe(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const input = form.querySelector('input[type=\"email\"]');
  const email = input?.value.trim().toLowerCase() || '';
  if (!email) return;
  const button = form.querySelector('button');
  button.disabled = true;
  try {
    const { error } = await supabase.from('subscribers').insert({ email });
    if (error && error.code !== '23505') throw error;
    form.reset();
    button.textContent = 'Inscrit !';
    setTimeout(() => { button.textContent = "S'inscrire"; }, 2200);
  } catch (error) {
    console.error('Inscription newsletter:', error);
    button.textContent = 'Réessayer';
    setTimeout(() => { button.textContent = "S'inscrire"; }, 2200);
  } finally { button.disabled = false; }
}

function initHome() {
  document.getElementById('subscribe-form')?.addEventListener('submit', subscribe);
  document.getElementById('footer-subscribe-form')?.addEventListener('submit', subscribe);
  document.getElementById('search-trigger')?.addEventListener('click', event => {
    event.preventDefault();
    window.location.href = 'catalogue.html#catalog-search';
  });
  updateFavoriteCounter();
  initVendorPicker();
  Promise.all([loadHomeFilters(), loadHomeProducts(), loadTestimonials(), loadFaqs()]).catch(console.error);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initHome, { once: true });
else initHome();
