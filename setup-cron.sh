#!/bin/bash
# Script to setup Cron Trigger for Topflix newsletter via Cloudflare API
# Usage: ./setup-cron.sh

# Configuration
ACCOUNT_ID="your_account_id_here"  # Get from Cloudflare Dashboard URL
PROJECT_NAME="topflix"
CRON_EXPRESSION="0 15 * * 3"  # Every Wednesday at 15:00 UTC
FUNCTION_PATH="functions/scheduled/weekly-newsletter.js"

# You need to get your API token from:
# Dashboard > My Profile > API Tokens > Create Token
# Use template: "Edit Cloudflare Workers"
echo "⚠️  Tento script potřebuje Cloudflare API Token"
echo "Vytvoř token na: https://dash.cloudflare.com/profile/api-tokens"
echo "Použij template: 'Edit Cloudflare Workers'"
echo ""
read -p "Zadej Cloudflare API Token: " CF_API_TOKEN

if [ -z "$CF_API_TOKEN" ]; then
    echo "❌ API Token je povinný"
    exit 1
fi

# Check if ACCOUNT_ID is set
if [ "$ACCOUNT_ID" == "your_account_id_here" ]; then
    echo "⚠️  Prosím nastav ACCOUNT_ID v tomto scriptu"
    echo "Najdeš ho v URL Cloudflare Dashboard:"
    echo "https://dash.cloudflare.com/[ACCOUNT_ID]/pages/view/topflix"
    exit 1
fi

echo "🔧 Nastavuji Cron Trigger pro projekt $PROJECT_NAME..."

# Call Cloudflare API to setup cron trigger
# Note: This endpoint might need adjustment based on Cloudflare's current API
curl -X PUT "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/pages/projects/$PROJECT_NAME/deployments/production/crons" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"schedules\": [
      {
        \"cron\": \"$CRON_EXPRESSION\",
        \"function\": \"$FUNCTION_PATH\"
      }
    ]
  }"

echo ""
echo "✅ Hotovo! Zkontroluj v Cloudflare Dashboard:"
echo "   Dashboard > Workers & Pages > topflix > Settings > Functions > Cron Triggers"
