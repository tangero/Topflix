/**
 * Newsletter page - Subscribe and Unsubscribe forms
 */

// Theme toggle (same as app.js)
function initTheme() {
    const themeToggle = document.getElementById('themeToggle');
    const themeIcon = document.querySelector('.theme-icon');

    // Get saved theme or default to dark
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.body.classList.add(`${savedTheme}-mode`);
    updateThemeIcon(savedTheme, themeIcon);

    themeToggle.addEventListener('click', () => {
        const currentTheme = document.body.classList.contains('dark-mode') ? 'dark' : 'light';
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

        document.body.classList.remove(`${currentTheme}-mode`);
        document.body.classList.add(`${newTheme}-mode`);
        localStorage.setItem('theme', newTheme);
        updateThemeIcon(newTheme, themeIcon);
    });
}

function updateThemeIcon(theme, iconElement) {
    iconElement.textContent = theme === 'dark' ? '☀️' : '🌙';
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
                showMessage(messageElement, 'Úspěšně přihlášeno! Zkontrolujte svůj email pro potvrzení.', 'success');
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
