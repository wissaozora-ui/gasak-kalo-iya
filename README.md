# GASAK, KALO IYA.

Cloudflare Worker + Static Assets + D1 access-code gate.

Files:
- index.html — customer-facing GASAK
- _worker.js — access-code gate and session handling
- schema.sql — D1 tables
- wrangler.jsonc — Worker + Static Assets configuration

D1 binding name must be: DB
Static Assets binding is: ASSETS

Create the D1 tables using schema.sql, then add at least one row to access_codes.