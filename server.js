const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const hpp = require('hpp');
const xss = require('xss-clean');
const dotenv = require('dotenv');
const path = require('path');
const http = require('http');
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

app.use(express.static(path.join(__dirname, 'public')));

const PORT = Number(process.env.PORT) || 3002;
const HOST = process.env.HOST || '0.0.0.0';
const MONGO = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/amor_saude';

mongoose.connect(MONGO, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(async () => {
    console.log('MongoDB conectado');
    try {
      await ensureDefaultData();
      console.log('Catálogo padrão verificado');
    } catch (seedErr) {
      console.error('Falha ao verificar catálogo padrão:', seedErr.message || seedErr);
    }
    const server = httpServer.listen(PORT, HOST, () => console.log(`Server rodando em http://${HOST}:${PORT}`));
    server.on('error', (err) => {
      console.error('Erro no servidor:', err.message || err);
      process.exit(1);
    });
  })
  .catch(err => {
    console.error('Erro conectando ao MongoDB', err.message || err);
  });
