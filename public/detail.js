/**
 * Topflix - Detail Page
 *
 * Stránku titulu (/film/…, /serial/…) vykreslí server. Tady se jen naváže
 * tlačítko sdílení a téma. Data se načítají v prohlížeči jen tehdy, když
 * obsah na stránce chybí (stará adresa detail.html?id=…).
 */

import { renderDetailHtml, buildMeta } from '/detail-view.js?v=1.15.0';

const loading = document.getElementById('loading');
const error = document.getElementById('error');
const detailContent = document.getElementById('detailContent');
const themeToggle = document.getElementById('themeToggle');

initTheme();
if (detailContent.dataset.prerendered === '1') {
    bindShare();
} else {
    loadDetail();
}

function initTheme() {
    let saved = 'auto';
    try { saved = localStorage.getItem('theme') || 'auto'; } catch (e) { /* jen pro tuto návštěvu */ }
    applyTheme(saved);
    themeToggle.addEventListener('click', toggleTheme);
}

function applyTheme(theme) {
    let actual = theme;
    if (theme === 'auto') {
        const hour = new Date().getHours();
        actual = (hour < 7 || hour >= 20) ? 'dark' : 'light';
    }
    document.body.classList.toggle('light-mode', actual === 'light');
    const icons = { light: '☀️', dark: '🌙', auto: '🌓' };
    themeToggle.querySelector('.theme-icon').textContent = icons[theme];
}

function toggleTheme() {
    let current = 'auto';
    try { current = localStorage.getItem('theme') || 'auto'; } catch (e) { /* bez úložiště */ }
    const next = current === 'dark' ? 'light' : current === 'light' ? 'auto' : 'dark';
    try { localStorage.setItem('theme', next); } catch (e) { /* bez úložiště */ }
    applyTheme(next);
}

function bindShare() {
    const btn = detailContent.querySelector('.share-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
        const url = btn.dataset.shareUrl || window.location.href;
        navigator.clipboard.writeText(url).then(() => {
            const original = btn.textContent;
            btn.textContent = 'Zkopírováno';
            setTimeout(() => { btn.textContent = original; }, 2000);
        }).catch(() => {});
    });
}

async function loadDetail() {
    const params = new URLSearchParams(window.location.search);
    const tmdbId = params.get('id');
    const type = params.get('type');

    if (!tmdbId || !type) {
        loading.classList.add('hidden');
        error.classList.remove('hidden');
        return;
    }

    try {
        const response = await fetch(`/api/detail?id=${encodeURIComponent(tmdbId)}&type=${encodeURIComponent(type)}`);
        if (!response.ok) throw new Error('Not found');
        const data = await response.json();
        if (!data.item) throw new Error('No data');

        const titlePath = (item) => window.TopflixUrl.titlePath(item);
        const canonical = new URL(titlePath(data.item), window.location.origin).href;
        detailContent.innerHTML = renderDetailHtml(data.item, data.history, data.similar, { shareUrl: canonical, titlePath });
        document.title = buildMeta(data.item, canonical).title;
        bindShare();

        loading.classList.add('hidden');
        detailContent.classList.remove('hidden');
    } catch (err) {
        console.error('Detail load error:', err);
        loading.classList.add('hidden');
        error.classList.remove('hidden');
    }
}
