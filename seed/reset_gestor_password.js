const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();
const User = require('../src/models/User');

const MONGO = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/amor_saude';
const gestorEmail = 'catalao.go@amorsaude.com';
const NEW_PASS = 'Amor@100';

async function run(){
  console.log('Conectando ao mongo:', MONGO);
  try{ await mongoose.connect(MONGO, { serverSelectionTimeoutMS: 5000 }); }catch(e){ console.error('Erro ao conectar', e.message||e); process.exit(1); }
  const u = await User.findOne({ email: gestorEmail });
  if (!u){ console.error('Usuário gestor não encontrado:', gestorEmail); process.exit(1); }
  u.password = NEW_PASS;
  u.mustChangePassword = true;
  await u.save();
  console.log('Senha do gestor redefinida para:', NEW_PASS, '(mustChangePassword=true)');
  process.exit(0);
}

run().catch(e=>{ console.error(e); process.exit(1); });
