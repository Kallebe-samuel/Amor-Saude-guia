const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();
const User = require('../src/models/User');
const Executante = require('../src/models/Executante');
const Procedimento = require('../src/models/Procedimento');
const proceduresCatalog = require('./procedures_catalog');

const MONGO = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/amor_saude';

async function run(){
  console.log('Seed iniciado. MONGO=', MONGO);
  try {
    await mongoose.connect(MONGO, { serverSelectionTimeoutMS: 5000 });
    console.log('Conectado ao mongo');
  } catch (err) {
    console.error('Erro conectando ao MongoDB:', err.message || err);
    process.exit(1);
  }
  const gestorEmail = 'catalao.go@amorsaude.com';
  let gestor = await User.findOne({ email: gestorEmail });
  if (!gestor) {
    gestor = await User.create({ name: 'Gestor Amor Saúde', email: gestorEmail, password: 'Amor@100', role: 'gestor' });
    console.log('Gestor criado');
  } else console.log('Gestor já existe');

  const exec1 = await Executante.findOne({ name: 'Clínica CEMEC' });
  if (!exec1) await Executante.create({ name: 'Clínica CEMEC' });
  const exec2 = await Executante.findOne({ name: 'Clínica Imagem de Radiologia Catalão' });
  if (!exec2) await Executante.create({ name: 'Clínica Imagem de Radiologia Catalão' });

  const procCount = await Procedimento.countDocuments();
  if (procCount === 0) {
    const docs = proceduresCatalog
      .filter((p) => p && p.name)
      .map((p) => ({
        name: String(p.name).trim(),
        code: (p.code || '').toString().trim()
      }));
    if (docs.length) {
      await Procedimento.insertMany(docs, { ordered: false });
    }
  }

  console.log('Executantes seed finalizado');
  process.exit(0);
}

run().catch(err=>{ console.error(err); process.exit(1); });
