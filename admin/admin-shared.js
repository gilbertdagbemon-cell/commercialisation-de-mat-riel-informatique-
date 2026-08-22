import { signOut } from './supabase-client.js';

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }[character]));
}

export function showToast(message, isError = false, duration) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = 'toast show' + (isError ? ' error' : '');
  const configuredDuration = Number(toast.dataset.duration);
  const timeout = Number.isFinite(duration) ? duration : (configuredDuration || 3000);
  window.setTimeout(() => toast.classList.remove('show'), timeout);
}

export function bindSignOut() {
  const link = document.getElementById('signout-link');
  if (!link || link.dataset.signoutBound === '1') return;
  link.dataset.signoutBound = '1';
  link.addEventListener('click', async event => {
    event.preventDefault();
    await signOut();
    window.location.href = 'login.html';
  });
}
