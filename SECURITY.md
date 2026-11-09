# Security policy

## Supported versions

Only the latest version on `main`, deployed at [sumito.kashifaziz.me](https://sumito.kashifaziz.me), receives fixes.

## Report a vulnerability

Please **do not open a public issue** for a security problem. Use GitHub's private reporting instead:
**Security → Report a vulnerability** on [github.com/kashaziz/sumito](https://github.com/kashaziz/sumito/security/advisories/new).

Include the steps to reproduce, the impact, and any suggested fix. You should get a reply within a week.

## Scope

Sumito has no accounts, no database, and no server-side user data. The most relevant areas are the Cloudflare Worker (`worker/index.ts`), the service worker (`public/sw.js`), and the shared replay links (`?replay=`).
