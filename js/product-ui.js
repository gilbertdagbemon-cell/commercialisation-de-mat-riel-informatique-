import { escapeHtml, safeHttpUrl } from './utils.js';
import { supabase, formatPriceFCFA, submitProductReview } from './supabase.js';

const FALLBACK_IMAGE = 'ordimarket-logo.png';
const compareSelection = new Map();

export function getProductCover(product) {
  const cover = Array.isArray(product?.media)
    ? product.media.find(media => media.is_cover && media.type === 'image')
    : null;
  const firstImage = Array.isArray(product?.media)
    ? product.media.find(media => media.type === 'image')
    : null;
  return safeHttpUrl(cover?.url || firstImage?.url || '', FALLBACK_IMAGE);
}

function getProductImages(product) {
  if (!Array.isArray(product?.media)) return [];
  return product.media
    .filter(media => media?.type === 'image' && media?.url)
    .sort((a, b) => {
      const coverDelta = Number(Boolean(b.is_cover)) - Number(Boolean(a.is_cover));
      return coverDelta || Number(a.position ?? 0) - Number(b.position ?? 0);
    });
}

function getProductMedia(product) {
  if (!Array.isArray(product?.media)) return [];
  return product.media
    .filter(media => (media?.type === 'image' || media?.type === 'video') && media?.url)
    .sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0));
}

function galleryDots(count, active = 0) {
  return count > 1
    ? `<div class="media-gallery-dots" aria-label="Position dans la galerie">${Array.from({ length: count }, (_, index) => `<button type="button" class="media-gallery-dot${index === active ? ' active' : ''}" data-gallery-index="${index}" aria-label="Afficher le média ${index + 1}" aria-current="${index === active ? 'true' : 'false'}"></button>`).join('')}</div>`
    : '';
}

function galleryArrows(count) {
  return count > 1
    ? `<button type="button" class="media-gallery-arrow media-gallery-prev" data-gallery-prev aria-label="Média précédent"><i class="bx bx-chevron-left"></i></button><button type="button" class="media-gallery-arrow media-gallery-next" data-gallery-next aria-label="Média suivant"><i class="bx bx-chevron-right"></i></button>`
    : '';
}

function renderCardGallery(product, title) {
  const images = getProductImages(product);
  const sources = images.length ? images : [{ url: getProductCover(product) }];
  const multiple = sources.length > 1;
  return `<div class="media-gallery card-gallery" data-gallery-type="card" data-gallery-index="0" data-gallery-count="${sources.length}" tabindex="0" aria-label="Galerie photo de ${escapeHtml(title)}">
    <div class="media-gallery-track">${sources.map((media, index) => `<img class="media-gallery-slide${index === 0 ? ' active' : ''}" src="${escapeHtml(safeHttpUrl(media.url, FALLBACK_IMAGE))}" alt="${escapeHtml(title)} — image ${index + 1}" ${index === 0 ? 'loading="eager"' : 'loading="lazy"'} ${index === 0 ? '' : 'aria-hidden="true"'} data-fallback-image="${escapeHtml(FALLBACK_IMAGE)}">`).join('')}</div>
    ${multiple ? galleryArrows(sources.length) + galleryDots(sources.length) : ''}
  </div>`;
}

function renderModalGallery(product, title) {
  const media = getProductMedia(product);
  if (!media.length) return '';
  return `<section class="media-gallery modal-gallery" data-gallery-type="modal" data-gallery-index="0" data-gallery-count="${media.length}" tabindex="0" aria-label="Galerie multimédia de ${escapeHtml(title)}">
    <div class="media-gallery-track">${media.map((item, index) => {
      const url = safeHttpUrl(item.url, '');
      if (item.type === 'video') {
        return `<video class="media-gallery-slide${index === 0 ? ' active' : ''}" ${index === 0 ? 'preload="metadata"' : 'preload="none"'} controls playsinline ${index === 0 ? '' : 'aria-hidden="true"'}><source src="${escapeHtml(url)}"></video>`;
      }
      return `<img class="media-gallery-slide${index === 0 ? ' active' : ''}" src="${escapeHtml(url)}" alt="${escapeHtml(title)} — média ${index + 1}" ${index === 0 ? 'loading="eager"' : 'loading="lazy"'} ${index === 0 ? '' : 'aria-hidden="true"'} data-fallback-image="${escapeHtml(FALLBACK_IMAGE)}">`;
    }).join('')}</div>
    ${media.length > 1 ? galleryArrows(media.length) + galleryDots(media.length) : ''}
  </section>`;
}

function setGalleryIndex(gallery, nextIndex) {
  const slides = [...gallery.querySelectorAll('.media-gallery-slide')];
  if (!slides.length) return;

  const current = Number(gallery.dataset.galleryIndex || 0);
  const index = ((Number(nextIndex) || 0) % slides.length + slides.length) % slides.length;

  slides.forEach((slide, slideIndex) => {
    const active = slideIndex === index;

    // La classe reste la source d'état, mais on force aussi display dans le DOM.
    // Cela évite qu'une règle CSS concurrente laisse l'ancienne image visible.
    slide.classList.toggle('active', active);
    slide.style.display = active ? 'block' : 'none';
    slide.setAttribute('aria-hidden', active ? 'false' : 'true');

    if (slide.tagName === 'VIDEO') {
      if (active) {
        slide.play().catch(() => {});
      } else {
        slide.pause();
        try { slide.currentTime = 0; } catch (_) {}
      }
    }
  });

  gallery.querySelectorAll('.media-gallery-dot').forEach((dot, dotIndex) => {
    const active = dotIndex === index;
    dot.classList.toggle('active', active);
    dot.setAttribute('aria-current', active ? 'true' : 'false');
  });

  gallery.dataset.galleryIndex = String(index);

  // Force un reflow léger afin que le navigateur applique immédiatement
  // le nouvel état visuel après une navigation rapide.
  void gallery.offsetHeight;

  if (index !== current) {
    const activeSlide = slides[index];
    if (activeSlide?.tagName === 'IMG' && activeSlide.loading !== 'eager') {
      activeSlide.loading = 'eager';
    }
  }
}

function setupGalleryEvents(scope = document) {
  scope.querySelectorAll('.media-gallery').forEach(gallery => {
    if (gallery.dataset.galleryBound === '1') return;
    gallery.dataset.galleryBound = '1';
    gallery.addEventListener('click', event => {
      const control = event.target.closest('[data-gallery-prev], [data-gallery-next], [data-gallery-index]');
      if (!control) return;
      event.preventDefault();
      event.stopPropagation();
      const current = Number(gallery.dataset.galleryIndex || 0);
      const count = gallery.querySelectorAll('.media-gallery-slide').length;
      const target = control.hasAttribute('data-gallery-prev')
        ? current - 1
        : control.hasAttribute('data-gallery-next')
          ? current + 1
          : Number(control.dataset.galleryIndex);
      setGalleryIndex(gallery, target % count);
    });
    let startX = null;
    gallery.addEventListener('touchstart', event => {
      if (event.touches.length === 1) startX = event.touches[0].clientX;
    }, { passive: true });
    gallery.addEventListener('touchend', event => {
      if (startX === null) return;
      const delta = event.changedTouches[0].clientX - startX;
      startX = null;
      if (Math.abs(delta) < 45) return;
      const current = Number(gallery.dataset.galleryIndex || 0);
      setGalleryIndex(gallery, current + (delta < 0 ? 1 : -1));
    }, { passive: true });
    gallery.addEventListener('keydown', event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const current = Number(gallery.dataset.galleryIndex || 0);
      setGalleryIndex(gallery, current + (event.key === 'ArrowRight' ? 1 : -1));
    });
  });
}

function specsToText(product) {
  const specs = product?.specs;
  if (typeof specs === 'string') return specs.trim();
  if (specs && typeof specs === 'object') {
    if (typeof specs.text === 'string') return specs.text.trim();
    return Object.entries(specs)
      .map(([key, value]) => `${key} : ${Array.isArray(value) ? value.join(', ') : String(value ?? '')}`)
      .filter(Boolean)
      .join('\n');
  }
  return String(product?.description || '').trim();
}

function whatsappUrl(title) {
  const message = `Bonjour, je suis intéressé par le produit : ${title}`;
  return `https://wa.me/2290198663414?text=${encodeURIComponent(message)}`;
}

export function renderProductsGrid(products, containerOrSelector = '#products-grid', options = {}) {
  const container = typeof containerOrSelector === 'string'
    ? document.querySelector(containerOrSelector)
    : containerOrSelector;
  if (!container) return;

  const list = Array.isArray(products) ? products : [];
  if (!list.length) {
    container.innerHTML = `<div class="empty-state">Aucun produit disponible pour le moment.</div>`;
    return;
  }

  const showStock = options.showStock !== false;
  const showFavorites = Boolean(options.showFavorites);
  const showCompare = Boolean(options.showCompare);
  const favoriteIds = getFavorites();
  window.__ordimarketProducts = new Map(list.map(product => [String(product.id), product]));

  container.innerHTML = list.map(product => {
    const title = String(product.title || 'Produit');
    const specs = specsToText(product);
    const image = getProductCover(product);
    const brand = product.brands?.name || product.brand_name || 'Autre';
    const category = product.categories?.name || product.category_name || 'Matériel';
    const condition = product.condition || 'occasion';
    const stock = Number(product.stock ?? 0);
    const favorite = favoriteIds.includes(product.id);
    const stockHtml = !showStock ? '' : stock <= 0
      ? `<div class="card-stock-row low"><i class='bx bxs-x-circle'></i> Épuisé</div>`
      : stock <= 2
        ? `<div class="card-stock-row low"><i class='bx bxs-flame'></i> Reste ${stock} ex.</div>`
        : `<div class="card-stock-row"><i class='bx bxs-check-circle'></i> En stock</div>`;

    return `
      <article class="card" data-product-id="${escapeHtml(product.id)}">
        <div class="card-media">
          <span class="card-tag">${escapeHtml(condition)}</span>
          ${showFavorites ? `<button type="button" class="favorite-btn${favorite ? ' active' : ''}" data-favorite-id="${escapeHtml(product.id)}" aria-label="${favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}"><i class='bx ${favorite ? 'bxs-heart' : 'bx-heart'}'></i></button>` : ''}
          ${renderCardGallery(product, title)}
          ${showCompare ? `<button type="button" class="compare-btn${compareSelection.has(product.id) ? ' active' : ''}" data-compare-id="${escapeHtml(product.id)}" aria-pressed="${compareSelection.has(product.id)}"><i class='bx bx-git-compare'></i> Comparer</button>` : ''}
        </div>
        <div class="card-body">
          <div class="card-brand">${escapeHtml(brand)} • ${escapeHtml(category)}</div>
          <div class="card-title">${escapeHtml(title)}</div>
          ${stockHtml}
          ${specs ? `<button type="button" class="card-features-btn" data-title="${escapeHtml(title)}" data-product-id="${escapeHtml(product.id)}" data-features="${escapeHtml(specs)}"><i class='bx bx-info-circle'></i> Voir caractéristiques</button>` : ''}
          <div class="card-foot">
            <span class="card-price">${escapeHtml(formatPriceFCFA(product.price))}</span>
            <a class="card-order" href="${escapeHtml(whatsappUrl(title))}" target="_blank" rel="noopener noreferrer" title="Commander sur WhatsApp"><i class='bx bxl-whatsapp'></i></a>
          </div>
        </div>
      </article>`;
  }).join('');

  container.querySelectorAll('[data-fallback-image]').forEach(img => {
    img.addEventListener('error', () => {
      const fallback = img.dataset.fallbackImage;
      if (img.src.endsWith(fallback)) return;
      img.src = fallback;
    }, { once: true });
  });

  setupGalleryEvents(container);
  setupFeaturesModal(container);
  setupCompareModal();
  if (showFavorites) setupFavoriteEvents(container);
  if (showCompare) setupCompareEvents(container, list);
}


function specsToComparisonText(product) { return specsToText(product) || '—'; }

function setupCompareEvents(container, products) {
  container.querySelectorAll('[data-compare-id]').forEach(button => {
    button.addEventListener('click', () => {
      const id = button.dataset.compareId;
      if (compareSelection.has(id)) {
        compareSelection.delete(id);
      } else {
        if (compareSelection.size >= 3) {
          showCompareMessage('Vous pouvez comparer 3 produits maximum.');
          return;
        }
        const product = products.find(item => String(item.id) === String(id));
        if (product) compareSelection.set(id, product);
      }
      syncCompareButtons();
      renderCompareModal();
    });
  });
}

function showCompareMessage(message) {
  const box = document.getElementById('compare-message');
  if (!box) return;
  box.textContent = message;
  box.hidden = false;
  window.setTimeout(() => { box.hidden = true; }, 2200);
}

function syncCompareButtons() {
  document.querySelectorAll('[data-compare-id]').forEach(button => {
    const active = compareSelection.has(button.dataset.compareId);
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  const count = document.getElementById('compare-count');
  if (count) count.textContent = String(compareSelection.size);
  const open = document.getElementById('compare-open');
  if (open) open.disabled = compareSelection.size < 2;
}

function renderCompareModal() {
  const modal = document.getElementById('compare-modal');
  const grid = document.getElementById('compare-grid');
  if (!modal || !grid || compareSelection.size < 2) return;
  const products = [...compareSelection.values()];
  const rows = [
    ['Marque', p => p.brands?.name || p.brand_name || '—'],
    ['Catégorie', p => p.categories?.name || p.category_name || '—'],
    ['Prix', p => formatPriceFCFA(p.price)],
    ['État', p => p.condition || '—'],
    ['Stock', p => Number(p.stock ?? 0) <= 0 ? 'Rupture' : `${p.stock} disponible(s)`],
    ['Caractéristiques', specsToComparisonText],
  ];
  grid.innerHTML = `<div class="compare-row compare-head"><div>Caractéristique</div>${products.map(p => `<div><strong>${escapeHtml(p.title)}</strong></div>`).join('')}</div>` +
    rows.map(([label, getter]) => `<div class="compare-row"><div class="compare-label">${escapeHtml(label)}</div>${products.map(p => `<div>${escapeHtml(getter(p))}</div>`).join('')}</div>`).join('');
  modal.classList.add('active'); modal.setAttribute('aria-hidden','false');
}

function setupCompareModal() {
  const modal = document.getElementById('compare-modal');
  const close = document.getElementById('close-compare-modal');
  const open = document.getElementById('compare-open');
  if (!modal || !close || !open || modal.dataset.bound === '1') return;
  modal.dataset.bound = '1';
  const hide = () => { modal.classList.remove('active'); modal.setAttribute('aria-hidden','true'); };
  close.addEventListener('click', hide);
  modal.addEventListener('click', e => { if (e.target === modal) hide(); });
  open.addEventListener('click', renderCompareModal);
  syncCompareButtons();
}

function getFavorites() {
  try {
    const value = JSON.parse(localStorage.getItem('ordimarket:favorites') || '[]');
    return Array.isArray(value) ? value.filter(Boolean) : [];
  } catch (_) { return []; }
}

function setFavorites(ids) {
  const normalizedIds = [...new Set(ids)].filter(Boolean);
  try {
    localStorage.setItem('ordimarket:favorites', JSON.stringify(normalizedIds));
  } catch (error) {
    console.warn('Impossible d’enregistrer les favoris localement:', error);
  }
  document.querySelectorAll('#favorites-count').forEach(counter => {
    counter.textContent = String(normalizedIds.length);
    counter.hidden = normalizedIds.length === 0;
  });
}

function setupFavoriteEvents(container) {
  container.querySelectorAll('[data-favorite-id]').forEach(button => {
    button.addEventListener('click', () => {
      const id = button.dataset.favoriteId;
      const ids = getFavorites();
      const next = ids.includes(id) ? ids.filter(item => item !== id) : [...ids, id];
      setFavorites(next);
      button.classList.toggle('active', next.includes(id));
      button.innerHTML = `<i class='bx ${next.includes(id) ? 'bxs-heart' : 'bx-heart'}'></i>`;
      button.setAttribute('aria-label', next.includes(id) ? 'Retirer des favoris' : 'Ajouter aux favoris');
      document.dispatchEvent(new CustomEvent('ordimarket:favorites-changed', { detail: { ids: next } }));
    });
  });
}

function renderFeatureText(value) {
  return escapeHtml(value || 'Aucune caractéristique renseignée.').replace(/\r?\n/g, '<br>');
}

function renderReviewForm(productId) {
  return `<form class="product-review-form" data-product-review-form data-product-id="${escapeHtml(productId)}">
    <div class="product-review-form-title">Laisser un avis sur ce produit</div>
    <div class="review-rating-picker" role="radiogroup" aria-label="Votre note">
      ${Array.from({ length: 5 }, (_, index) => {
        const value = index + 1;
        return `<button type="button" class="review-rating-star" data-rating-value="${value}" role="radio" aria-checked="false" aria-label="${value} étoile${value > 1 ? 's' : ''}">☆</button>`;
      }).join('')}
    </div>
    <label class="review-form-label" for="review-author-name">Votre nom</label>
    <input id="review-author-name" name="author_name" type="text" maxlength="100" autocomplete="name" required placeholder="Votre nom">
    <label class="review-form-label" for="review-comment">Votre commentaire</label>
    <textarea id="review-comment" name="comment" rows="4" maxlength="1000" required placeholder="Partagez votre expérience avec ce produit..."></textarea>
    <button type="submit" class="review-submit-btn">Envoyer mon avis</button>
    <p class="review-form-message" data-review-form-message role="status" aria-live="polite"></p>
  </form>`;
}

function setupReviewForm(modal, productId) {
  const form = modal.querySelector('[data-product-review-form]');
  if (!form || form.dataset.bound === '1') return;
  form.dataset.bound = '1';
  let selectedRating = 0;
  const stars = [...form.querySelectorAll('[data-rating-value]')];
  const message = form.querySelector('[data-review-form-message]');
  const submitButton = form.querySelector('[type="submit"]');

  const updateStars = () => {
    stars.forEach(star => {
      const active = Number(star.dataset.ratingValue) <= selectedRating;
      star.textContent = active ? '★' : '☆';
      star.classList.toggle('active', active);
      star.setAttribute('aria-checked', String(Number(star.dataset.ratingValue) === selectedRating));
    });
  };

  stars.forEach(star => {
    star.addEventListener('click', () => {
      selectedRating = Number(star.dataset.ratingValue) || 0;
      updateStars();
    });
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const authorName = String(form.elements.author_name?.value || '').trim();
    const comment = String(form.elements.comment?.value || '').trim();

    message.textContent = '';
    message.className = 'review-form-message';

    if (!authorName || !selectedRating || !comment) {
      message.textContent = 'Veuillez renseigner votre nom, choisir une note et écrire un commentaire.';
      message.classList.add('error');
      return;
    }

    submitButton.disabled = true;
    submitButton.setAttribute('aria-busy', 'true');
    try {
      await submitProductReview({ productId, authorName, rating: selectedRating, comment });
      message.textContent = 'Merci ! Votre avis a été envoyé et sera visible après validation par l’équipe.';
      message.classList.add('success');
      form.reset();
      selectedRating = 0;
      updateStars();
    } catch (_) {
      message.textContent = 'Impossible d’envoyer votre avis pour le moment. Veuillez réessayer.';
      message.classList.add('error');
    } finally {
      submitButton.disabled = false;
      submitButton.removeAttribute('aria-busy');
    }
  });
}

function setupFeaturesModal(scope = document) {
  const modal = document.getElementById('features-modal');
  const closeBtn = document.getElementById('close-features-modal');
  const grid = scope?.matches?.('.products-grid, #catalog-products') ? scope : (scope.querySelector?.('.products-grid, #catalog-products') || null);
  if (!modal || !closeBtn || !grid || grid.dataset.modalBound === '1') return;
  grid.dataset.modalBound = '1';

  const close = () => {
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
  };
  closeBtn.addEventListener('click', close);
  modal.addEventListener('click', event => { if (event.target === modal) close(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });

  grid.addEventListener('click', async event => {
    const button = event.target.closest('.card-features-btn');
    if (!button) return;
    const productId = button.dataset.productId;
    const title = button.dataset.title || 'Caractéristiques techniques';
    const product = window.__ordimarketProducts?.get?.(String(productId));
    document.getElementById('modal-product-title').textContent = title;
    const modalFeatures = document.getElementById('modal-product-features');
    if (modalFeatures) {
      const galleryHtml = product ? renderModalGallery(product, title) : '';
      modalFeatures.innerHTML = `${galleryHtml}<div class="modal-features-text">${renderFeatureText(button.dataset.features)}</div>`;
      setupGalleryEvents(modalFeatures);
    }
    const reviewsSection = document.getElementById('modal-product-reviews');
    const reviewsList = document.getElementById('modal-product-reviews-list');
    if (reviewsSection && reviewsList) {
      reviewsSection.hidden = true;
      reviewsList.innerHTML = '';
      try {
        const { data, error } = await supabase
          .from('product_reviews')
          .select('author_name,rating,comment,created_at')
          .eq('product_id', button.dataset.productId)
          .eq('is_published', true)
          .order('created_at', { ascending: false });
        if (error) throw error;
        if (data?.length) {
          reviewsList.innerHTML = data.map(review => {
            const rating = Math.max(0, Math.min(5, Number(review.rating) || 0));
            return `<article class="product-review-item"><div class="product-review-head"><strong>${escapeHtml(review.author_name || 'Anonyme')}</strong><span class="review-stars" aria-label="${rating} sur 5">${'★'.repeat(rating)}${'☆'.repeat(5-rating)}</span></div><p>${escapeHtml(review.comment || '').replace(/\r?\n/g, '<br>')}</p></article>`;
          }).join('');
          reviewsSection.hidden = false;
        }
      } catch (error) {
        console.warn('Avis clients : impossible de charger les avis publics.', error);
      }
    }
    const reviewFormHost = document.getElementById('modal-product-review-form');
    if (reviewFormHost) {
      reviewFormHost.innerHTML = renderReviewForm(button.dataset.productId);
      setupReviewForm(modal, button.dataset.productId);
    }
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
  });
}

export function getFavoriteIds() { return getFavorites(); }
export function updateFavoriteCounter() { setFavorites(getFavorites()); }
