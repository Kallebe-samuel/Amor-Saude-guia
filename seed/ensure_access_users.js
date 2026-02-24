const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();
const User = require('../src/models/User');

const MONGO = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/amor_saude';

async function upsertUser({ name, email, password, role, mustChangePassword = false }) {
  const normalizedEmail = String(email).trim().toLowerCase();
  let user = await User.findOne({ email: normalizedEmail }) || await User.findOne({ email: new RegExp(`^${normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
  if (!user) {
    user = new User({ name, email: normalizedEmail, password, role, mustChangePassword });
    await user.save();
    console.log(`Usuário criado: ${normalizedEmail} (${role})`);
    return;
  }
  user.name = name;
  user.email = normalizedEmail;
  user.role = role;
  user.password = password;
  user.mustChangePassword = mustChangePassword;
  await user.save();
  console.log(`Usuário atualizado: ${normalizedEmail} (${role})`);
}

async function run() {
  console.log('Conectando ao mongo:', MONGO);
  await mongoose.connect(MONGO, { serverSelectionTimeoutMS: 5000 });

  await upsertUser({
    name: 'Gestor Amor Saúde',
    email: 'catalao.go@amorsaude.com',
    password: 'Amor@100',
    role: 'gestor',
    mustChangePassword: false
  });

  await upsertUser({
    name: 'Recepção Amor Saúde',
    email: 'recepcao@amorsaude.com',
    password: 'Amor@100',
    role: 'recepcao',
    mustChangePassword: false
  });

  console.log('Usuários de acesso garantidos com sucesso.');
  process.exit(0);
}

run().catch((err) => {
  console.error('Erro ao garantir usuários de acesso:', err.message || err);
  process.exit(1);
});
