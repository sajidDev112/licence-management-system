'use strict';

// One .env at the project root serves both the API and the dashboard build.
// Resolved against this file so the start command's working directory does not
// matter.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');

const { initFirebase } = require('./config/firebase');
const licenseRoutes = require('./routes/licenseRoutes');
const productRoutes = require('./routes/productRoutes');
const clientRoutes = require('./routes/clientRoutes');
const adminRoutes = require('./routes/adminRoutes');
const { adminLimiter } = require('./middleware/rateLimiter');
const { ApiError, notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 5000;

// Rate limiters read req.ip; behind a proxy that must come from X-Forwarded-For.
app.set('trust proxy', 1);

// The dashboard is served from this same server in production, so the default
// policy is relaxed exactly where that build needs it: the inline theme script
// in index.html, Google Fonts, and logos stored as data URLs.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
      },
    },
    // Fonts and images are loaded cross-origin by the built dashboard.
    crossOriginEmbedderPolicy: false,
  })
);

// A logo upload is a base64 image and legitimately exceeds the request size
// every other endpoint needs, so it gets its own parser rather than raising
// the limit everywhere.
const BRANDING_PATH = '/api/admin/branding';
const parseJson = express.json({ limit: '100kb' });
const parseLogoJson = express.json({ limit: '1mb' });
app.use((req, res, next) =>
  req.path === BRANDING_PATH ? parseLogoJson(req, res, next) : parseJson(req, res, next)
);
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// The admin dashboard is restricted to configured origins. The product-facing
// endpoints are public by design — products call them from anywhere.
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const PUBLIC_PATHS = ['/licenses/verify', '/licenses/sync', '/clients/login'];

const adminCors = cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new ApiError(403, 'Origin not allowed', 'CORS_NOT_ALLOWED'));
  },
  credentials: true,
});

const publicCors = cors({ origin: '*' });

const isPublic = (req) => PUBLIC_PATHS.includes(req.path);

/** Applies admin-only middleware to everything under /api except public paths. */
const exceptPublic = (middleware) => (req, res, next) =>
  isPublic(req) ? next() : middleware(req, res, next);

app.use('/api', (req, res, next) => (isPublic(req) ? publicCors(req, res, next) : next()));
app.use('/api', exceptPublic(adminCors), exceptPublic(adminLimiter));

app.get('/health', (req, res) =>
  res.json({ success: true, status: 'ok', timestamp: new Date().toISOString() })
);

// Authentication is enforced inside each router, so that the public license
// endpoints can sit alongside the admin ones under the same prefix.
app.use('/api/admin', adminRoutes);
app.use('/api/licenses', licenseRoutes);
app.use('/api/products', productRoutes);
app.use('/api/clients', clientRoutes);

// --- Dashboard (single-service deployment) -----------------------------------
// One Render service runs the API and the built dashboard together. When the
// build is absent — before the first `npm run build`, or while developing with
// `npm run dev` — this is skipped and the server stays API-only.
const CLIENT_DIST = path.resolve(__dirname, '..', 'dist');
const hasClientBuild = fs.existsSync(path.join(CLIENT_DIST, 'index.html'));

if (hasClientBuild) {
  // Hashed asset filenames can be cached hard; index.html must never be, or
  // browsers keep serving the previous deploy's script tags.
  app.use(
    express.static(CLIENT_DIST, {
      index: false,
      maxAge: '1y',
      setHeaders(res, filePath) {
        if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
      },
    })
  );

  // Client-side routing: anything that is not an API call or a real file is
  // the dashboard itself. /api and /health fall through to the 404 handler.
  app.get(/^\/(?!api\/|health$).*/, (req, res) =>
    res.sendFile(path.join(CLIENT_DIST, 'index.html'))
  );
}

app.use(notFound);
app.use(errorHandler);

function checkAuthConfig() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    console.error('\n[startup] JWT_SECRET is missing or too short (needs 16+ characters).');
    console.error('[startup] Add it to .env — see .env.example.\n');
    process.exit(1);
  }
}

function start() {
  checkAuthConfig();

  try {
    initFirebase();
  } catch (err) {
    console.error('\n[startup] Firebase initialization failed:', err.message);
    console.error('[startup] Copy .env.example to .env and fill in your credentials.\n');
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`License API listening on http://localhost:${PORT}`);
    console.log(`Allowed admin origins: ${allowedOrigins.join(', ')}`);
    console.log(
      'Public endpoints: POST /api/licenses/verify, POST /api/licenses/sync, POST /api/clients/login'
    );
  });
}

if (require.main === module) start();

module.exports = app;
