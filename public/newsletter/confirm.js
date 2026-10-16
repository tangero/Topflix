/**
 * Newsletter Confirmation Page
 * Displays confirmation status based on URL parameters
 */

// Theme toggle (same as other pages)
function getSunriseSunset() {
    const latitude = 50.0755;
    const longitude = 14.4378;
    const now = new Date();
    const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
    const declination = -23.45 * Math.cos((360 / 365) * (dayOfYear + 10) * Math.PI / 180);
    const hourAngle = Math.acos(-Math.tan(latitude * Math.PI / 180) * Math.tan(declination * Math.PI / 180)) * 180 / Math.PI;
    const solarNoon = 12 - (longitude / 15);
    const sunriseUTC = solarNoon - (hourAngle / 15);
    const sunsetUTC = solarNoon + (hourAngle / 15);
    const isDST = isDaylightSavingTime(now);
    const offset = isDST ? 2 : 1;
    return { sunrise: sunriseUTC + offset, sunset: sunsetUTC + offset };
}

function isDaylightSavingTime(date) {
    const year = date.getFullYear();
    const marchLastSunday = new Date(year, 2, 31);
    marchLastSunday.setDate(31 - marchLastSunday.getDay());
    const octoberLastSunday = new Date(year, 9, 31);
    octoberLastSunday.setDate(31 - octoberLastSunday.getDay());
    return date >= marchLastSunday && date < octoberLastSunday;
}

function shouldUseDarkMode() {
    const now = new Date();
    const currentTime = now.getHours() + now.getMinutes() / 60;
    const { sunrise, sunset } = getSunriseSunset();
    return currentTime < sunrise || currentTime >= sunset;
}

function applyTheme(theme) {
    let actualTheme = theme;
    if (theme === 'auto') {
        actualTheme = shouldUseDarkMode() ? 'dark' : 'light';
    }
    if (actualTheme === 'light') {
        document.body.classList.add('light-mode');
    } else {
        document.body.classList.remove('light-mode');
    }
    const icons = { 'light': '☀️', 'dark': '🌙', 'auto': '🌓' };
    const themeIcon = document.querySelector('.theme-icon');
    if (themeIcon) {
        themeIcon.textContent = icons[theme];
    }
}

function toggleTheme() {
    const currentTheme = localStorage.getItem('theme') || 'auto';
    let nextTheme;
    if (currentTheme === 'dark') {
        nextTheme = 'light';
    } else if (currentTheme === 'light') {
        nextTheme = 'auto';
    } else {
        nextTheme = 'dark';
    }
    localStorage.setItem('theme', nextTheme);
    applyTheme(nextTheme);
    if (nextTheme === 'auto') {
        setInterval(() => {
            if (localStorage.getItem('theme') === 'auto') {
                applyTheme('auto');
            }
        }, 60000);
    }
}

function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'auto';
    applyTheme(savedTheme);
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }
    if (savedTheme === 'auto') {
        setInterval(() => {
            applyTheme('auto');
        }, 60000);
    }
}

// The message comes from the URL, so it is escaped before it goes into innerHTML.
function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

// Get URL parameters (URLSearchParams already decodes them)
function getUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const message = params.get('message');
    return {
        status: params.get('status'),
        message: message ? escapeHtml(message) : ''
    };
}

// Display confirmation content based on status
function displayConfirmationStatus() {
    const { status, message } = getUrlParams();
    const card = document.getElementById('confirmationCard');

    let content = '';

    switch (status) {
        case 'success':
            const email = message || '';
            content = `
                <div class="confirmation-icon">✅</div>
                <h2 class="confirmation-title">Přihlášení potvrzeno!</h2>
                <p class="confirmation-message">
                    Váš newsletter byl úspěšně aktivován.
                    ${email ? `<span class="confirmation-email">${email}</span>` : ''}
                </p>
                <p class="confirmation-message">
                    První newsletter dostanete nejbližší úterý odpoledne s výběrem nejlepších filmů a seriálů na Netflixu.
                </p>
                <div class="confirmation-actions">
                    <a href="../index.html" class="confirmation-button">Zobrazit filmy na Netflixu</a>
                    <a href="../newsletter.html" class="confirmation-button confirmation-button-secondary">Zpět na newsletter</a>
                </div>
                <div class="confirmation-details">
                    <strong>Co dostanete v newsletteru?</strong><br>
                    • Týdenní výběr nejlepších filmů a seriálů z Netflix Top 10<br>
                    • Jen tituly s hodnocením 70% a výše<br>
                    • Bez reklam a spamu<br>
                    • Odhlásit se můžete kdykoliv
                </div>
            `;
            break;

        case 'expired':
            const expiredEmail = message || '';
            content = `
                <div class="confirmation-icon">⏰</div>
                <h2 class="confirmation-title">Odkaz vypršel</h2>
                <p class="confirmation-message">
                    Tento potvrzovací odkaz již vypršel. Potvrzovací odkazy jsou platné pouze 24 hodin.
                    ${expiredEmail ? `<span class="confirmation-email">${expiredEmail}</span>` : ''}
                </p>
                <p class="confirmation-message">
                    Pro nové přihlášení prosím zadejte svůj email znovu.
                </p>
                <div class="confirmation-actions">
                    <a href="../newsletter.html" class="confirmation-button">Přihlásit se znovu</a>
                    <a href="../index.html" class="confirmation-button confirmation-button-secondary">Zpět na hlavní stránku</a>
                </div>
            `;
            break;

        case 'notfound':
            const notfoundEmail = message || '';
            content = `
                <div class="confirmation-icon">❓</div>
                <h2 class="confirmation-title">Email nenalezen</h2>
                <p class="confirmation-message">
                    Tento email nebyl nalezen v našem seznamu odběratelů.
                    ${notfoundEmail ? `<span class="confirmation-email">${notfoundEmail}</span>` : ''}
                </p>
                <p class="confirmation-message">
                    Zkuste se prosím přihlásit znovu.
                </p>
                <div class="confirmation-actions">
                    <a href="../newsletter.html" class="confirmation-button">Přihlásit se k newsletteru</a>
                    <a href="../index.html" class="confirmation-button confirmation-button-secondary">Zpět na hlavní stránku</a>
                </div>
            `;
            break;

        case 'error':
        default:
            const errorMsg = message || 'Neznámá chyba';
            content = `
                <div class="confirmation-icon">❌</div>
                <h2 class="confirmation-title">Něco se pokazilo</h2>
                <p class="confirmation-message">
                    Při potvrzování vašeho přihlášení došlo k chybě.
                </p>
                <p class="confirmation-message" style="font-size: 0.9rem; color: var(--text-secondary);">
                    Chyba: ${errorMsg}
                </p>
                <div class="confirmation-actions">
                    <a href="../newsletter.html" class="confirmation-button">Zkusit znovu</a>
                    <a href="../index.html" class="confirmation-button confirmation-button-secondary">Zpět na hlavní stránku</a>
                </div>
                <div class="confirmation-details">
                    Pokud problém přetrvává, kontaktujte nás prosím.
                </div>
            `;
            break;
    }

    card.innerHTML = content;
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    displayConfirmationStatus();
});
