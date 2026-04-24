import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  // Load .env from this directory first, then fall back to the parent (Webapps root)
  const envLocal  = loadEnv(mode, process.cwd(), '');
  const envParent = loadEnv(mode, path.resolve(process.cwd(), '..'), '');
  const env = { ...envParent, ...envLocal };

  const TOKEN = env.IFRC_TOKEN || process.env.IFRC_TOKEN;

  return {
    plugins: [
      react(),
      {
        name: 'api-dev',
        configureServer(server) {
          server.middlewares.use('/api/dref3', async (_req, res) => {
            try {
              const r = await fetch('https://goadmin.ifrc.org/api/v2/dref3/', {
                headers: { Authorization: `Token ${TOKEN}` },
              });
              const data = await r.json();
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(data));
            } catch (e) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: e.message }));
            }
          });

          server.middlewares.use('/api/appeals', async (_req, res) => {
            try {
              let all = [];
              let url = 'https://goadmin.ifrc.org/api/v2/appeal/?limit=500&atype=1&ordering=-start_date';
              while (url) {
                const r = await fetch(url, {
                  headers: { Authorization: `Token ${TOKEN}` },
                });
                const data = await r.json();
                all.push(...(data.results || []));
                url = data.next || null;
              }
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(all));
            } catch (e) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: e.message }));
            }
          });
        },
      },
    ],
  };
});
