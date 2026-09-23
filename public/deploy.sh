#!/bin/bash
# ============================================================
# SohozKarbar — 178871 (v237) SELF-DEPLOY SCRIPT
# ব্যবহার: এই ফাইলটা source ফোল্ডারের ভেতরে রাখো, তারপর চালাও:
#   bash deploy.sh
# আগে একবার: npm install -g surge  এবং  surge login
# ============================================================
set -e
cd "$(dirname "$0")"

echo "== ১) surge আছে কি না =="
if ! command -v surge >/dev/null 2>&1; then
  echo "surge নেই — ইনস্টল করছি..."; npm install -g surge
fi

echo "== ২) লগইন চেক (প্রম্পট এলে ইমেইল+পাসওয়ার্ড দিন) =="
surge whoami || surge login

echo "== ৩) তিন ডোমেইনে deploy =="
echo www.sohozkarbar.pro.bd > CNAME
surge . www.sohozkarbar.pro.bd

echo sohozkarbar.pro.bd > CNAME
surge . sohozkarbar.pro.bd

echo sohozkarbar.surge.sh > CNAME
surge . sohozkarbar.surge.sh

echo www.sohozkarbar.pro.bd > CNAME

echo ""
echo "============================================"
echo "✅ DEPLOY সম্পূর্ণ — এখন লাইভ হওয়ার কথা 178871"
echo "যাচাই: https://www.sohozkarbar.pro.bd/version.json"
echo "============================================"
