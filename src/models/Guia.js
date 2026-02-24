const mongoose = require('mongoose');

const GuiaSchema = new mongoose.Schema({
  pacienteNome: { type: String, required: true },
  cpf: { type: String, required: true },
  dataNascimento: { type: Date },
  idade: { type: Number },
  idPagamento: { type: String, required: true, unique: true },
  valor: { type: Number, required: true },
  dataPagamento: { type: Date, required: true },
  solicitante: { type: String },
  procedimento: { type: String, required: true },
  procedimentos: { type: [String], default: [] },
  observacoes: { type: String },
  executante: { type: mongoose.Schema.Types.ObjectId, ref: 'Executante', required: true },
  parceria: { type: String, default: 'CARTAO DE TODOS' },
  emitidoEm: { type: Date, default: Date.now },
  atendente: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  atendenteNome: { type: String, required: true },
  atendentePerfil: { type: String, required: true }
}, { timestamps: true });

module.exports = mongoose.model('Guia', GuiaSchema);
