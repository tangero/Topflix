# Double Opt-In Newsletter Implementation

Tento dokument popisuje implementaci Double Opt-In systému pro newsletter Topflix podle oficiálního příkladu Resend.

## 📋 Co je implementováno

### **Nové soubory:**

1. **`/functions/_lib/crypto.js`**
   - Utility pro šifrování/dešifrování tokenů
   - Používá Web Crypto API (kompatibilní s Cloudflare Workers)
   - AES-GCM encryption s PBKDF2 key derivation

2. **`/functions/_lib/confirmation-email-template.js`**
   - HTML a plain text template pro confirmation email
   - Obsahuje CTA tlačítko s confirmation linkem
   - Responzivní design konzistentní s Topflix brandingem

3. **`/functions/api/newsletter-subscribe-v2.js`**
   - Nový subscribe endpoint s Double Opt-In
   - Přidá kontakt jako `unsubscribed: true`
   - Pošle confirmation email s encrypted tokenem
   - **Nepřepisuje** stávající `/api/newsletter-subscribe`

4. **`/functions/api/newsletter-confirm.js`**
   - Ověří encrypted token z emailu
   - Zkontroluje expiraci (24 hodin)
   - Aktivuje subscription (`unsubscribed: false`)
   - Přesměruje na confirmation stránku

5. **`/public/newsletter/confirm.html`**
   - Confirmation stránka zobrazující výsledek
   - Podporuje 4 stavy: success, error, expired, notfound
   - Responzivní design s dark/light mode

6. **`/public/newsletter/confirm.js`**
   - JavaScript pro confirmation stránku
   - Načte URL parametry a zobrazí odpovídající zprávu

---

## 🔐 Požadované environment proměnné

Pro aktivaci Double Opt-In je potřeba přidat do Cloudflare Dashboard:

```
SECRET_PASSPHRASE=<dlouhý-náhodný-string-min-32-znaků>
```

**Jak vygenerovat:**
```bash
# Linux/Mac
openssl rand -base64 32

# Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

**Už máme:**
- `RESEND_API_KEY` ✅
- `RESEND_AUDIENCE_ID` ✅
- `TMDB_API_KEY` ✅

---

## 🚀 Jak aktivovat Double Opt-In

### **Krok 1: Přidat SECRET_PASSPHRASE**

V Cloudflare Dashboard:
1. Settings → Environment variables
2. Přidat: `SECRET_PASSPHRASE` = vygenerovaný string
3. Deploy changes

### **Krok 2: Upravit frontend**

V `public/newsletter.js`, změnit endpoint:

```javascript
// Současná verze (Single Opt-In):
const response = await fetch('/api/newsletter-subscribe', {

// Změnit na (Double Opt-In):
const response = await fetch('/api/newsletter-subscribe-v2', {
```

### **Krok 3: Upravit hlášku**

V `public/newsletter.js`, změnit success zprávu:

```javascript
// Stará hláška:
showMessage(messageElement, 'Úspěšně přihlášeno! Zkontrolujte svůj email pro potvrzení.', 'success');

// Nová hláška:
showMessage(messageElement, 'Zkontrolujte svůj email a potvrďte přihlášení. Odkaz je platný 24 hodin.', 'success');
```

### **Krok 4: Nasadit změny**

```bash
git add .
git commit -m "Activate Double Opt-In for newsletter"
git push
```

---

## 🔄 Jak to funguje (flow)

### **1. Uživatel se přihlásí:**
- Zadá email na `/newsletter`
- Frontend volá `/api/newsletter-subscribe-v2`

### **2. Backend (subscribe-v2):**
```javascript
// a) Přidá kontakt jako UNSUBSCRIBED
await resend.contacts.create({
  email: email,
  unsubscribed: true  // ← Neaktivní!
});

// b) Vytvoří encrypted token
const token = encrypt(`${email}:${Date.now()}`);

// c) Pošle confirmation email
await resend.emails.send({
  to: email,
  html: confirmationEmail(confirmUrl)
});
```

### **3. Uživatel dostane email:**
- Subject: "Potvrďte přihlášení k newsletteru Topflix"
- Obsahuje CTA tlačítko s linkem:
  `https://www.topflix.cz/api/newsletter-confirm?token=...`

### **4. Uživatel klikne na link:**
- Otevře `/api/newsletter-confirm?token=...`

### **5. Backend (confirm):**
```javascript
// a) Dekóduje token
const [email, timestamp] = decrypt(token).split(':');

// b) Zkontroluje expiraci (24h)
if (Date.now() - timestamp > 24 * 60 * 60 * 1000) {
  return redirect('expired');
}

// c) Aktivuje subscription
await resend.contacts.update({
  email: email,
  unsubscribed: false  // ← AKTIVOVÁNO!
});

// d) Přesměruje na success stránku
return redirect('/newsletter/confirm.html?status=success');
```

### **6. Uživatel vidí:**
- Confirmation stránku s "✅ Přihlášení potvrzeno!"
- Informace o prvním newsletteru (příští středa)

---

## 📊 Porovnání Single vs Double Opt-In

| Vlastnost | Single Opt-In (aktuální) | Double Opt-In (nový) |
|-----------|-------------------------|---------------------|
| **Endpoint** | `/api/newsletter-subscribe` | `/api/newsletter-subscribe-v2` |
| **Email okamžitě aktivní?** | ✅ Ano | ❌ Ne (čeká na potvrzení) |
| **Confirmation email** | ❌ Ne | ✅ Ano |
| **GDPR compliance** | ⚠️ Riziková | ✅ Plně compliant |
| **Ochrana proti spam přihlašování** | ❌ Ne | ✅ Ano |
| **Sender reputation** | ⚠️ Nižší | ✅ Vyšší |
| **Token expiration** | N/A | ✅ 24 hodin |
| **Šifrování tokenů** | N/A | ✅ AES-GCM |

---

## 🧪 Testování

### **Test 1: Úspěšné přihlášení**
1. Jdi na `/newsletter`
2. Zadej svůj email
3. Zkontroluj inbox → měl by přijít confirmation email
4. Klikni na "Potvrdit přihlášení"
5. Měla by se zobrazit success stránka

### **Test 2: Expirovaný token**
1. Přihlas se k newsletteru
2. Počkej 24+ hodin
3. Klikni na confirmation link
4. Měla by se zobrazit "Odkaz vypršel"

### **Test 3: Neplatný token**
1. Otevři URL: `/api/newsletter-confirm?token=invalid123`
2. Měla by se zobrazit error stránka

---

## 🔍 Debugging

### **Logy v Cloudflare Dashboard:**

Functions → Real-time logs

**Úspěšné přihlášení:**
```
Confirmation email sent to: user@email.com, Email ID: abc123
```

**Úspěšná aktivace:**
```
Subscription activated for: user@email.com
```

**Chyby:**
```
Failed to decrypt token: ...
Token expired for user@email.com. Age: 1500 minutes
```

---

## 🔙 Rollback (vrátit se na Single Opt-In)

Pokud by bylo potřeba vrátit se zpět:

1. Ve `public/newsletter.js` změnit endpoint zpět na `/api/newsletter-subscribe`
2. Nepotřebuješ mazat nové soubory (zůstanou neaktivní)

---

## 📝 Poznámky

- **Stávající subscribery** (Single Opt-In) nijak neovlivní
- **Nové subscribery** budou muset potvrdit email
- Token je **stateless** (není potřeba databáze)
- Confirmation email používá **stejný design** jako hlavní newsletter
- **Resend Audience** zůstává jediný zdroj pravdy

---

## 📚 Reference

- [Resend Double Opt-In Example](https://github.com/resend/resend-double-opt-in-example)
- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
- [GDPR Email Marketing](https://gdpr.eu/email-encryption/)
