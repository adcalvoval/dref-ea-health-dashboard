import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function getToken() {
  for (const dir of [__dirname, join(__dirname, '..')]) {
    try {
      const text = readFileSync(join(dir, '.env'), 'utf8');
      const m = text.match(/^IFRC_TOKEN=(.+)$/m);
      if (m) return m[1].trim().replace(/^['"]|['"]$/g, '');
    } catch {}
  }
  return process.env.IFRC_TOKEN ?? '';
}

const TOKEN = getToken();

function apiFetch(url) {
  return fetch(url, { headers: { Authorization: `Token ${TOKEN}` } }).then(r => {
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.json();
  });
}

function sendJSON(res, data) {
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

function sendError(res, err) {
  console.error('[api]', err.message);
  res.statusCode = 500;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error: err.message }));
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'api-dev',
      configureServer(server) {
        server.middlewares.use('/api/dref3', (_req, res) => {
          apiFetch('https://goadmin.ifrc.org/api/v2/dref3/')
            .then(data => sendJSON(res, data))
            .catch(err => sendError(res, err));
        });

        server.middlewares.use('/api/appeals', (_req, res) => {
          const pages = [];
          function next(url) {
            if (!url) return Promise.resolve(pages.flat());
            return apiFetch(url).then(data => {
              pages.push(data.results ?? []);
              return next(data.next ?? null);
            });
          }
          next('https://goadmin.ifrc.org/api/v2/appeal/?limit=500&atype=1&ordering=-start_date')
            .then(all => sendJSON(res, all))
            .catch(err => sendError(res, err));
        });
      },
    },
  ],
});
