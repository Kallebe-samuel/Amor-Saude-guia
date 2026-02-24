const mongoose = require('mongoose');

const ProcedimentoSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  code: { type: String },
  executante: { type: mongoose.Schema.Types.ObjectId, ref: 'Executante' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Procedimento', ProcedimentoSchema);
