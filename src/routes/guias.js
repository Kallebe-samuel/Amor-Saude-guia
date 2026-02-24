const express = require('express');
const router = express.Router();
const Guia = require('../models/Guia');
const Executante = require('../models/Executante');
const { protect, authorize } = require('../middleware/auth');
const validator = require('validator');

function emitChange(req, action, payload){
  const io = req.app && req.app.locals ? req.app.locals.io : null;
  if (!io) return;
  io.emit('guias:changed', { action, payload, at: Date.now() });
}

function normalizeProcedimentos(data){
  const rawList = Array.isArray(data.procedimentos) ? data.procedimentos : [];
  const fallback = typeof data.procedimento === 'string' ? [data.procedimento] : [];
  return rawList
    .concat(fallback)
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .filter((item, index, arr) => arr.indexOf(item) === index);
}

// Criar guia (gestor e recepção)
router.post('/', protect, async (req, res) => {
  const data = req.body;
  const procedimentos = normalizeProcedimentos(data);
  // validações básicas
  if (!data.pacienteNome || !data.cpf || !data.idPagamento || !data.valor || !data.executante || !procedimentos.length) {
    return res.status(400).json({ message: 'Campos obrigatórios ausentes' });
  }
  // CPF simples – usar validator
  if (!validator.isTaxID(data.cpf, 'pt-BR') && !validator.isNumeric(data.cpf.replace(/\D/g,''))) {
    // aceitamos apenas numeric CPF válido via função no frontend; aqui bloqueamos formatos óbvios
    return res.status(400).json({ message: 'CPF inválido' });
  }
  // data não pode ser futura
  if (new Date(data.dataPagamento) > new Date()) return res.status(400).json({ message: 'Data de pagamento não pode ser futura' });
  try {
    const exec = await Executante.findById(data.executante);
    if (!exec) return res.status(400).json({ message: 'Executante inválido' });
    const procedimentoPrincipal = procedimentos[0];
    const guia = await Guia.create({
      pacienteNome: data.pacienteNome,
      cpf: data.cpf,
      dataNascimento: data.dataNascimento || null,
      idade: data.idade || null,
      idPagamento: data.idPagamento,
      valor: data.valor,
      dataPagamento: data.dataPagamento,
  solicitante: data.solicitante || null,
      procedimento: procedimentoPrincipal,
      procedimentos,
  observacoes: data.observacoes || null,
      executante: exec._id,
      parceria: 'CARTAO DE TODOS',
      emitidoEm: new Date(),
      atendente: req.user._id,
      atendenteNome: req.user.name,
      atendentePerfil: req.user.role
    });
    emitChange(req, 'created', { id: guia._id, pacienteNome: guia.pacienteNome, atendente: String(req.user._id) });
    res.json(guia);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: 'ID de pagamento já existe' });
    res.status(400).json({ message: 'Erro', error: err.message });
  }
});

// Buscar / filtrar histórico
router.get('/', protect, async (req, res) => {
  const { cpf, idPagamento, nome, executante, startDate, endDate } = req.query;
  const q = {};
  if (cpf) q.cpf = cpf;
  if (idPagamento) q.idPagamento = idPagamento;
  if (nome) q.pacienteNome = new RegExp(nome, 'i');
  if (executante) q.executante = executante;
  if (startDate || endDate) q.emitidoEm = {};
  if (startDate) q.emitidoEm.$gte = new Date(startDate);
  if (endDate) q.emitidoEm.$lte = new Date(endDate);

  // recepção só vê próprio histórico
  if (req.user.role === 'recepcao') q.atendente = req.user._id;

  const results = await Guia.find(q).populate('executante').populate('atendente', 'name email role');
  res.json(results);
});

module.exports = router;
