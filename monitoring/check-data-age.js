#!/usr/bin/env node

/**
 * Data Age Monitoring Script
 * Kontroluje stáří dat a posílá alerty
 * Použití: node monitoring/check-data-age.js [--alert]
 */

const HEALTH_API = 'https://www.topflix.cz/api/health?check=data';
const WARN_THRESHOLD = 48; // hours
const CRITICAL_THRESHOLD = 72; // hours

async function checkDataAge() {
  try {
    console.log('🔍 Checking data age...');
    console.log(`API: ${HEALTH_API}\n`);

    const response = await fetch(HEALTH_API);

    if (!response.ok) {
      console.error(`❌ API returned status: ${response.status}`);
      return { success: false, error: 'API_ERROR' };
    }

    const data = await response.json();
    const dataCollection = data.checks.data_collection;

    const ageHours = dataCollection.age_hours;
    const status = dataCollection.status;
    const totalRecords = dataCollection.total_records;
    const qualityRecords = dataCollection.quality_records;
    const issues = dataCollection.issues;

    console.log('📊 Data Collection Status:');
    console.log(`   Status: ${status}`);
    console.log(`   Age: ${ageHours} hours`);
    console.log(`   Total records: ${totalRecords}`);
    console.log(`   Quality records: ${qualityRecords}`);
    console.log(`   Last TOP10 update: ${dataCollection.last_top10_update || 'N/A'}`);
    console.log(`   Last Netflix New update: ${dataCollection.last_netflix_new_update || 'N/A'}`);

    if (issues.length > 0) {
      console.log('\n⚠️  Issues:');
      issues.forEach(issue => console.log(`   - ${issue}`));
    }

    console.log('');

    // Vyhodnocení
    if (ageHours === null) {
      console.error('❌ UNKNOWN: Could not determine data age');
      return { success: false, error: 'UNKNOWN_AGE', data: dataCollection };
    }

    if (ageHours > CRITICAL_THRESHOLD) {
      console.error(`🚨 CRITICAL: Data is ${ageHours} hours old (>${CRITICAL_THRESHOLD}h)`);
      return { success: false, level: 'critical', ageHours, data: dataCollection };
    }

    if (ageHours > WARN_THRESHOLD) {
      console.warn(`⚠️  WARNING: Data is ${ageHours} hours old (>${WARN_THRESHOLD}h)`);
      return { success: true, level: 'warning', ageHours, data: dataCollection };
    }

    console.log(`✅ OK: Data is ${ageHours} hours old (<${WARN_THRESHOLD}h)`);
    return { success: true, level: 'ok', ageHours, data: dataCollection };

  } catch (error) {
    console.error('❌ Error checking data age:', error.message);
    return { success: false, error: 'EXCEPTION', message: error.message };
  }
}

async function sendEmailAlert(result, resendApiKey, alertEmail) {
  if (!resendApiKey || !alertEmail) {
    console.error('⚠️  RESEND_API_KEY or ALERT_EMAIL not configured - skipping email');
    return;
  }

  const { level, ageHours, data } = result;

  const subject = level === 'critical'
    ? `🚨 CRITICAL: Topflix.cz data is ${ageHours}h old`
    : `⚠️ WARNING: Topflix.cz data is ${ageHours}h old`;

  const body = `
Data Freshness Alert

Level: ${level.toUpperCase()}
Data Age: ${ageHours} hours
Threshold: ${level === 'critical' ? CRITICAL_THRESHOLD : WARN_THRESHOLD} hours

Status: ${data.status}
Total Records: ${data.total_records}
Quality Records: ${data.quality_records}

Last Updates:
- TOP10: ${data.last_top10_update || 'N/A'}
- Netflix New: ${data.last_netflix_new_update || 'N/A'}

Issues:
${data.issues.length > 0 ? data.issues.map(i => `- ${i}`).join('\n') : 'None'}

---
Topflix.cz Monitoring
https://www.topflix.cz
  `.trim();

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'alerts@topflix.cz',
        to: alertEmail,
        subject,
        text: body
      })
    });

    if (response.ok) {
      console.log('✅ Alert email sent');
    } else {
      const error = await response.text();
      console.error('❌ Failed to send email:', error);
    }
  } catch (error) {
    console.error('❌ Error sending email:', error.message);
  }
}

function logToFile(result) {
  const fs = require('fs');
  const path = require('path');

  const logDir = path.join(__dirname, 'logs');
  const logFile = path.join(logDir, 'data-age.log');

  // Vytvořit logs složku pokud neexistuje
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level: result.level || 'error',
    ageHours: result.ageHours || null,
    status: result.data?.status || 'unknown',
    totalRecords: result.data?.total_records || 0,
    issues: result.data?.issues || []
  };

  fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
  console.log(`📝 Logged to: ${logFile}`);
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const shouldAlert = args.includes('--alert');
  const shouldLog = args.includes('--log');

  const result = await checkDataAge();

  // Log to file
  if (shouldLog) {
    logToFile(result);
  }

  // Send alert email if needed
  if (shouldAlert && result.level && ['warning', 'critical'].includes(result.level)) {
    const resendApiKey = process.env.RESEND_API_KEY;
    const alertEmail = process.env.ALERT_EMAIL;

    if (resendApiKey && alertEmail) {
      await sendEmailAlert(result, resendApiKey, alertEmail);
    }
  }

  // Exit code
  if (!result.success || result.level === 'critical') {
    process.exit(1);
  }

  process.exit(0);
}

main();
