import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route for OneSignal Proxy
  app.post('/api/notifications/send', async (req, res) => {
    const { oneSignalId, title, body, url, include_subscription_ids } = req.body;
    
    const ONESIGNAL_APP_ID = process.env.VITE_ONESIGNAL_APP_ID;
    const ONESIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY || process.env.VITE_ONESIGNAL_REST_API_KEY;

    if (!ONESIGNAL_REST_API_KEY) {
      console.error('SERVER ERROR: OneSignal REST API Key is missing in environment variables');
      return res.status(500).json({ error: 'OneSignal REST API Key not configured on server' });
    }

    try {
      console.log(`Sending OneSignal notification to: ${include_subscription_ids || oneSignalId}`);
      const response = await fetch('https://onesignal.com/api/v1/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${ONESIGNAL_REST_API_KEY}`
        },
        body: JSON.stringify({
          app_id: ONESIGNAL_APP_ID,
          include_subscription_ids: include_subscription_ids || (oneSignalId ? [oneSignalId] : undefined),
          headings: { en: title, vi: title },
          contents: { en: body, vi: body },
          url: url || '/',
          web_push_topic: 'order-update'
        })
      });

      const data = await response.json();
      console.log('OneSignal Response:', JSON.stringify(data));
      res.status(response.status).json(data);
    } catch (error) {
      console.error('Proxy Notification Error:', error);
      res.status(500).json({ error: 'Failed to send notification via OneSignal' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
