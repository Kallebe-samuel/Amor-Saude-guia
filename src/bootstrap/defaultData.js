const Executante = require('../models/Executante');
const Procedimento = require('../models/Procedimento');
const User = require('../models/User');
const fs = require('fs');
const path = require('path');

function loadProceduresCatalog() {
  const candidates = [
    path.join(__dirname, '../../seed/procedures_catalog.js'),
    path.join(process.cwd(), 'seed/procedures_catalog.js')
  ];

  for (const candidatePath of candidates) {
    if (fs.existsSync(candidatePath)) {
      return require(candidatePath);
    }
  }

  console.warn('Catálogo de procedimentos não encontrado. Seed inicial de procedimentos será ignorado.');
  return [];
}

const defaultUsers = [
  {
    name: 'Gestor Amor Saúde',
    email: 'catalao.go@amorsaude.com',
    password: 'Amor@100',
    role: 'gestor'
  },
  {
    name: 'Recepção Amor Saúde',
    email: 'recepcao@amorsaude.com',
    password: 'Amor@100',
    role: 'recepcao'
  },
  {
    name: 'Vanessa Moreira',
    email: 'vanessamoreira20234@gmail.com',
    password: 'Vanessa2025@',
    role: 'recepcao'
  },
  {
    name: 'Erika Bento Rodrigues',
    email: 'erika.bento.rodrigues2001@gmail.com',
    password: '@mor12E',
    role: 'recepcao'
  },
  {
    name: 'Kallebe Samuel Oliveira',
    email: 'kallebesamueloliveira@gmail.com',
    password: '#Ifood151',
    role: 'gestor'
  },
  {
    name: 'Messias Joao',
    email: 'messiasjoao1999@gmail.com',
    password: 'Joao10314#',
    role: 'gestor'
  }
];

const defaultExecutantes = [
  {
    name: 'STIMAGEM TOMOGRAFIA COMPUTADORIZADA MULTI SLICE',
    razaoSocial: 'STIMAGEM TOMOGRAFIA COMPUTADORIZADA MULTI SLICE',
    cnpj: '16.458.987/0001-22',
    endereco: 'Rua Cassiano Martins Teixeira, 155 - São João, Catalão - GO, 75703-020',
    telefone: '(64) 3442-5641'
  },
  {
    name: 'IMAGEM - CLINICA DE RADIOLOGIA',
    razaoSocial: 'IMAGEM - CLINICA DE RADIOLOGIA',
    cnpj: '10.955.927/0001-39',
    endereco: 'Av. Vinte de Agosto, Número 233 - St. Central, Catalão - GO, 75701-010',
    telefone: '(64) 3443-1665'
  },
  {
    name: 'CEMEC - Dr. Gabriel',
    razaoSocial: 'CEMEC - Dr. Gabriel',
    cnpj: '18.547.359/0001-49',
    endereco: 'Av. João XXIII, 50 - Centro, Catalão - GO, 75702-130',
    telefone: '(64) 9 9965-5776'
  },
  {
    name: 'SANTA CASA DE MISERICORDIA DE CATALAO',
    razaoSocial: 'SANTA CASA DE MISERICORDIA DE CATALAO',
    cnpj: '01.323.146/0001-30',
    endereco: 'Praça das Mães, s/n - São João, Catalão - GO, 75703-035',
    email: 'contato@santacasacatalao.org.br',
    telefone: '(64) 3040-5700'
  }
];

async function ensureDefaultData() {
  for (const defaultUser of defaultUsers) {
    const existingUser = await User.findOne({ email: defaultUser.email.toLowerCase() });
    if (!existingUser) {
      await User.create({
        ...defaultUser,
        email: defaultUser.email.toLowerCase()
      });
    }
  }

  for (const defaultExec of defaultExecutantes) {
    const existingExec = await Executante.findOne({
      $or: [
        { cnpj: defaultExec.cnpj },
        { razaoSocial: defaultExec.razaoSocial }
      ]
    });
    if (!existingExec) {
      await Executante.create(defaultExec);
    }
  }

  const procCount = await Procedimento.countDocuments();
  if (procCount === 0) {
    const proceduresCatalog = loadProceduresCatalog();
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
}

module.exports = {
  ensureDefaultData
};
