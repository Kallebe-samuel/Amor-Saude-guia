const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const hpp = require('hpp');
const xss = require('xss-clean');
const dotenv = require('dotenv');
const path = require('path');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const { Server } = require('socket.io');

dotenv.config();

const authRoutes = require('./src/routes/auth');
const userRoutes = require('./src/routes/users');
const executanteRoutes = require('./src/routes/executantes');
const guiaRoutes = require('./src/routes/guias');
const procedimentoRoutes = require('./src/routes/procedimentos');
const { ensureDefaultData } = require('./src/bootstrap/defaultData');

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});
app.locals.io = io;

io.on('connection', () => {});

// Helmet com CSP customizada para permitir recursos do CDN (jsPDF)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com', 'https://cdn.jsdelivr.net', 'https://unpkg.com'],
      scriptSrcElem: ["'self'", 'https://cdnjs.cloudflare.com', 'https://cdn.jsdelivr.net', 'https://unpkg.com'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'", 'https://cdnjs.cloudflare.com', 'https://cdn.jsdelivr.net', 'https://unpkg.com'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"]
    }
  }
}));
app.use(cors());
app.use(hpp());
app.use(xss());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/executantes', executanteRoutes);
app.use('/api/guias', guiaRoutes);
app.use('/api/procedimentos', procedimentoRoutes);

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use(express.static(path.join(__dirname, 'public')));

const PORT = Number(process.env.PORT) || 3002;
const HOST = process.env.HOST || '0.0.0.0';
const MONGO = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/amor_saude';

function parseBool(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function startSelfPing() {
  const enabled = parseBool(process.env.SELF_PING_ENABLED, false);
  if (!enabled) return;

  const baseUrl = process.env.SELF_PING_URL || process.env.RENDER_EXTERNAL_URL || '';
  if (!baseUrl) {
    console.warn('[self-ping] habilitado, mas SELF_PING_URL/RENDER_EXTERNAL_URL não foi definido.');
    return;
  }

  const pingPath = process.env.SELF_PING_PATH || '/health';
  const pingIntervalMinutes = Math.max(1, Number(process.env.SELF_PING_INTERVAL_MINUTES) || 13);
  const timeoutMs = Math.max(1000, Number(process.env.SELF_PING_TIMEOUT_MS) || 8000);

  let target;
  try {
    const parsedBase = new URL(baseUrl);
    target = new URL(pingPath, parsedBase);
  } catch (err) {
    console.warn('[self-ping] URL inválida:', err.message || err);
    return;
  }

  const client = target.protocol === 'https:' ? https : http;

  const runPing = () => {
    const req = client.get(target, {
      timeout: timeoutMs,
      headers: {
        'User-Agent': 'amor-saude-self-ping/1.0'
      }
    }, (res) => {
      res.resume();
      console.log(`[self-ping] ${target.href} -> ${res.statusCode}`);
    });

    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (err) => {
      console.warn('[self-ping] erro:', err.message || err);
    });
  };

  runPing();
  setInterval(runPing, pingIntervalMinutes * 60 * 1000);
  console.log(`[self-ping] ativo a cada ${pingIntervalMinutes} min em ${target.href}`);
}

mongoose.connect(MONGO, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(async () => {
    console.log('MongoDB conectado');
    try {
      await ensureDefaultData();
      console.log('Catálogo padrão verificado');
    } catch (seedErr) {
      console.error('Falha ao verificar catálogo padrão:', seedErr.message || seedErr);
    }
    const server = httpServer.listen(PORT, HOST, () => {
      console.log(`Server rodando em http://${HOST}:${PORT}`);
      startSelfPing();
    });
    server.on('error', (err) => {
      console.error('Erro no servidor:', err.message || err);
      process.exit(1);
    });
  })
  .catch(err => {
    console.error('Erro conectando ao MongoDB', err.message || err);
  });
