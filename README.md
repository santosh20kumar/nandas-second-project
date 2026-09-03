# Nanda's Creative — Bakery Ordering Website

Razorpay Test Mode is integrated. Generate Test API keys in Razorpay Dashboard → Account & Settings → API Keys, then put them in Render Environment Variables.

Render:
- Build: npm install
- Start: npm start
- RAZORPAY_KEY_ID=<test key id>
- RAZORPAY_KEY_SECRET=<test key secret>
- SHOP_NAME=Nanda's Creative
- SHOP_WHATSAPP=919000000000
- DELIVERY_FEE=50
- FREE_DELIVERY_ABOVE=299
- ADMIN_PASSWORD=<strong private password>

Never commit the Razorpay Key Secret to GitHub. Test Mode is simulated and does not move real money. Switch to Live keys only after KYC/approval and successful testing.
