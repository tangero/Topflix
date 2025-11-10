/**
 * Confirmation Email Template for Double Opt-In
 */

/**
 * Generate HTML for confirmation email
 * @param {string} confirmationUrl - URL with token for confirmation
 * @param {string} email - User's email address
 * @returns {string} HTML email content
 */
export function generateConfirmationHTML(confirmationUrl, email) {
  return `
<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Potvrďte přihlášení k newsletteru</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f5f5f5; padding: 20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">

          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #e50914 0%, #b20710 100%); padding: 40px 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px;">🎬 Topflix</h1>
              <p style="margin: 10px 0 0 0; color: #ffffff; font-size: 16px; opacity: 0.95;">Newsletter - Potvrďte přihlášení</p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="margin: 0 0 20px 0; color: #141414; font-size: 24px;">Ještě jeden krok!</h2>

              <p style="margin: 0 0 20px 0; color: #333; font-size: 16px; line-height: 1.6;">
                Děkujeme za zájem o newsletter Topflix! Pro dokončení přihlášení prosím potvrďte svou emailovou adresu kliknutím na tlačítko níže.
              </p>

              <p style="margin: 0 0 30px 0; color: #666; font-size: 14px;">
                Email: <strong>${email}</strong>
              </p>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding: 20px 0;">
                    <a href="${confirmationUrl}" style="display: inline-block; background: #e50914; color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 6px; font-size: 16px; font-weight: 600;">
                      Potvrdit přihlášení
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 30px 0 20px 0; color: #666; font-size: 14px; line-height: 1.6;">
                Pokud tlačítko nefunguje, zkopírujte a vložte tento odkaz do prohlížeče:
              </p>

              <p style="margin: 0 0 30px 0; color: #e50914; font-size: 12px; word-break: break-all; background: #f9f9f9; padding: 10px; border-radius: 4px;">
                ${confirmationUrl}
              </p>

              <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">

              <p style="margin: 0 0 10px 0; color: #999; font-size: 13px; line-height: 1.6;">
                <strong>Co dostanete v newsletteru?</strong>
              </p>
              <ul style="margin: 0; padding-left: 20px; color: #666; font-size: 13px; line-height: 1.8;">
                <li>Týdenní výběr nejlepších filmů a seriálů z Netflix Top 10</li>
                <li>Jen tituly s hodnocením 70% a výše</li>
                <li>Jeden email týdně každou středu</li>
                <li>Bez reklam a spamu</li>
              </ul>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f9f9f9; padding: 30px; text-align: center; border-top: 1px solid #e0e0e0;">
              <p style="margin: 0 0 10px 0; color: #999; font-size: 12px;">
                Tento email byl odeslán, protože jste se pokusili přihlásit k odběru newsletteru na <a href="https://www.topflix.cz" style="color: #e50914; text-decoration: none;">topflix.cz</a>
              </p>
              <p style="margin: 0 0 10px 0; color: #999; font-size: 12px;">
                Pokud jste se nepřihlašovali, tento email ignorujte.
              </p>
              <p style="margin: 0; color: #999; font-size: 12px;">
                <strong>Platnost odkazu:</strong> 24 hodin
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * Generate plain text version for confirmation email
 * @param {string} confirmationUrl - URL with token for confirmation
 * @param {string} email - User's email address
 * @returns {string} Plain text email content
 */
export function generateConfirmationText(confirmationUrl, email) {
  return `
Topflix Newsletter - Potvrďte přihlášení

Ještě jeden krok!

Děkujeme za zájem o newsletter Topflix! Pro dokončení přihlášení prosím potvrďte svou emailovou adresu kliknutím na odkaz níže.

Email: ${email}

Potvrdit přihlášení:
${confirmationUrl}

Co dostanete v newsletteru?
- Týdenní výběr nejlepších filmů a seriálů z Netflix Top 10
- Jen tituly s hodnocením 70% a výše
- Jeden email týdně každou středu
- Bez reklam a spamu

---

Tento email byl odeslán, protože jste se pokusili přihlásit k odběru newsletteru na topflix.cz

Pokud jste se nepřihlašovali, tento email ignorujte.

Platnost odkazu: 24 hodin
  `.trim();
}
