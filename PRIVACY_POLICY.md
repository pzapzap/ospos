# OSPOS Privacy Policy

Last updated: February 2026

## What OSPOS Collects

### Free Tier (Cash Only)
- **Nothing leaves your device.** All data (menu items, orders, settings) is stored locally on your phone using SQLite. No accounts, no analytics, no tracking.

### Paid Tier (Card Payments)
When you opt into card payments, the following data is collected:
- **Email address** — for account creation and login
- **Payment data** — processed by Stripe (we never see or store card numbers)
- **Order data** — synced to our server for backup and dispute management
- **Push notification token** — to alert you about disputes and account changes

## How Data Is Used
- Email: authentication only
- Order data: cloud backup, dispute evidence, sales reporting
- Push tokens: dispute notifications, account alerts
- We do not sell, share, or monetize your data in any way

## Third-Party Services
- **Stripe** — payment processing ([Stripe Privacy Policy](https://stripe.com/privacy))
- **Twilio** — SMS receipts (phone numbers are used only for delivery, not stored)
- **SendGrid** — email receipts (email addresses are used only for delivery, not stored)
- **Expo** — push notifications ([Expo Privacy](https://expo.dev/privacy))

## Data Storage
- Free tier: all data stored locally on your device
- Paid tier: order data stored in PostgreSQL database hosted in the US
- Passwords are hashed with bcrypt (never stored in plaintext)

## Data Deletion
- Free tier: uninstall the app to delete all data
- Paid tier: email hello@ospos.app to request account and data deletion

## Contact
Questions about this privacy policy: hello@ospos.app

## Changes
We may update this policy. Changes will be posted here with an updated date.
