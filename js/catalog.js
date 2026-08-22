import { supabase, formatPriceFCFA } from './supabase.js';
import { escapeHtml } from './utils.js';
import { renderProductsGrid, getFavoriteIds, updateFavoriteCounter } from './product-ui.js';

const PAGE_SIZE = 12;
let brands = [];
let categories = [];
let currentPage = 1;
let totalResults = 0;

const FILTER_IDS = ['catalog-search', 'catalog-brand', 'catalog-category', 'catalog-condition', 'catalog-sort'];

function getFiltersFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return {
    search: params.get('search') || '',
    brand: params.get('brand') || '',
    category: params.get('category') || '',
    condition: params.get('condition') || '',
    sort: params.get('sort') || 'newest',
    page: Math.max(1, Number.parseInt(params.get('page') || '1', 10) || 1),
  };
}

function syncUrl(replace = false) {
  const params = new URLSearchParams(window.location.search);
  const values = {
    search: document.getElementById('catalog-search')?.value.trim() || '',
    brand: document.getElementById('catalog-brand')?.value || '',
    category: document.getElementById('catalog-category')?.value || '',
    condition: document.getElementById('catalog-condition')?.value || '',
    sort: document.getElementById('catalog-sort')?.value || 'newest',
  };
  Object.entries(values).forEach(([key, value]) => value && value !== 'newest' ? params.set(key, value) : params.delete(key));
  if (currentPage > 1) params.set('page', String(currentPage)); else params.delete('page');
  const url = `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash}`;
  (replace ? history.replaceState : history.pushState).call(history, null, '', url);
}

function restoreFiltersFromUrl() {
  const filters = getFiltersFromUrl();
  const map = { search: 'catalog-search', brand: 'catalog-brand', category: 'catalog-category', condition: 'catalog-condition', sort: 'catalog-sort' };
  Object.entries(map).forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (el) el.value = filters[key];
  });
  currentPage = filters.page;
  if (filters.search || window.location.hash === '#catalog-search') document.getElementById('catalog-search')?.focus();
}

async function loadFilters() {
  const [{ data: brandData, error: brandError }, { data: categoryData, error: categoryError }] = await Promise.all([
    supabase.from('brands').select('id,name,slug').eq('is_active', true).order('name'),
    supabase.from('categories').select('id,name,slug').eq('is_active', true).order('display_order').order('name'),
  ]);
  if (brandError) throw brandError;
  if (categoryError) throw categoryError;
  brands = brandData || [];
  categories = categoryData || [];
  const brandSelect = document.getElementById('catalog-brand');
  const categorySelect = document.getElementById('catalog-category');
  if (brandSelect) brandSelect.innerHTML = '<option value="">Toutes les marques</option>' + brands.map(b => `<option value="${escapeHtml(b.id)}">${escapeHtml(b.name)}</option>`).join('');
  if (categorySelect) categorySelect.innerHTML = '<option value="">Toutes les catégories</option>' + categories.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join('');
}

function ilikeTerm(value) {
  return String(value).replace(/[%_\\]/g, m => `\\${m}`).replace(/[(),]/g, ' ');
}

function matchingIds(items, search) {
  const q = search.toLocaleLowerCase('fr-FR');
  return items.filter(item => String(item.name || '').toLocaleLowerCase('fr-FR').includes(q)).map(item => item.id);
}

function updatePagination() {
  const container = document.getElementById('catalog-pagination');
  if (!container) return;
  const totalPages = Math.max(1, Math.ceil(totalResults / PAGE_SIZE));
  container.innerHTML = totalPages <= 1 ? '' : `
    <button type="button" class="pagination-btn" data-page="${currentPage - 1}" ${currentPage <= 1 ? 'disabled' : ''}><i class="bx bx-chevron-left"></i> Précédent</button>
    <span class="pagination-info">Page ${currentPage} / ${totalPages}</span>
    <button type="button" class="pagination-btn" data-page="${currentPage + 1}" ${currentPage >= totalPages ? 'disabled' : ''}>Suivant <i class="bx bx-chevron-right"></i></button>`;
  container.querySelectorAll('[data-page]').forEach(button => button.addEventListener('click', () => {
    if (button.disabled) return;
    currentPage = Number(button.dataset.page);
    syncUrl(false);
    loadProducts();
    window.scrollTo({ top: document.querySelector('.catalogue-section')?.offsetTop || 0, behavior: 'smooth' });
  }));
}

async function loadProducts() {
  const search = (document.getElementById('catalog-search')?.value || '').trim();
  const brandId = document.getElementById('catalog-brand')?.value || '';
  const categoryId = document.getElementById('catalog-category')?.value || '';
  const condition = document.getElementById('catalog-condition')?.value || '';
  const sort = document.getElementById('catalog-sort')?.value || 'newest';
  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from('products')
    .select('*, brands(name), categories(name), media(id,type,url,position,is_cover)', { count: 'exact' })
    .eq('is_published', true);

  if (brandId) query = query.eq('brand_id', brandId);
  if (categoryId) query = query.eq('category_id', categoryId);
  if (condition) query = query.eq('condition', condition);
  if (search) {
    const term = ilikeTerm(search);
    const brandIds = matchingIds(brands, search);
    const categoryIds = matchingIds(categories, search);
    const clauses = [`title.ilike.%${term}%`];
    if (brandIds.length) clauses.push(`brand_id.in.(${brandIds.join(',')})`);
    if (categoryIds.length) clauses.push(`category_id.in.(${categoryIds.join(',')})`);
    query = query.or(clauses.join(','));
  }

  if (sort === 'price-asc') query = query.order('price', { ascending: true, nullsFirst: false });
  else if (sort === 'price-desc') query = query.order('price', { ascending: false, nullsFirst: false });
  else query = query.order('created_at', { ascending: false });

  const { data, error, count } = await query.range(from, to);
  if (error) throw error;
  totalResults = count || 0;
  const countEl = document.getElementById('catalog-result-count');
  if (countEl) countEl.textContent = `${totalResults} produit${totalResults > 1 ? 's' : ''}`;
  const empty = document.getElementById('catalog-empty');
  if (empty) empty.hidden = totalResults !== 0;
  renderProductsGrid(data || [], '#catalog-products', { showStock: true, showFavorites: true, showCompare: true });
  updatePagination();
  const errorEl = document.getElementById('catalog-error');
  if (errorEl) errorEl.hidden = true;
}

function renderFavorites() {
  const body = document.getElementById('favorites-body');
  if (!body) return;
  const ids = getFavoriteIds();
  // Favorites on a paginated catalogue are hydrated from the current page only; the modal remains local to loaded products.
  const cards = [...document.querySelectorAll('#catalog-products [data-product-id]')];
  const favorites = cards.filter(card => ids.includes(card.dataset.productId));
  if (!favorites.length) { body.innerHTML = '<p>Aucun favori visible sur cette page pour le moment.</p>'; return; }
  body.innerHTML = favorites.map(card => `<div class="favorite-item"><strong>${escapeHtml(card.querySelector('.card-title')?.textContent || 'Produit')}</strong><span>${escapeHtml(card.querySelector('.card-brand')?.textContent || 'Autre')} · ${escapeHtml(card.querySelector('.card-price')?.textContent || '')}</span></div>`).join('');
}

function setupFavorites() {
  const toggle = document.getElementById('favorites-toggle');
  const modal = document.getElementById('favorites-modal');
  const close = document.querySelector('.close-favorites');
  if (!toggle || !modal || !close) return;
  toggle.addEventListener('click', event => { event.preventDefault(); renderFavorites(); modal.classList.add('active'); });
  close.addEventListener('click', () => modal.classList.remove('active'));
  modal.addEventListener('click', event => { if (event.target === modal) modal.classList.remove('active'); });
  document.addEventListener('ordimarket:favorites-changed', renderFavorites);
}

function bindControls() {
  FILTER_IDS.forEach(id => {
    const element = document.getElementById(id);
    element?.addEventListener(element.tagName === 'INPUT' ? 'input' : 'change', () => {
      currentPage = 1;
      syncUrl(false);
      loadProducts().catch(showCatalogError);
    });
  });
  window.addEventListener('popstate', () => {
    restoreFiltersFromUrl();
    loadProducts().catch(showCatalogError);
  });
}

function showCatalogError(err) {
  console.error('Catalogue:', err);
  const error = document.getElementById('catalog-error');
  if (error) { error.textContent = 'Impossible de charger le catalogue. Veuillez réessayer plus tard.'; error.hidden = false; }
}

async function subscribeFromCatalogue(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const input = document.getElementById('catalog-subscribe-email');
  const button = form.querySelector('button');
  const email = input?.value.trim().toLowerCase();
  if (!email || !button) return;
  button.disabled = true;
  try {
    const { error } = await supabase.from('subscribers').insert({ email });
    if (error && error.code !== '23505') throw error;
    form.reset(); button.innerHTML = '<i class="bx bx-check"></i>';
    setTimeout(() => { button.innerHTML = '<i class="bx bx-send"></i>'; button.disabled = false; }, 2200);
  } catch (error) {
    console.error('Newsletter catalogue:', error);
    button.innerHTML = '<i class="bx bx-refresh"></i>';
    setTimeout(() => { button.innerHTML = '<i class="bx bx-send"></i>'; button.disabled = false; }, 2200);
  }
}

async function initCatalog() {
  try {
    bindControls(); setupFavorites();
    document.getElementById('catalog-subscribe-form')?.addEventListener('submit', subscribeFromCatalogue);
    await loadFilters();
    restoreFiltersFromUrl();
    await loadProducts();
    updateFavoriteCounter();
  } catch (err) { showCatalogError(err); }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initCatalog, { once: true });
else initCatalog();
