import {
  requireAdmin,
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  listBrands,
  createBrand,
  listCategories,
  createCategory,
  uploadProductMedia,
  setMediaCover,
  deleteMedia,
  notifyNewProduct,
  countActiveSubscribers,
} from './supabase-client.js';
import { escapeHtml, showToast, bindSignOut } from './admin-shared.js';

let admin = null;
let editingProductId = null;
let currentMedia = [];
let pendingFiles = [];
let products = [];

let tableState = {
  search: '',
  sort: 'title',
  direction: 'asc',
};

const $ = (id) => document.getElementById(id);
const modal = $('product-modal');
const form = $('product-form');

function price(value) {
  return Number(value || 0).toLocaleString('fr-FR').replace(/\u202f/g, ' ') + ' FCFA';
}

async function loadBrands() {
  const brands = await listBrands();
  $('brand-select').innerHTML =
    '<option value="">Choisir une marque</option>' +
    brands
      .map((brand) => `<option value="${escapeHtml(brand.id)}">${escapeHtml(brand.name)}</option>`)
      .join('');
}

async function loadCategories() {
  const categories = await listCategories();
  $('category-select').innerHTML =
    '<option value="">Choisir une catégorie</option>' +
    categories
      .map((category) => `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}</option>`)
      .join('');
}

function visibleProducts() {
  const query = tableState.search.toLocaleLowerCase('fr-FR');
  let list = products.filter((product) =>
    `${product.title || ''} ${product.brands?.name || ''}`
      .toLocaleLowerCase('fr-FR')
      .includes(query),
  );

  const key = tableState.sort;

  list.sort((a, b) => {
    const aValue =
      key === 'brand'
        ? a.brands?.name || ''
        : key === 'price'
          ? Number(a.price || 0)
          : key === 'stock'
            ? Number(a.stock || 0)
            : a.title || '';
    const bValue =
      key === 'brand'
        ? b.brands?.name || ''
        : key === 'price'
          ? Number(b.price || 0)
          : key === 'stock'
            ? Number(b.stock || 0)
            : b.title || '';

    if (typeof aValue === 'string') {
      return aValue.localeCompare(bValue, 'fr-FR') * (tableState.direction === 'asc' ? 1 : -1);
    }

    return (aValue - bValue) * (tableState.direction === 'asc' ? 1 : -1);
  });

  return list;
}

function renderRows() {
  const rows = $('product-rows');
  const list = visibleProducts();

  if (!list.length) {
    rows.innerHTML =
      '<tr><td colspan="7" style="text-align:center;padding:35px">Aucun produit correspondant.</td></tr>';
    return;
  }

  rows.innerHTML = list
    .map((product) => {
      const media = (product.media || []).find((item) => item.is_cover) || (product.media || [])[0];

      return `<tr><td data-label="Image">${media?.type === 'image' ? `<img class="thumb" src="${escapeHtml(media.url)}" alt="">` : '<div class="thumb"><i class="bx bx-laptop"></i></div>'}</td><td data-label="Produit"><b>${escapeHtml(product.title)}</b>${product.is_featured ? '<div><span class="badge ok">Vedette</span></div>' : ''}</td><td data-label="Marque">${escapeHtml(product.brands?.name || '—')}</td><td data-label="Prix">${price(product.price)}</td><td data-label="Stock">${Number(product.stock) <= 0 ? '<span class="badge off">Rupture</span>' : Number(product.stock) <= 2 ? `<span class="badge low">Reste ${product.stock}</span>` : '<span class="badge ok">En stock</span>'}</td><td data-label="Statut">${product.is_published ? '<span class="badge ok">Publié</span>' : '<span class="badge off">Brouillon</span>'}</td><td data-label="Actions"><button class="btn btn-secondary btn-sm" data-edit="${product.id}"><i class="bx bx-edit"></i></button> <button class="btn btn-danger btn-sm" data-del="${product.id}"><i class="bx bx-trash"></i></button></td></tr>`;
    })
    .join('');

  rows.querySelectorAll('[data-edit]').forEach((button) => {
    button.onclick = () => openEdit(button.dataset.edit);
  });

  rows.querySelectorAll('[data-del]').forEach((button) => {
    button.onclick = () => removeProduct(button.dataset.del);
  });

  updateSortIndicators();
}

function updateSortIndicators() {
  document.querySelectorAll('.sort-header').forEach((button) => {
    const span = button.querySelector('span');
    const active = button.dataset.sort === tableState.sort;
    button.classList.toggle('active', active);
    span.textContent = active ? (tableState.direction === 'asc' ? '↑' : '↓') : '';
  });
}

async function loadProducts() {
  const rows = $('product-rows');

  try {
    products = await listProducts();
    $('stat-published').textContent = products.filter((product) => product.is_published).length;
    $('stat-out').textContent = products.filter((product) => Number(product.stock) <= 0).length;
    renderRows();
  } catch (error) {
    rows.innerHTML =
      '<tr><td colspan="7" style="text-align:center;padding:35px">Erreur de chargement.</td></tr>';
    showToast(error.message, true);
  }
}

async function loadStats() {
  try {
    $('stat-subscribers').textContent = await countActiveSubscribers();
  } catch (error) {
    $('stat-subscribers').textContent = '—';
    showToast('Impossible de charger le nombre d’abonnés.', true);
  }
}

function reset() {
  form.reset();
  editingProductId = null;
  currentMedia = [];
  pendingFiles = [];
  $('product-id').value = '';
  $('stock').value = 1;
  $('condition').value = 'occasion';
  $('is-published').checked = true;
  $('is-featured').checked = false;
  renderMedia();
  renderPending();
}

function openModal() {
  modal.classList.add('open');
}

function closeModal() {
  modal.classList.remove('open');
}

function openAdd() {
  reset();
  $('modal-title').textContent = 'Ajouter un produit';
  openModal();
}

async function openEdit(id) {
  try {
    const product = await getProduct(id);
    reset();
    editingProductId = id;
    $('modal-title').textContent = 'Modifier le produit';
    $('product-id').value = product.id;
    $('title').value = product.title || '';
    $('brand-select').value = product.brand_id || '';
    $('category-select').value = product.category_id || '';
    $('price').value = product.price ?? '';
    $('stock').value = product.stock ?? 0;
    $('condition').value = product.condition || 'occasion';
    $('description').value = product.description || '';
    $('is-published').checked = !!product.is_published;
    $('is-featured').checked = !!product.is_featured;
    currentMedia = [...(product.media || [])].sort((a, b) => a.position - b.position);
    currentMedia._publishedBefore = Boolean(product.is_published);
    renderMedia();
    openModal();
  } catch (error) {
    showToast(error.message, true);
  }
}

function renderMedia() {
  const box = $('media-preview');

  if (!currentMedia.length) {
    box.innerHTML = '';
    return;
  }

  box.innerHTML = currentMedia
    .map(
      (media) =>
        `<div class="media-thumb"><div>${media.type === 'video' ? `<video src="${escapeHtml(media.url)}" controls preload="metadata"></video>` : `<img src="${escapeHtml(media.url)}" alt="">`}</div><div class="media-actions"><span class="cover-label">${media.is_cover ? '★ Couverture' : 'Média'}</span>${!media.is_cover ? `<button type="button" class="btn btn-secondary btn-sm" data-cover="${media.id}">Couverture</button>` : ''}<button type="button" class="btn btn-danger btn-sm" data-remove="${media.id}">Supprimer</button></div></div>`,
    )
    .join('');

  box.querySelectorAll('[data-cover]').forEach((button) => {
    button.onclick = async () => {
      try {
        await setMediaCover(editingProductId, button.dataset.cover);
        currentMedia = currentMedia.map((media) => ({
          ...media,
          is_cover: media.id === button.dataset.cover,
        }));
        renderMedia();
        showToast('Couverture mise à jour.');
      } catch (error) {
        showToast(error.message, true);
      }
    };
  });

  box.querySelectorAll('[data-remove]').forEach((button) => {
    button.onclick = async () => {
      const media = currentMedia.find((item) => item.id === button.dataset.remove);
      if (!media || !confirm('Supprimer ce média ?')) return;

      try {
        await deleteMedia(media.id, media.url);
        currentMedia = currentMedia.filter((item) => item.id !== media.id);
        renderMedia();
        showToast('Média supprimé.');
      } catch (error) {
        showToast(error.message, true);
      }
    };
  });
}

function renderPending() {
  const box = $('pending-files');
  if (!box) return;

  box.innerHTML = pendingFiles
    .map(
      (file, index) =>
        `<div class="pending-file"><span>${escapeHtml(file.name)}</span><button type="button" class="btn btn-danger btn-sm" data-pending-remove="${index}">Retirer</button></div>`,
    )
    .join('');

  box.querySelectorAll('[data-pending-remove]').forEach((button) => {
    button.onclick = () => {
      pendingFiles.splice(Number(button.dataset.pendingRemove), 1);
      renderPending();
    };
  });
}

function addFiles(files) {
  const ok = [...files].filter(
    (file) => file.type.startsWith('image/') || file.type.startsWith('video/'),
  );

  if (ok.length !== [...files].length) {
    showToast('Certains fichiers ont été ignorés : format non supporté.', true);
  }

  pendingFiles.push(...ok);
  renderPending();
}

async function uploadPending(productId) {
  for (let i = 0; i < pendingFiles.length; i++) {
    await uploadProductMedia(productId, pendingFiles[i], {
      position: currentMedia.length + i,
      isCover: currentMedia.length === 0 && i === 0,
    });
  }

  pendingFiles = [];
  renderPending();
}

async function save(event) {
  event.preventDefault();

  const title = $('title').value.trim();
  const brand = $('brand-select').value;
  const category = $('category-select').value;
  const priceN = Number($('price').value);
  const stockN = Number($('stock').value);

  if (
    !title ||
    !brand ||
    !category ||
    !$('description').value.trim() ||
    !Number.isFinite(priceN) ||
    priceN < 0 ||
    !Number.isInteger(stockN) ||
    stockN < 0
  ) {
    showToast('Veuillez vérifier les champs obligatoires.', true);
    return;
  }

  const btn = $('save-btn');
  const wasEditing = Boolean(editingProductId);
  btn.disabled = true;
  btn.textContent = 'Enregistrement…';

  const descriptionText = $('description').value.trim();
  const payload = {
    title,
    brand_id: brand,
    category_id: category,
    price: priceN,
    stock: stockN,
    condition: $('condition').value,
    specs: { text: descriptionText },
    description: descriptionText,
    is_published: $('is-published').checked,
    is_featured: $('is-featured').checked,
  };

  try {
    let product = editingProductId
      ? await updateProduct(editingProductId, payload)
      : await createProduct({ ...payload, created_by: admin.id });

    editingProductId = product.id;
    $('product-id').value = product.id;
    await uploadPending(product.id);

    if ($('is-published').checked) {
      try {
        const result = await notifyNewProduct(product.id);
        showToast(
          result?.sent_to_count
            ? `${wasEditing ? 'Produit mis à jour.' : 'Produit créé.'} Notification envoyée à ${result.sent_to_count} abonné(s).`
            : `${wasEditing ? 'Produit mis à jour.' : 'Produit créé.'} Aucun abonné à notifier.`,
        );
      } catch (notificationError) {
        console.error('Notification nouveau produit:', notificationError);
        showToast(
          wasEditing
            ? 'Produit mis à jour, mais la notification email a échoué.'
            : 'Produit créé, mais la notification email a échoué.',
          true,
        );
      }
    }

    closeModal();
    await loadProducts();
    reset();
  } catch (error) {
    showToast(error.message || 'Erreur lors de l’enregistrement.', true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Enregistrer';
  }
}

async function removeProduct(id) {
  if (!confirm('Supprimer définitivement ce produit et ses médias ?')) return;

  try {
    await deleteProduct(id);
    showToast('Produit supprimé.');
    await loadProducts();
  } catch (error) {
    showToast(error.message, true);
  }
}

function bind() {
  $('open-add').onclick = openAdd;
  $('close-modal').onclick = closeModal;
  $('cancel-modal').onclick = closeModal;
  modal.onclick = (event) => {
    if (event.target === modal) closeModal();
  };
  form.onsubmit = save;
  bindSignOut();

  $('product-search').oninput = (event) => {
    tableState.search = event.target.value;
    renderRows();
  };

  document.querySelectorAll('.sort-header').forEach((button) => {
    button.onclick = () => {
      if (tableState.sort === button.dataset.sort) {
        tableState.direction = tableState.direction === 'asc' ? 'desc' : 'asc';
      } else {
        tableState.sort = button.dataset.sort;
        tableState.direction = 'asc';
      }
      renderRows();
    };
  });

  $('upload-zone').onclick = () => $('file-input').click();
  $('file-input').onchange = (event) => {
    addFiles(event.target.files);
    event.target.value = '';
  };

  ['dragenter', 'dragover'].forEach((name) =>
    $('upload-zone').addEventListener(name, (event) => {
      event.preventDefault();
      $('upload-zone').classList.add('dragover');
    }),
  );

  ['dragleave', 'drop'].forEach((name) =>
    $('upload-zone').addEventListener(name, (event) => {
      event.preventDefault();
      $('upload-zone').classList.remove('dragover');
    }),
  );

  $('upload-zone').ondrop = (event) => addFiles(event.dataTransfer.files);

  $('add-brand-btn').onclick = async () => {
    const name = prompt('Nom de la marque :');
    if (!name?.trim()) return;

    try {
      const brand = await createBrand(name);
      await loadBrands();
      $('brand-select').value = brand.id;
      showToast('Marque ajoutée.');
    } catch (error) {
      showToast(error.message, true);
    }
  };

  $('add-category-btn').onclick = async () => {
    const name = prompt('Nom de la catégorie :');
    if (!name?.trim()) return;

    try {
      const category = await createCategory(name);
      await loadCategories();
      $('category-select').value = category.id;
      showToast('Catégorie ajoutée.');
    } catch (error) {
      showToast(error.message, true);
    }
  };
}

async function init() {
  try {
    admin = await requireAdmin();
    if (!admin) return;

    $('who').textContent = `Connecté(e) en tant que ${admin.full_name} (${admin.role})`;
    bind();
    await Promise.all([loadBrands(), loadCategories(), loadProducts(), loadStats()]);
  } catch (error) {
    showToast(error.message, true);
  }
}

init();
