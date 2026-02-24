const mongoose = require('mongoose');

const ExecutanteSchema = new mongoose.Schema({
  name: { type: String, required: true },
  cnpj: { type: String },
  razaoSocial: { type: String },
  telefone: { type: String },
  email: { type: String },
  endereco: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('Executante', ExecutanteSchema);
