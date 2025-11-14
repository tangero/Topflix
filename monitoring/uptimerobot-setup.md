# UptimeRobot Setup Guide

Kompletní návod na nastavení UptimeRobot monitorů pro Topflix.cz.

## 🎯 Přehled

UptimeRobot poskytuje **50 bezplatných monitorů** s 5-minutovým intervalem.
Použijeme 6 monitorů pro kompletní pokrytí.

## 📊 Monitor Configuration

### Monitor 1: Overall Health Check ⭐ CRITICAL

**Základní informace:**
- **URL**: `https://www.topflix.cz/api/health`
- **Type**: HTTP(s) - Keyword
- **Friendly Name**: `Topflix - Overall Health`
- **Monitoring Interval**: 5 minutes

**Keyword Settings:**
- **Keyword Type**: Exists
- **Keyword Value**: `"status":"healthy"`
- **Case Sensitive**: Yes

**Alert Contacts:**
- Email: ✅ Immediate
- SMS: ❌ (optional)

**HTTP Settings:**
- **Method**: GET
- **Timeout**: 30 seconds
- **Follow redirects**: Yes

**Expected HTTP Status Code**: `200`

---

### Monitor 2: Data Collection Health ⭐ HIGH PRIORITY

**Základní informace:**
- **URL**: `https://www.topflix.cz/api/health?check=data`
- **Type**: HTTP(s) - Keyword
- **Friendly Name**: `Topflix - Data Collection`
- **Monitoring Interval**: 15 minutes

**Keyword Settings:**
- **Keyword Type**: Not Exists
- **Keyword Value**: `"status":"unhealthy"`
- **Case Sensitive**: Yes

**Alert Contacts:**
- Email: ✅ Immediate
- SMS: ❌ (optional)

**Expected HTTP Status Code**: `200`

---

### Monitor 3: Data Age Critical ⭐ CRITICAL

**Základní informace:**
- **URL**: `https://www.topflix.cz/api/health?check=data`
- **Type**: HTTP(s) - Keyword
- **Friendly Name**: `Topflix - Data Age (Critical)`
- **Monitoring Interval**: 30 minutes

**Keyword Settings:**
- **Keyword Type**: Not Exists
- **Keyword Value**: `>48h`
- **Case Sensitive**: No

**Alert Contacts:**
- Email: ✅ Immediate
- SMS: ✅ (doporučeno pro critical)

**Expected HTTP Status Code**: `200`

**Notes:**
Tento monitor detekuje když health endpoint vrací ">48h" v issues.

---

### Monitor 4: TOP10 API Availability

**Základní informace:**
- **URL**: `https://www.topflix.cz/api/top10`
- **Type**: HTTP(s) - Keyword
- **Friendly Name**: `Topflix - TOP10 API`
- **Monitoring Interval**: 5 minutes

**Keyword Settings:**
- **Keyword Type**: Exists
- **Keyword Value**: `"films"`
- **Case Sensitive**: Yes

**Alert Contacts:**
- Email: ✅ Immediate

**Expected HTTP Status Code**: `200`

**Performance Alert:**
- Response time: >2000ms (warning)

---

### Monitor 5: Netflix New API

**Základní informace:**
- **URL**: `https://www.topflix.cz/api/netflix-new`
- **Type**: HTTP(s)
- **Friendly Name**: `Topflix - Netflix New API`
- **Monitoring Interval**: 15 minutes

**Alert Contacts:**
- Email: ✅ Immediate

**Expected HTTP Status Code**: `200`

---

### Monitor 6: System Health

**Základní informace:**
- **URL**: `https://www.topflix.cz/api/health?check=system`
- **Type**: HTTP(s) - Keyword
- **Friendly Name**: `Topflix - System Health`
- **Monitoring Interval**: 10 minutes

**Keyword Settings:**
- **Keyword Type**: Exists
- **Keyword Value**: `"database":"connected"`
- **Case Sensitive**: Yes

**Alert Contacts:**
- Email: ✅ Immediate
- SMS: ✅ (critical - DB down)

**Expected HTTP Status Code**: `200`

---

## 🔔 Alert Configurations

### Email Alert Settings

**Alert When:**
- Monitor goes down
- Monitor comes back up (optional)

**Re-test Before Alert:**
- Enabled (1 retry after 1 minute)

**Alert Timing:**
- Immediate (pro critical monitors)
- After 5 minutes downtime (pro non-critical)

### SMS Alert Settings (Optional)

**Pro SMS alerty potřebuješ:**
- UptimeRobot PRO účet ($7/měsíc)
- Nebo SMS credits ($0.05/SMS)

**Doporučené pro SMS:**
- Monitor 1 (Overall Health)
- Monitor 3 (Data Age Critical)
- Monitor 6 (System Health - DB)

---

## 📧 Email Contact Setup

1. **Přidej Email Contact:**
   - My Settings → Alert Contacts
   - Add Alert Contact → Email
   - Email: `tvůj@email.com`
   - Friendly Name: `Primary Alert`
   - Verify email

2. **Přiřaď k Monitorům:**
   - Edit každý monitor
   - Alert Contacts → Vybrat Primary Alert
   - Save

---

## 🎨 Custom HTTP Headers (Optional)

Pro některé monitors můžeš přidat custom headers:

```
User-Agent: UptimeRobot/2.0
```

---

## 📊 Reporting

### Public Status Page (Optional)

UptimeRobot nabízí veřejnou status page:

1. **Vytvoř Status Page:**
   - Status Pages → Add Status Page
   - URL: `topflix.statuspage.io` (nebo custom domain)

2. **Přidej Monitors:**
   - Vybrat které monitors zobrazit
   - Customize design
   - Publish

3. **Public URL:**
   - `https://stats.uptimerobot.com/xxx`
   - Můžeš embedovat na topflix.cz

---

## 🔧 Advanced Settings

### Maintenance Windows

Pokud plánuješ maintenance:

1. **Create Maintenance Window:**
   - Monitors → Maintenance Windows
   - Add Maintenance Window
   - Start/End time
   - Select monitors

2. **Pausnout alerty během maintenance**

### Webhook Integration (Advanced)

Pro integraci s Discord/Slack:

```bash
# Discord Webhook
Webhook URL: https://discord.com/api/webhooks/xxx
Method: POST
Body:
{
  "content": "🚨 Topflix.cz is down! *monitorFriendlyName* - *alertDetails*"
}
```

---

## 📈 Monitor Usage

**Free Tier Limit**: 50 monitors

**Použité**: 6/50 monitors
**Zbývá**: 44 monitors

**Plánované rozšíření:**
- Newsletter API monitoring
- Archive API monitoring
- Stats API monitoring
- Cloudflare Workers health

---

## 🧪 Testing

### Test Monitors

1. **Pause Monitor:**
   - Edit monitor → Pause monitoring
   - Wait 1 minute
   - Resume → měl bys dostat alert

2. **Test Keyword Detection:**
   - Temporary change keyword to invalid value
   - Wait for next check
   - Should trigger alert

### Verify Alerts

```bash
# Simuluj downtime
# (nedělej v produkci!)
curl -X POST https://api.uptimerobot.com/v2/editMonitor \
  -H "Content-Type: application/json" \
  -d '{
    "api_key": "YOUR_API_KEY",
    "id": "MONITOR_ID",
    "status": 0
  }'
```

---

## 📱 Mobile App

UptimeRobot má mobilní aplikace:
- **iOS**: [App Store](https://apps.apple.com/app/uptimerobot/id778602639)
- **Android**: [Google Play](https://play.google.com/store/apps/details?id=com.uptimerobot)

**Features:**
- Push notifications
- Monitor overview
- Quick monitor pause/resume
- Incident timeline

---

## 🎯 KPIs a Metriky

### Uptime Targets

- **Overall Health**: 99.5% uptime
- **TOP10 API**: 99.5% uptime
- **Data Freshness**: 95% <48h threshold

### Response Time Targets

- `/api/health`: <500ms (p95)
- `/api/top10`: <2s (p95)
- `/api/netflix-new`: <2s (p95)

### Export Reports

1. **Dashboard → Reports**
2. **Select monitors + date range**
3. **Export PDF/CSV**

---

## 🔗 Quick Links

- **Dashboard**: https://uptimerobot.com/dashboard
- **API Docs**: https://uptimerobot.com/api/
- **Status**: https://status.uptimerobot.com/

---

## ✅ Setup Checklist

- [ ] Vytvořit UptimeRobot účet
- [ ] Verify email
- [ ] Vytvořit Monitor 1 (Overall Health)
- [ ] Vytvořit Monitor 2 (Data Collection)
- [ ] Vytvořit Monitor 3 (Data Age Critical)
- [ ] Vytvořit Monitor 4 (TOP10 API)
- [ ] Vytvořit Monitor 5 (Netflix New API)
- [ ] Vytvořit Monitor 6 (System Health)
- [ ] Nastavit email alerty
- [ ] Otestovat alerting (pause/resume monitor)
- [ ] (Optional) Vytvořit Public Status Page
- [ ] (Optional) Nastavit SMS alerty
- [ ] (Optional) Stáhnout mobilní app

---

Vytvořil: Claude Code
Datum: 2025-11-14
Verze: 1.0
