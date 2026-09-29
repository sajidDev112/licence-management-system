# Opezee License Management System

A centralized license management platform: a React admin dashboard for issuing and
managing client licenses, a Node.js/Express API backed by Firebase Firestore, and
public endpoints your own products call to verify and periodically re-check a
license key.

```
          React Admin Dashboard  (frontend, :5173)
                     |   admin login -> bearer token
                     v
          Node.js + Express API  (backend, :5000)
                     |
                     v
              Firebase Firestore
                     ^
                     |
   POST /api/clients/login     (user signs in) <---  Your separate product
   POST /api/licenses/verify   (on demand)     <---  Your separate product
   POST /api/licenses/sync     (hourly)        <---  Your separate product
```

Your product never touches Firebase, and never needs an admin token. It only calls
`/api/clients/login`, `/api/licenses/verify` and `/api/licenses/sync`.

---

## Contents

- [Quick start](#quick-start)
- [Firebase setup](#firebase-setup)
- [Environment variables](#environment-variables)
- [Admin console](#admin-console)
- [Sending license emails](#sending-license-emails)
- [Project structure](#project-structure)
- [API documentation](#api-documentation)
- [Integrating your product](#integrating-your-product)
  - [1. Check a key is valid](#1-check-a-key-is-valid)
  - [2. Re-check hourly (auto-sync)](#2-re-check-hourly-auto-sync)
  - [3. Check login credentials](#3-check-login-credentials)
- [Security](#security)
- [Deploying to Render](#deploying-to-render)
- [Tests](#tests)
- [Data model](#data-model)
- [Future extensions](#future-extensions)

---

## Quick start

Requires Node.js 18 or newer (Node 20+ recommended). The dashboard and the API
are **one project**: one `package.json`, one `node_modules`, one `.env`.

```bash
npm install
cp .env.example .env
```

Fill in your Firebase credentials and a `JWT_SECRET` — see
[Environment variables](#environment-variables).

Create the admin account you will sign in with. It reads `ADMIN_EMAIL` and
`ADMIN_PASSWORD` from `.env`:

```bash
npm run create-admin
```

Then start everything:

```bash
npm run dev
```

That runs the API on <http://localhost:5000> and the dashboard on
<http://localhost:5173>. **Open the dashboard port** — Vite proxies `/api` to the
API, so the browser only ever talks to one origin, exactly as in production.

Check the API directly with:

```bash
curl http://localhost:5000/health
```

### Running one half on its own

```bash
npm run dev:api    # API only, with reload
npm run dev:web    # dashboard only
```

### Production build

```bash
npm run build      # dashboard -> dist/
npm start          # serves the API *and* dist/ on one port
```

`npm start` is the whole application on a single URL. See
[Deploying to Render](#deploying-to-render).

---

## Firebase setup

1. Go to the [Firebase console](https://console.firebase.google.com) and click
   **Add project**. Give it a name and finish the wizard. Google Analytics is not
   needed.
2. In the left sidebar choose **Build -> Firestore Database**, click
   **Create database**, pick a location, and start in **production mode**. The
   backend uses the Admin SDK, which bypasses security rules, so locked-down rules
   are exactly what you want.
3. Open **Project settings** (the gear icon) -> **Service accounts**.
4. Click **Generate new private key**. A JSON file downloads. Keep it secret — it
   grants full access to your project.
5. Open that JSON and copy three values into `.env`:

   | JSON field     | `.env` variable         |
   | -------------- | ----------------------- |
   | `project_id`   | `FIREBASE_PROJECT_ID`   |
   | `client_email` | `FIREBASE_CLIENT_EMAIL` |
   | `private_key`  | `FIREBASE_PRIVATE_KEY`  |

   Paste the private key **with its surrounding quotes and its literal `\n`
   sequences intact**, exactly as it appears in the JSON:

   ```env
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg...\n-----END PRIVATE KEY-----\n"
   ```

6. You do not need to create any collections by hand. Firestore creates
   `licenses`, `products`, `clients`, `admins`, `emailConfigs` and `settings` on first write.

Alternatively, keep the JSON file on disk and set
`GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/serviceAccountKey.json` instead
of the three variables above.

**Never commit the service account JSON or your `.env` file.** Both are already in
`.gitignore`.

### Recommended Firestore index

All list queries order by `createdAt` with no compound filter, which Firestore
handles with its automatic single-field index — no composite index is required.
If the console ever prompts you to create one, follow the link it gives you.

---

## Environment variables

### `.env`

One file at the project root, read by the server and by `vite build`.

| Variable                | Required | Default                 | Description                                                    |
| ----------------------- | -------- | ----------------------- | -------------------------------------------------------------- |
| `PORT`                  | no       | `5000`                  | Port the API listens on.                                        |
| `NODE_ENV`              | no       | `development`           | Set to `production` in production to suppress debug detail.     |
| `CORS_ORIGIN`           | no       | `http://localhost:5173` | Comma-separated origins allowed to call the **admin** APIs.     |
| `FIREBASE_PROJECT_ID`   | yes\*    | —                       | From the service account JSON.                                  |
| `FIREBASE_CLIENT_EMAIL` | yes\*    | —                       | From the service account JSON.                                  |
| `FIREBASE_PRIVATE_KEY`  | yes\*    | —                       | From the service account JSON, quoted, with `\n` escapes.       |
| `JWT_SECRET`            | **yes**  | —                       | Signing key for admin sessions. 16+ characters; the server refuses to start without it. |
| `TOKEN_EXPIRES_IN`      | no       | `12h`                   | Admin session lifetime (any [ms](https://github.com/vercel/ms) string). |
| `ADMIN_EMAIL`           | no       | —                       | Used by `npm run create-admin`.                                 |
| `ADMIN_PASSWORD`        | no       | —                       | Used by `npm run create-admin`. Minimum 8 characters.           |
| `ADMIN_NAME`            | no       | `Administrator`         | Display name for the admin.                                     |
| `LICENSE_KEY_PREFIX`    | no       | `OPEZ`                  | Four-character prefix for generated keys.                       |
| `SMTP_HOST`             | no       | —                       | Mail server, e.g. `smtp.gmail.com`. Blank disables server-side email. |
| `SMTP_PORT`             | no       | `587`                   | 587 for STARTTLS, 465 for implicit TLS.                         |
| `SMTP_USER`             | no       | —                       | SMTP username, usually the sending address.                     |
| `SMTP_PASS`             | no       | —                       | SMTP password. For Gmail this is an **App Password**.           |
| `SMTP_SECURE`           | no       | from port               | `true` forces implicit TLS.                                     |
| `MAIL_FROM`             | no       | `SMTP_USER`             | From address shown to recipients.                               |
| `MAIL_FROM_NAME`        | no       | `Opezee Licenses`       | From display name.                                              |

\* Or set `GOOGLE_APPLICATION_CREDENTIALS` instead.

Generate a strong `JWT_SECRET` with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

The same file also holds the one dashboard variable:

| Variable            | Default | Description                                                             |
| ------------------- | ------- | ----------------------------------------------------------------------- |
| `VITE_API_BASE_URL` | `/api`  | Only set this to point the dashboard at a different host. Same-origin by default: Express serves the build in production, and Vite proxies `/api` in development. |
| `WEB_DEV_PORT`      | `5173`  | Port for the Vite dev server.                                            |

---

## Admin console

Signing in is required for every page. An unauthenticated visit to any page
redirects to `/login`, and an expired token signs you out automatically.

| Page          | What it does                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------------- |
| **Dashboard** | Summary counts: total clients, and active / expired / total licenses.                           |
| **Licenses**  | Full license table. Create licenses; **View** opens an editable popup; clicking the **status chip** deactivates or reactivates; **Delete** confirms first. |
| **Products**  | The products you issue licenses against. Add, edit and delete.                                  |
| **Clients**   | Client accounts with the username and password they use to sign in to your product, plus their license counts. |
| **Settings**  | Dark/light mode, console logo, change login password, and email configuration.                  |

### License durations

When creating or editing a license you pick a **Start Date** and a duration:

```
1 Month · 3 Months · 6 Months · 1 Year · Custom Date
```

For the presets the expiry date is calculated from the start date and the field
becomes read-only. Choosing **Custom Date** lets you set both ends by hand, and
the expiry must be after the start date.

The calculation runs on the server — the form only previews it — so the stored
expiry can never disagree with what the admin saw.

### Reset a forgotten admin password

`npm run create-admin` is safe to re-run. If the account already exists it resets
the password instead of creating a second one:

```bash
node server/scripts/createAdmin.js admin@example.com "a new password"
```

### Console logo

The sidebar logo is stored in Firebase, not bundled into the frontend build, so
it can be replaced without a redeploy. Upload it in **Settings → Branding**:
PNG, JPEG, WebP or SVG up to 500 KB. It is held as a data URL in the
`settings/branding` Firestore document and applied everywhere immediately.

If no logo has been uploaded, the console falls back to a plain "OpEzee"
wordmark, so the header is never empty.

### Theme

The dark/light toggle lives in **Settings → Appearance**, with a shortcut icon in
the sidebar. The choice is stored per device in `localStorage` and applied before
first paint, so there is no flash on reload. First-time visitors follow their
operating system preference.

---

## Sending license emails

**Firebase cannot send email.** Firestore is a database — there is no mail
service in the Firebase credentials you already have. To email a license you
need a mail provider, and the backend talks to one over SMTP.

Without SMTP settings the app still works: the **Share** button falls back to
opening your own mail client with the details filled in. Configure SMTP and the
same button sends directly from the server instead.

### What the client receives

An HTML email with the license laid out as a table — License Key, Product,
Client, Company, Start Date, Expiry Date and a coloured Status chip — plus a
plain-text version for mail clients that block HTML. Your console logo is
included at the top when one is uploaded.

### Step by step: Gmail or Google Workspace

Google blocks ordinary passwords for SMTP, so you need an **App Password**.

1. Turn on 2-Step Verification on the Google account you want to send from:
   <https://myaccount.google.com/security>. App Passwords are unavailable
   without it.
2. Go to <https://myaccount.google.com/apppasswords>.
3. Type a name such as `Opezee Licenses` and choose **Create**.
4. Google shows a 16-character password such as `abcd efgh ijkl mnop`. Copy it.
   **You cannot view it again**, though you can always delete it and make a new one.
5. Put it in `.env` — spaces are fine, or remove them:

   ```env
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=you@yourdomain.com
   SMTP_PASS=abcdefghijklmnop
   MAIL_FROM=you@yourdomain.com
   MAIL_FROM_NAME=Opezee Licenses
   ```

6. Restart the server, then confirm the settings actually work:

   ```bash
   npm run check-mail
   ```

   It opens an SMTP connection and reports success or the exact error. Add an
   address to send a real test message:

   ```bash
   npm run check-mail you@yourdomain.com
   ```

7. Open a license in the console, click the **share** icon next to *License
   Details*, pick recipients and press **Send Email**.

A free Gmail account is limited to roughly 500 recipients a day; Google
Workspace allows about 2,000.

### Other providers

Any SMTP service works — only the four connection values change.

| Provider | `SMTP_HOST` | `SMTP_PORT` | `SMTP_USER` / `SMTP_PASS` |
| -------- | ----------- | ----------- | ------------------------- |
| Gmail / Workspace | `smtp.gmail.com` | 587 | your address / App Password |
| Outlook / Microsoft 365 | `smtp.office365.com` | 587 | your address / App Password |
| Zoho Mail | `smtp.zoho.com` | 587 | your address / App Password |
| Brevo (Sendinblue) | `smtp-relay.brevo.com` | 587 | login / SMTP key |
| SendGrid | `smtp.sendgrid.net` | 587 | literally `apikey` / your API key |
| Mailgun | `smtp.mailgun.org` | 587 | postmaster address / SMTP password |
| Amazon SES | `email-smtp.<region>.amazonaws.com` | 587 | SES SMTP credentials |

For anything beyond occasional sends, prefer a transactional provider
(SendGrid, Brevo, Mailgun, SES) over Gmail: they are built for automated mail,
so far fewer messages land in spam, and they report bounces.

### Why not the Firebase "Trigger Email" extension?

Firebase does offer an extension that sends mail when a document is written to a
collection. It is not the shorter path here:

- it requires upgrading the project to the **Blaze** pay-as-you-go plan, and
- it still needs an SMTP connection string from a mail provider — the same
  credentials as above.

So it adds billing and an extra moving part without removing the mail provider.
Sending straight from the backend keeps the credentials in one place and lets
the API report failures to the console immediately.

### Security notes

- `SMTP_PASS` lives in `.env`, which is git-ignored, and is never sent
  to the browser.
- The share endpoint is admin-only and accepts at most 10 recipients per
  request, so it cannot be used as an open relay.
- Recipient addresses are validated and normalized server-side, and client and
  product names are HTML-escaped before going into the email body.
- With no SMTP configured the endpoint answers `503 MAIL_NOT_CONFIGURED`
  rather than failing opaquely.

---

## Project structure

One project, one dependency tree, one `.env`. `client/` is the React dashboard,
`server/` is the Express API, and `npm start` serves both.

```
license-management-system/
├── package.json               The only package.json — client + server deps
├── vite.config.mjs            Vite: root=client, build -> dist, /api dev proxy
├── tailwind.config.mjs
├── render.yaml                One-service deployment blueprint
├── .env / .env.example        Shared by the server and the build
│
├── client/                    Admin dashboard (React + Vite + Tailwind)
│   ├── index.html
│   └── src/
│       ├── components/        Toast, Modal, tables, cards, forms, states
│       ├── context/
│       │   ├── AuthContext.jsx     Session state, token validation
│       │   ├── BrandingContext.jsx Logo loaded from Firestore
│       │   └── ThemeContext.jsx    Dark/light mode, persisted
│       ├── hooks/             useLicenses / useProducts / useClients
│       ├── layouts/           AdminLayout (sidebar + responsive shell)
│       ├── pages/
│       │   ├── Login.jsx
│       │   ├── Dashboard.jsx
│       │   ├── Licenses.jsx
│       │   ├── Products.jsx
│       │   ├── Clients.jsx
│       │   └── Settings.jsx
│       ├── services/
│       │   ├── api.js         Axios client, token interceptor, API modules
│       │   └── format.js      Date formatting and duration helpers
│       ├── App.jsx
│       └── main.jsx
│
├── server/                    License API (Express + Firestore)
│   ├── server.js              App, security, static dashboard, startup
│   ├── config/firebase.js     Admin SDK init from env vars
│   ├── controllers/
│   │   ├── licenseController.js    Verify/sync response shapes
│   │   ├── productController.js
│   │   ├── clientController.js
│   │   └── adminController.js      Login, password, email config
│   ├── routes/
│   │   ├── licenseRoutes.js        Public verify/sync + admin CRUD
│   │   ├── productRoutes.js
│   │   ├── clientRoutes.js
│   │   └── adminRoutes.js
│   ├── services/
│   │   ├── licenseService.js       Firestore access, derived status
│   │   ├── productService.js
│   │   ├── clientService.js        Client accounts, product login
│   │   ├── adminService.js         bcrypt, JWT, email configs
│   │   ├── mailService.js          SMTP transport, HTML license email
│   │   └── brandingService.js      Logo stored in Firestore
│   ├── middleware/
│   │   ├── auth.js                 requireAdmin bearer-token guard
│   │   ├── errorHandler.js         ApiError, 404, central handler
│   │   ├── rateLimiter.js          Admin / verify / login limiters
│   │   └── validate.js             express-validator bridge
│   ├── utils/
│   │   ├── generateLicenseKey.js   CSPRNG key generation
│   │   └── licenseDates.js         Duration -> expiry arithmetic
│   ├── scripts/
│   │   ├── createAdmin.js          Create/reset the admin account
│   │   └── checkMail.js            Verify the SMTP settings
│   └── tests/api.test.js           End-to-end API tests
│
├── scripts/dev.js             Runs the API and Vite together
├── dist/                      Build output (git-ignored)
├── example-game/              Separate demo product — not part of the service
└── README.md
```

---

## API documentation

Base URL: `http://localhost:5000/api`

All responses are JSON. Errors use the shape:

```json
{ "success": false, "message": "Human readable message", "code": "ERROR_CODE" }
```

Validation errors additionally carry `errors: [{ "field": "...", "message": "..." }]`.

### Authentication

Every endpoint except `POST /api/admin/login`, `POST /api/licenses/verify` and
`POST /api/licenses/sync` requires an admin bearer token:

```http
Authorization: Bearer <token>
```

Missing, malformed or expired tokens return `401`.

#### Sign in

```http
POST /api/admin/login
```

```json
{ "email": "admin@example.com", "password": "your password" }
```

`200 OK`:

```json
{
  "success": true,
  "message": "Signed in successfully",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "admin": { "id": "…", "email": "admin@example.com", "name": "Administrator" }
}
```

Wrong email and wrong password both return the same `401` with
`"Invalid email or password"`, so the endpoint does not reveal which addresses
exist. Limited to 10 failed attempts per 15 minutes per IP.

#### Other admin endpoints

| Method   | Path                              | Purpose                                     |
| -------- | --------------------------------- | ------------------------------------------- |
| `GET`    | `/api/admin/me`                   | Confirm the current token and identify the admin. |
| `POST`   | `/api/admin/change-password`      | `{ currentPassword, newPassword, confirmPassword }` |
| `GET`    | `/api/admin/emails`               | List configured email IDs.                  |
| `POST`   | `/api/admin/emails`               | `{ email, label? }` — the first one added becomes the default. |
| `PUT`    | `/api/admin/emails/:id/default`   | Make this the default; clears the previous one. |
| `DELETE` | `/api/admin/emails/:id`           | Remove an email. The default cannot be removed while others exist. |
| `GET`    | `/api/admin/branding`             | The console logo. **Public** — no token needed. |
| `PUT`    | `/api/admin/branding`             | `{ logo, fileName? }` where `logo` is an image data URL. |
| `DELETE` | `/api/admin/branding`             | Clear the logo and fall back to the text wordmark. |

### Licenses (admin)

Restricted by `CORS_ORIGIN` and limited to 300 requests per 15 minutes per IP.

#### Create a license

```http
POST /api/licenses
```

```json
{
  "clientUserId": "john.doe",
  "productName": "My Product",
  "soldBy": "Alex Seller",
  "duration": "1_year",
  "startDate": "2026-09-23"
}
```

`clientUserId` is the username of a client account. The client's name and
company come from that account, so they are not sent and cannot drift. For a
user ID with no account, pass `clientName` and `companyName` explicitly instead.

`duration` is one of `1_month`, `3_months`, `6_months`, `1_year`, `custom`.
Only `custom` accepts (and requires) an `expiryDate`; for the presets it is
computed from `startDate` and anything sent is ignored.

`201 Created`:

```json
{
  "success": true,
  "message": "License created successfully",
  "license": {
    "id": "8Kd0a1Xq…",
    "licenseKey": "OPEZ-8F4K-92LM-X7PQ",
    "clientName": "John Doe",
    "companyName": "ABC Pvt Ltd",
    "clientUserId": "john.doe",
    "productName": "My Product",
    "soldBy": "Alex Seller",
    "duration": "1_year",
    "createdAt": "2026-09-23T10:14:02.183Z",
    "updatedAt": "2026-09-23T10:14:02.183Z",
    "startDate": "2026-09-23T00:00:00.000Z",
    "expiryDate": "2027-09-23T23:59:59.999Z",
    "status": "active"
  }
}
```

#### The rest

| Method   | Path                     | Purpose                                                   |
| -------- | ------------------------ | --------------------------------------------------------- |
| `GET`    | `/api/licenses`          | All licenses, newest first.                               |
| `GET`    | `/api/licenses/stats`    | `totalClients`, `activeLicenses`, `pendingLicenses`, `expiredLicenses`, `totalLicenses`. |
| `GET`    | `/api/licenses/clients`  | Licenses grouped by client user ID.                       |
| `GET`    | `/api/licenses/:id`      | One license.                                              |
| `PUT`    | `/api/licenses/:id`      | Update any field except the key. Changing `duration` or `startDate` recomputes the expiry. |
| `PUT`    | `/api/licenses/:id/status` | `{ deactivated: true | false }` — switch the license off or back on. |
| `DELETE` | `/api/licenses/:id`      | Delete. The key stops verifying immediately.              |
| `GET`    | `/api/licenses/mail-status` | `{ configured }` — whether the server can send email.  |
| `POST`   | `/api/licenses/:id/share` | `{ recipients: [email] }` — email the license. `503` if SMTP is unset. |

**The license key cannot be changed** — it is ignored if sent to `PUT`.

### Products (admin)

| Method   | Path                 | Body                        | Notes                                              |
| -------- | -------------------- | --------------------------- | -------------------------------------------------- |
| `GET`    | `/api/products`      | —                           | All products, newest first.                        |
| `POST`   | `/api/products`      | `{ name, description? }`    | `409` if the name is already taken (case-insensitive). |
| `GET`    | `/api/products/:id`  | —                           |                                                    |
| `PUT`    | `/api/products/:id`  | `{ name?, description? }`   |                                                    |
| `DELETE` | `/api/products/:id`  | —                           | `409` if licenses still reference this product.    |

---

### Client accounts (admin)

Clients are the people who sign in to **your** product. Adding one here creates
the credentials they will use.

| Method   | Path                | Body                                                   |
| -------- | ------------------- | ------------------------------------------------------ |
| `GET`    | `/api/clients`      | Client accounts merged with their license counts.      |
| `POST`   | `/api/clients`      | `{ clientName, companyName, username, password }`       |
| `GET`    | `/api/clients/:id`  |                                                        |
| `PUT`    | `/api/clients/:id`  | Any field. Omit `password` to leave it unchanged.      |
| `DELETE` | `/api/clients/:id`  | `409` if licenses still reference this client.         |

Usernames are unique and compared case-insensitively. Passwords are hashed with
bcrypt and never returned by any endpoint.

`GET /api/clients` also returns user IDs that appear only on a license and have
no account yet, marked `hasLogin: false`, so nothing is hidden and credentials
can be added for them later.

---

### Client login endpoint (public)

```http
POST /api/clients/login
```

The endpoint your product's own login screen calls. No admin token, open CORS,
limited to 30 failed attempts per 15 minutes per IP.

```json
{
  "username": "john.doe",
  "password": "their password",
  "productName": "My Product"
}
```

`productName` is optional; when present, only that product's licenses come back.

`200 OK`:

```json
{
  "success": true,
  "valid": true,
  "message": "Login successful",
  "client": {
    "id": "8Kd0a1Xq…",
    "clientName": "John Doe",
    "companyName": "ABC Pvt Ltd",
    "username": "john.doe"
  },
  "licenses": [
    {
      "licenseKey": "OPEZ-8F4K-92LM-X7PQ",
      "productName": "My Product",
      "startDate": "2026-09-23T00:00:00.000Z",
      "expiryDate": "2027-09-23T23:59:59.999Z",
      "status": "active",
      "valid": true
    }
  ],
  "hasValidLicense": true
}
```

Bad username and bad password both return the same `401`, so the endpoint does
not reveal which usernames exist:

```json
{ "success": false, "message": "Invalid username or password", "code": "INVALID_CREDENTIALS" }
```

Because the response already carries the licenses and `hasValidLicense`, a
product can sign the user in and decide what they may access in one call — then
use `/api/licenses/sync` hourly to notice changes.

---

### Verification endpoint (public)

```http
POST /api/licenses/verify
```

The endpoint your product calls when the user enters their key. It accepts
requests from any origin, needs no token, and is rate limited to **20 requests per
minute per IP**.

Request:

```json
{
  "licenseKey": "OPEZ-8F4K-92LM-X7PQ",
  "productName": "My Product"
}
```

`productName` is optional. When present, the license must have been issued for
that exact product (compared case-insensitively).

Keys are normalized before lookup, so `opez 8f4k 92lm x7pq` and
`OPEZ-8F4K-92LM-X7PQ` both work.

The backend checks, in order: the key exists, it belongs to the requested
product, the start date has been reached, and the expiry date has not passed.

#### Valid license — `200 OK`

```json
{
  "success": true,
  "valid": true,
  "message": "License is valid",
  "license": {
    "licenseKey": "OPEZ-8F4K-92LM-X7PQ",
    "clientName": "John Doe",
    "companyName": "ABC Pvt Ltd",
    "productName": "My Product",
    "startDate": "2026-09-23T00:00:00.000Z",
    "expiryDate": "2027-09-23T23:59:59.999Z",
    "status": "active"
  }
}
```

#### Unknown license key — `404 Not Found`

```json
{
  "success": false,
  "valid": false,
  "message": "Invalid license key"
}
```

#### Expired license — `200 OK`

```json
{
  "success": true,
  "valid": false,
  "message": "License has expired",
  "license": {
    "licenseKey": "OPEZ-8F4K-92LM-X7PQ",
    "productName": "My Product",
    "startDate": "2025-09-23T00:00:00.000Z",
    "expiryDate": "2026-09-23T23:59:59.999Z",
    "status": "expired"
  }
}
```

#### Deactivated — `200 OK`

A license an admin has switched off. Its dates are untouched, but it does not
verify until it is reactivated:

```json
{
  "success": true,
  "valid": false,
  "message": "License has been deactivated",
  "license": {
    "licenseKey": "OPEZ-8F4K-92LM-X7PQ",
    "productName": "My Product",
    "startDate": "2026-09-23T00:00:00.000Z",
    "expiryDate": "2027-09-23T23:59:59.999Z",
    "status": "deactivated"
  }
}
```

#### Not started yet — `200 OK`

A license whose start date is in the future is not usable yet:

```json
{
  "success": true,
  "valid": false,
  "message": "License has not started yet",
  "license": {
    "licenseKey": "OPEZ-8F4K-92LM-X7PQ",
    "productName": "My Product",
    "startDate": "2027-01-01T00:00:00.000Z",
    "expiryDate": "2027-04-01T23:59:59.999Z",
    "status": "pending"
  }
}
```

#### Wrong product — `403 Forbidden`

```json
{
  "success": false,
  "valid": false,
  "message": "License is not valid for this product"
}
```

This stops a key issued for Product A being used in Product B.

#### Malformed request — `400`, rate limited — `429`

```json
{
  "success": false,
  "valid": false,
  "message": "Too many verification attempts. Please try again in a minute."
}
```

---

### Synchronization endpoint (public)

```http
POST /api/licenses/sync
```

Same checks as `/verify`, in a flat shape meant for periodic polling. **Your
product owns the interval** — call it hourly from the client application. There is
no server-side timer, and the backend never calls out to your product.

Request:

```json
{
  "licenseKey": "OPEZ-8F4K-92LM-X7PQ",
  "productName": "My Product"
}
```

`200 OK`:

```json
{
  "success": true,
  "valid": true,
  "status": "active",
  "message": "License is valid",
  "licenseKey": "OPEZ-8F4K-92LM-X7PQ",
  "productName": "My Product",
  "startDate": "2026-09-23T00:00:00.000Z",
  "expiryDate": "2027-09-23T23:59:59.999Z",
  "checkedAt": "2026-09-23T10:00:00.000Z"
}
```

`status` is `active`, `pending` or `expired`. An unknown key returns `404` and a
product mismatch `403`, both with `"status": "invalid"` and a `checkedAt`.

Every call re-reads Firestore, so revoking or extending a license in the dashboard
takes effect on the client's next sync.

### Example requests

```bash
# Sign in and capture the token
curl -X POST http://localhost:5000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"your password"}'

# Create a license (admin)
curl -X POST http://localhost:5000/api/licenses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"clientUserId":"john.doe","productName":"My Product","soldBy":"Alex Seller","duration":"1_year","startDate":"2026-09-23"}'

# Verify (public — this is what your product calls)
curl -X POST http://localhost:5000/api/licenses/verify \
  -H "Content-Type: application/json" \
  -d '{"licenseKey":"OPEZ-8F4K-92LM-X7PQ","productName":"My Product"}'

# Hourly sync (public)
curl -X POST http://localhost:5000/api/licenses/sync \
  -H "Content-Type: application/json" \
  -d '{"licenseKey":"OPEZ-8F4K-92LM-X7PQ","productName":"My Product"}'
```

---

## Integrating your product

Your product calls exactly three endpoints. None of them needs an admin token,
all three accept requests from any origin, and your product never touches
Firebase.

| # | Purpose | Endpoint |
| - | ------- | -------- |
| 1 | Check a key is valid | `POST /api/licenses/verify` |
| 2 | Re-check hourly | `POST /api/licenses/sync` |
| 3 | Check login credentials | `POST /api/clients/login` |

Base URL in development is `http://localhost:5000/api`.

**Read `valid`, never the HTTP status alone.** An expired or deactivated license
answers `200` with `"valid": false`.

---

### 1. Check a key is valid

```http
POST /api/licenses/verify
```

```json
{ "licenseKey": "OPEZ-WV5R-K9AE-622V", "productName": "Invoice Pro" }
```

`productName` is optional but recommended — it stops a key issued for one
product being used in another. Keys are normalized, so
`opez wv5r k9ae 622v` works as well as the canonical form.

Valid — `200`:

```json
{
  "success": true,
  "valid": true,
  "message": "License is valid",
  "license": {
    "licenseKey": "OPEZ-WV5R-K9AE-622V",
    "clientName": "Priya Sharma",
    "companyName": "Nimbus Retail Group",
    "productName": "Invoice Pro",
    "startDate": "2026-09-23T00:00:00.000Z",
    "expiryDate": "2028-03-31T23:59:59.999Z",
    "status": "active"
  }
}
```

Every other outcome:

| Situation | HTTP | `valid` | `message` |
| --------- | ---- | ------- | --------- |
| Key does not exist | `404` | `false` | Invalid license key |
| Wrong product | `403` | `false` | License is not valid for this product |
| Expired | `200` | `false` | License has expired |
| Deactivated by an admin | `200` | `false` | License has been deactivated |
| Start date still in the future | `200` | `false` | License has not started yet |
| Rate limited | `429` | `false` | Too many verification attempts… |

The expired, deactivated and not-started responses still include the `license`
object with `status` and `expiryDate`, so your product can tell the user exactly
when their access lapsed.

Rate limit: **20 requests per minute per IP.**

---

### 2. Re-check hourly (auto-sync)

```http
POST /api/licenses/sync
```

Same request body and the same checks as `/verify`, in a flatter shape meant for
polling:

```json
{
  "success": true,
  "valid": true,
  "status": "active",
  "message": "License is valid",
  "licenseKey": "OPEZ-WV5R-K9AE-622V",
  "productName": "Invoice Pro",
  "startDate": "2026-09-23T00:00:00.000Z",
  "expiryDate": "2028-03-31T23:59:59.999Z",
  "checkedAt": "2026-09-23T11:03:04.128Z"
}
```

`status` is `active`, `expired`, `pending` or `deactivated`. An unknown key
(`404`) and a product mismatch (`403`) both return `"status": "invalid"` with a
`checkedAt`.

Every call re-reads Firestore, so revoking, extending or deactivating a license
in the dashboard takes effect on the client's next sync.

**Your product owns the interval.** There is no server-side timer and the
backend never calls out to your product — run the hourly loop in the client
application. An hourly poll is far below the 20/min limit this endpoint shares
with `/verify`.

---

### 3. Check login credentials

```http
POST /api/clients/login
```

```json
{ "username": "priya.sharma", "password": "their password", "productName": "Invoice Pro" }
```

Usernames are compared case-insensitively. `productName` is optional; when
present, only that product's licenses are returned.

Correct credentials — `200`:

```json
{
  "success": true,
  "valid": true,
  "message": "Login successful",
  "client": {
    "id": "i9EDQROz2gg4R3T3TEun",
    "clientName": "Priya Sharma",
    "companyName": "Nimbus Retail Group",
    "username": "priya.sharma"
  },
  "licenses": [
    {
      "licenseKey": "OPEZ-WV5R-K9AE-622V",
      "productName": "Invoice Pro",
      "startDate": "2026-09-23T00:00:00.000Z",
      "expiryDate": "2028-03-31T23:59:59.999Z",
      "status": "active",
      "valid": true
    }
  ],
  "hasValidLicense": true
}
```

A wrong password and an unknown username both return the same `401`, so the
endpoint cannot be used to discover which usernames exist:

```json
{ "success": false, "message": "Invalid username or password", "code": "INVALID_CREDENTIALS" }
```

Rate limit: **30 failed attempts per 15 minutes per IP** — successful logins do
not count against it.

Because the response already carries the licenses and `hasValidLicense`, **login
and the license check are a single call**. You do not need `/verify` after a
successful login.

---

### Putting it together

```js
const API = 'https://licenses.yourdomain.com/api'
const PRODUCT = 'Invoice Pro'

const post = async (path, body) => {
  const res = await fetch(`${API}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  // 401/403/404 still carry a useful JSON body, so never throw on status alone.
  return res.json()
}

// --- login screen ---------------------------------------------------------
export async function signIn(username, password) {
  const data = await post('clients/login', { username, password, productName: PRODUCT })
  if (!data.valid) return { ok: false, reason: data.message }          // bad credentials
  if (!data.hasValidLicense) return { ok: false, reason: 'No active license' }
  return { ok: true, client: data.client, license: data.licenses[0] }
}

// --- hourly re-check ------------------------------------------------------
export function startLicenseSync(licenseKey, onChange) {
  const check = async () => {
    try {
      onChange(await post('licenses/sync', { licenseKey, productName: PRODUCT }))
    } catch {
      // Network failure: keep the last known state rather than locking the user out.
    }
  }
  check()
  return setInterval(check, 60 * 60 * 1000)
}

// --- only needed if a user types a key instead of logging in --------------
export async function verifyKey(licenseKey) {
  const data = await post('licenses/verify', { licenseKey, productName: PRODUCT })
  return { ok: data.valid, reason: data.message, expiresOn: data.license?.expiryDate }
}
```

Notes for your product:

- Treat `valid === true` as the only pass condition. Do not infer validity from
  the HTTP status alone.
- Run these checks on the server side of your product where you can, so they
  cannot be patched out in a client.
- On a network failure, keep the last known good state for a grace period rather
  than locking the user out — but do not cache a success indefinitely.

---

## Security

- **Admin authentication.** Passwords are hashed with bcrypt (12 rounds) and never
  stored or returned in plain text. Sign-in issues a signed JWT; every admin
  endpoint requires it, and the frontend validates a stored token against the
  backend on load rather than trusting it.
- **Credentials stay on the server.** The Firebase Admin SDK runs only in the
  backend. The React app talks to Express, never to Firestore. No key or service
  account value is ever sent to a browser or to your product.
- **Input validation and sanitization** on every endpoint via `express-validator`,
  including email normalization, length caps and a character allowlist on license
  keys.
- **Helmet** sets standard security headers.
- **CORS**: admin APIs accept only the origins in `CORS_ORIGIN`; `/verify` and
  `/sync` are deliberately open because products call them from anywhere.
- **Rate limiting**: 300 requests / 15 min per IP for admin APIs, 20 / min per IP
  for verification and sync, and 10 failed sign-ins / 15 min per IP.
- **Centralized error handling**: internal failures are logged server-side and
  answered with a generic message. Stack traces and raw Firestore errors are never
  returned. `NODE_ENV=production` suppresses even debug hints.
- **Minimal disclosure**: verification responses omit the document id, the client
  user ID and internal timestamps.
- **Key strength**: keys are 12 random characters from a 30-symbol alphabet
  (~2.4 × 10^17 combinations) drawn from `crypto.randomBytes` with rejection
  sampling, then checked against Firestore for collisions before use. The alphabet
  excludes `I`, `L`, `O`, `U`, `0` and `1` so keys survive being read aloud or
  retyped.
- `.env` files and service account JSON are git-ignored.

---

## Deploying to Render

The dashboard and the API are **one web service**. Express serves the built React
app, so there is no separate static site and no CORS between them — the dashboard
calls `/api` on its own origin.

### What runs

| Step | Command | What it does |
| ---- | ------- | ------------ |
| Build | `npm ci && npm run build` | Installs once, then `vite build` -> `dist/` |
| Start | `npm start` | `node server/server.js` — serves the API **and** `dist/` |

Both come from the single root `package.json`.

### Setting it up

1. Push the repository to GitHub.
2. In Render: **New → Blueprint** and point it at the repo. Render reads
   [`render.yaml`](render.yaml) and fills in the build command, start command
   and health check (`/health`). **New → Web Service** works too — set the two
   commands from the table above by hand.
3. Add the secrets under **Environment**. They are the same names as
   [`.env.example`](.env.example):

   | Variable | Required | Notes |
   | -------- | -------- | ----- |
   | `JWT_SECRET` | yes | 16+ characters. `render.yaml` generates one. |
   | `FIREBASE_PROJECT_ID` | yes | From the service account JSON |
   | `FIREBASE_CLIENT_EMAIL` | yes | From the service account JSON |
   | `FIREBASE_PRIVATE_KEY` | yes | Paste the whole key **including** its `
` escapes |
   | `CORS_ORIGIN` | only if another site calls the admin API | The dashboard does not need it |
   | `SMTP_*`, `MAIL_FROM` | only for sending licence emails | Leave unset to disable sending |

   `PORT` is set by Render automatically — do not add it.

4. Deploy, then create the admin login once from Render's **Shell** tab:

   ```bash
   npm run create-admin
   ```

### Notes

- **Vite, Tailwind and PostCSS are in `dependencies`, not `devDependencies`**,
  because `NODE_ENV=production` makes npm skip dev dependencies — the build
  would fail without them. `nodemon` is the only dev dependency.
- `dist/` is git-ignored and built on Render at deploy time, so the repository
  never carries a stale bundle.
- The dashboard requests a relative `/api`, so nothing needs configuring per
  environment. Set `VITE_API_BASE_URL` only to point it at a different host.
- If `dist/` is missing the server still starts and serves the API alone, which
  is what happens during `npm run dev`.
- The demo game in `example-game/` is **not** part of this service. Deploy it
  separately if you want it hosted, and point its `VITE_LICENSE_API` at
  `https://<your-service>.onrender.com/api`.
- On Render's free plan the service sleeps when idle; the first request after
  that takes a few seconds while it wakes.

---

## Tests

The backend ships with an end-to-end suite that runs the real Express app, routes,
validators and service layer against an in-memory Firestore stand-in. It needs no
credentials and no network access:

```bash
npm test
```

147 checks covering authentication and route protection, product CRUD and the
in-use delete guard, all five license durations and their month arithmetic,
derived status, deactivation and reactivation, every verify and sync outcome, key format and normalization,
client accounts and product login, client grouping, password changes, email-configuration defaulting rules, CORS
policy, logo upload validation, email share validation, rate limiting and error response shapes.

---

## Data model

### `licenses`

| Field          | Type               | Notes                                     |
| -------------- | ------------------ | ----------------------------------------- |
| `licenseKey`   | string             | `OPEZ-8F4K-92LM-X7PQ`, unique, immutable   |
| `clientName`   | string             | Fallback only — the client account wins when one exists |
| `companyName`  | string             | Fallback only — the client account wins when one exists |
| `clientUserId` | string             | The client account's username; links the two   |
| `productName`  | string             | Checked during verification                |
| `soldBy`       | string             | Who sold the license; admin-only, never returned by /verify or /sync |
| `duration`     | string             | `1_month` … `1_year`, or `custom`          |
| `startDate`    | Firebase Timestamp | Start of day, UTC                          |
| `expiryDate`   | Firebase Timestamp | End of day, UTC                            |
| `createdAt`    | Firebase Timestamp |                                            |
| `updatedAt`    | Firebase Timestamp |                                            |
| `deactivated`  | boolean            | Set by an admin from the Licenses page     |
| `status`       | string             | Convenience copy only — see below          |

Other collections: **`products`** (`name`, `description`), **`admins`**
(`email`, `passwordHash`, `name`), **`emailConfigs`** (`email`, `label`,
`isDefault`) and **`settings/branding`** (`logo` data URL, `mimeType`,
`fileName`).

**Status is always derived, never trusted.** A document written a year ago would
still claim `"active"`, so the API recomputes it on every read:

```
deactivated                   -> deactivated   (overrides the dates)
now < startDate               -> pending
startDate <= now < expiryDate -> active
now >= expiryDate             -> expired
```

The stored `status` field exists only for convenience when browsing Firestore
directly; nothing reads it as truth.

Periods are stored as whole UTC days — start of day for `startDate`, end of day
for `expiryDate` — so a license issued through 23 Sep 2027 stays valid for all of
that day. The UI renders dates in UTC for the same reason.

### Backward compatibility

Licenses created before start dates existed are read with fallbacks:
`startDate` falls back to `createdAt`, `clientUserId` falls back to the old
`clientEmail` field, `clientName`/`companyName` fall back to the values stored
on the license when the user ID has no account, and `soldBy` reads as an empty string (shown as “—” in the
table). Existing documents keep working with no migration, though editing one
now requires filling in **Sold By**.

---

## Future extensions

The layering — routes (validation) → controller (HTTP shape) → service
(business rules and Firestore) — is designed to absorb these without rework:

- **Multiple products per license**: change `productName` to a `products` array
  and adjust the match in `licenseService.checkLicense`.
- **Activation limits and device binding**: add `maxActivations` and an
  `activations` subcollection keyed by hardware/device ID; check the count in
  `checkLicense`, which both `/verify` and `/sync` already route through.
- **Verification logs and usage history**: write to a `verifications` collection
  from `checkLicense` — the single choke point every check passes through.
- **Multiple admin users and roles**: the `admins` collection and the JWT payload
  already carry a `role`; extend `requireAdmin` to check it.
- **Sending email**: `emailConfigs` already stores the addresses and the default;
  wire a mail provider to the default address.
