/**
 * Newsletter page - Subscribe and Unsubscribe forms
 */

// Theme toggle with auto mode based on sunrise/sunset in Prague
function getSunriseSunset() {
    // Prague coordinates
    const latitude = 50.0755;
    const longitude = 14.4378;

    const now = new Date();
    const day = now.getDate();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    // Calculate day of year
    const dayOfYear = Math.floor((now - new Date(year, 0, 0)) / 86400000);

    // Solar declination (simplified)
    const declination = -23.45 * Math.cos((360 / 365) * (dayOfYear + 10) * Math.PI / 180);

    // Hour angle for sunrise/sunset
    const hourAngle = Math.acos(
        -Math.tan(latitude * Math.PI / 180) * Math.tan(declination * Math.PI / 180)
    ) * 180 / Math.PI;

    // Calculate sunrise and sunset in UTC
    const solarNoon = 12 - (longitude / 15);
    const sunriseUTC = solarNoon - (hourAngle / 15);
    const sunsetUTC = solarNoon + (hourAngle / 15);

    // Convert to Prague time (UTC+1 in winter, UTC+2 in summer)
    const isDST = isDaylightSavingTime(now);
    const offset = isDST ? 2 : 1;

    const sunrise = sunriseUTC + offset;
    const sunset = sunsetUTC + offset;

    return { sunrise, sunset };
}

function isDaylightSavingTime(date) {
    // DST in EU: last Sunday in March to last Sunday in October
    const year = date.getFullYear();

    // Last Sunday in March
    const marchLastSunday = new Date(year, 2, 31);
    marchLastSunday.setDate(31 - marchLastSunday.getDay());

    // Last Sunday in October
    const octoberLastSunday = new Date(year, 9, 31);
    octoberLastSunday.setDate(31 - octoberLastSunday.getDay());

    return date >= marchLastSunday && date < octoberLastSunday;
}

function shouldUseDarkMode() {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const currentTime = hours + minutes / 60;

    const { sunrise, sunset } = getSunriseSunset();

    // Dark mode between sunset and sunrise
    return currentTime < sunrise || currentTime >= sunset;
}

function applyTheme(theme) {
    let actualTheme = theme;

    // If auto mode, determine actual theme based on sun position
    if (theme === 'auto') {
        actualTheme = shouldUseDarkMode() ? 'dark' : 'light';
    }

    // Apply theme
    if (actualTheme === 'light') {
        document.body.classList.add('light-mode');
    } else {
        document.body.classList.remove('light-mode');
    }

    // Update icon
    const icons = {
        'light': '☀️',
        'dark': '🌙',
        'auto': '🌓'
    };
    const themeIcon = document.querySelector('.theme-icon');
    if (themeIcon) {
        themeIcon.textContent = icons[theme];
    }
}

function toggleTheme() {
    const currentTheme = localStorage.getItem('theme') || 'auto';

    // Cycle through: dark → light → auto → dark
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

    // If switching to auto, start interval
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

    // Setup toggle button
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }

    // If auto mode, update every minute
    if (savedTheme === 'auto') {
        setInterval(() => {
            applyTheme('auto');
        }, 60000); // Check every minute
    }
}

// Show message helper
function showMessage(messageElement, text, type) {
    messageElement.textContent = text;
    messageElement.className = `form-message ${type}`;
    messageElement.style.display = 'block';
}

function hideMessage(messageElement) {
    messageElement.style.display = 'none';
}

// Subscribe form handler
function setupSubscribeForm() {
    const form = document.getElementById('subscribeForm');
    const emailInput = document.getElementById('subscribeEmail');
    const submitButton = document.getElementById('subscribeButton');
    const messageElement = document.getElementById('subscribeMessage');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = emailInput.value.trim();

        if (!email) {
            showMessage(messageElement, 'Prosím zadejte platný email', 'error');
            return;
        }

        // Disable form during submission
        submitButton.disabled = true;
        submitButton.textContent = 'Odesílám...';
        hideMessage(messageElement);

        try {
            const response = await fetch('/api/newsletter-subscribe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                showMessage(messageElement, 'Hotovo, jste přihlášeni. Newsletter vám přijde každé úterý odpoledne.', 'success');
                emailInput.value = '';
            } else {
                showMessage(messageElement, data.error || 'Nepodařilo se přihlásit k odběru. Zkuste to prosím později.', 'error');
            }
        } catch (error) {
            console.error('Subscribe error:', error);
            showMessage(messageElement, 'Nepodařilo se přihlásit k odběru. Zkuste to prosím později.', 'error');
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = 'Odebírat newsletter';
        }
    });
}

// Unsubscribe form handler
function setupUnsubscribeForm() {
    const form = document.getElementById('unsubscribeForm');
    const emailInput = document.getElementById('unsubscribeEmail');
    const submitButton = document.getElementById('unsubscribeButton');
    const messageElement = document.getElementById('unsubscribeMessage');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = emailInput.value.trim();

        if (!email) {
            showMessage(messageElement, 'Prosím zadejte platný email', 'error');
            return;
        }

        // Disable form during submission
        submitButton.disabled = true;
        submitButton.textContent = 'Odesílám...';
        hideMessage(messageElement);

        try {
            const response = await fetch('/api/newsletter-unsubscribe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                showMessage(messageElement, 'Úspěšně odhlášeno z newsletteru.', 'success');
                emailInput.value = '';
            } else {
                showMessage(messageElement, data.error || 'Nepodařilo se odhlásit z odběru. Zkuste to prosím později.', 'error');
            }
        } catch (error) {
            console.error('Unsubscribe error:', error);
            showMessage(messageElement, 'Nepodařilo se odhlásit z odběru. Zkuste to prosím později.', 'error');
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = 'Odhlásit z newsletteru';
        }
    });
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    setupSubscribeForm();
    setupUnsubscribeForm();
});
