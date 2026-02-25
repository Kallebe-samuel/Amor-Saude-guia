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

function normalizeDistribuicaoExecutantes(data){
  const rawList = Array.isArray(data.distribuicaoExecutantes) ? data.distribuicaoExecutantes : [];

  function parseMoneyValue(raw){
    if (raw === null || raw === undefined || raw === '') return 0;
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
    const cleaned = String(raw).trim().replace(/\./g, '').replace(',', '.');
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return rawList
    .map((item)=>({
      executante: String((item && item.executante) || '').trim(),
      procedimentos: normalizeProcedimentos(item || {}),
      itens: (Array.isArray(item && item.itens) ? item.itens : [])
        .map((entry)=>({
          procedimento: String((entry && entry.procedimento) || '').trim(),
          valor: parseMoneyValue(entry && entry.valor)
        }))
        .filter((entry)=> entry.procedimento)
    }))
    .filter((item)=> item.executante && item.procedimentos.length);
}

function getUniqueExecutantesFromDistribuicao(distribuicao){
  return (distribuicao || [])
    .map((item)=> String(item && item.executante || '').trim())
    .filter((item, index, arr)=> item && arr.indexOf(item) === index);
}

function validateDistribuicao({ procedimentos, distribuicaoFinal, idsExecutantesValidos, executantesFinal }){
  const procedimentosDistribuidos = distribuicaoFinal.flatMap((item)=> item.procedimentos);
  const procedimentosDuplicados = procedimentosDistribuidos.filter((item, index, arr)=> arr.indexOf(item) !== index);
  const procedimentosForaLista = procedimentosDistribuidos.filter((item)=> !procedimentos.includes(item));
  const procedimentosNaoDistribuidos = procedimentos.filter((item)=> !procedimentosDistribuidos.includes(item));
  if (procedimentosForaLista.length) return 'Distribuição de procedimentos inválida';
  if (procedimentosDuplicados.length) return 'Um procedimento não pode ser enviado para mais de um executante';
  if (procedimentosNaoDistribuidos.length) return 'Todos os procedimentos devem ser distribuídos entre os executantes';

  const itensDistribuidos = distribuicaoFinal.flatMap((item)=> item.itens || []);
  const itensComValor = itensDistribuidos.filter((item)=> Number(item.valor) > 0);
  if (itensDistribuidos.length) {
    const itensForaLista = itensDistribuidos.filter((item)=> !procedimentos.includes(item.procedimento));
    const itensDuplicados = itensDistribuidos
      .map((item)=> item.procedimento)
      .filter((proc, index, arr)=> arr.indexOf(proc) !== index);
    const itensSemValor = itensDistribuidos.filter((item)=> !(Number(item.valor) > 0));
    if (itensForaLista.length) return 'Valores por exame inválidos';
    if (itensDuplicados.length) return 'Um exame só pode ter um valor na distribuição';
    if (itensSemValor.length) return 'Informe o valor de cada exame distribuído';
  }

  if (itensComValor.length && itensComValor.length !== procedimentos.length) {
    return 'Todos os exames devem possuir valor quando usar valores por exame';
  }

  if ((executantesFinal || []).length > 1) {
    const execsNaDistribuicao = getUniqueExecutantesFromDistribuicao(distribuicaoFinal);
    const faltantes = (executantesFinal || []).filter((id)=> !execsNaDistribuicao.includes(String(id)));
    if (faltantes.length) return 'Distribua exames para todos os executantes selecionados';
  }

  if ((executantesFinal || []).length > 1 && (idsExecutantesValidos || []).length > 1) {
    if (getUniqueExecutantesFromDistribuicao(distribuicaoFinal).length < 2) {
      return 'Para múltiplos executantes, distribua os exames em pelo menos 2 fornecedores';
    }
  }

  return null;
}

// Criar guia (gestor e recepção)
router.post('/', protect, async (req, res) => {
  const data = req.body;
  const procedimentos = normalizeProcedimentos(data);
  const distribuicaoExecutantes = normalizeDistribuicaoExecutantes(data);
  const executantesPayload = Array.isArray(data.executantes) ? data.executantes.map((item)=> String(item || '').trim()).filter(Boolean) : [];
  const executantesUnicos = executantesPayload.filter((item, index, arr)=> arr.indexOf(item) === index);
  const executantePrincipal = String(data.executante || executantesUnicos[0] || '').trim();
  // validações básicas
  if (!data.pacienteNome || !data.cpf || !data.idPagamento || !data.valor || !executantePrincipal || !procedimentos.length) {
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
    const executantesParaValidar = executantesUnicos.length ? executantesUnicos : [executantePrincipal];
    const execs = await Executante.find({ _id: { $in: executantesParaValidar } }).select('_id');
    if (!execs.length || execs.length !== executantesParaValidar.length) return res.status(400).json({ message: 'Executante inválido' });

    const idsExecutantesValidos = execs.map((item)=> String(item._id));
    const executantesFinal = idsExecutantesValidos.filter((item, index, arr)=> arr.indexOf(item) === index);

    let distribuicaoFinal = [];
    if (distribuicaoExecutantes.length) {
      distribuicaoFinal = distribuicaoExecutantes
        .filter((item)=> idsExecutantesValidos.includes(String(item.executante)))
        .map((item)=> ({
          executante: item.executante,
          procedimentos: item.procedimentos,
          itens: item.itens
        }));
      const distError = validateDistribuicao({ procedimentos, distribuicaoFinal, idsExecutantesValidos, executantesFinal });
      if (distError) return res.status(400).json({ message: distError });
    }

    if (!distribuicaoFinal.length) {
      distribuicaoFinal = [{ executante: executantePrincipal, procedimentos, itens: [] }];
    }

    const valorDistribuido = distribuicaoFinal
      .flatMap((item)=> item.itens || [])
      .reduce((sum, item)=> sum + Number(item.valor || 0), 0);
    const valorInformado = Number(data.valor || 0);
    const valorFinal = valorDistribuido > 0 ? valorDistribuido : valorInformado;
    if (!(valorFinal > 0)) return res.status(400).json({ message: 'Valor inválido' });

    const executantePrincipalValido = String(distribuicaoFinal[0].executante || executantePrincipal);
    const procedimentoPrincipal = procedimentos[0];
    const guia = await Guia.create({
      pacienteNome: data.pacienteNome,
      cpf: data.cpf,
      dataNascimento: data.dataNascimento || null,
      idade: data.idade || null,
      idPagamento: data.idPagamento,
      valor: valorFinal,
      dataPagamento: data.dataPagamento,
  solicitante: data.solicitante || null,
      procedimento: procedimentoPrincipal,
      procedimentos,
  observacoes: data.observacoes || null,
        executante: executantePrincipalValido,
        executantes: executantesFinal.length ? executantesFinal : [executantePrincipalValido],
        distribuicaoExecutantes: distribuicaoFinal,
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

router.put('/:id/distribuicao', protect, async (req, res) => {
  const guia = await Guia.findById(req.params.id);
  if (!guia) return res.status(404).json({ message: 'Guia não encontrada' });

  if (req.user.role === 'recepcao' && String(guia.atendente) !== String(req.user._id)) {
    return res.status(403).json({ message: 'Sem permissão para editar esta guia' });
  }

  const data = req.body || {};
  const procedimentos = normalizeProcedimentos({ procedimentos: data.procedimentos && data.procedimentos.length ? data.procedimentos : guia.procedimentos });
  const distribuicaoExecutantes = normalizeDistribuicaoExecutantes(data);
  if (!procedimentos.length || !distribuicaoExecutantes.length) {
    return res.status(400).json({ message: 'Distribuição inválida' });
  }

  const executantesFinal = getUniqueExecutantesFromDistribuicao(distribuicaoExecutantes);
  const execs = await Executante.find({ _id: { $in: executantesFinal } }).select('_id');
  const idsExecutantesValidos = execs.map((item)=> String(item._id));
  if (!idsExecutantesValidos.length || idsExecutantesValidos.length !== executantesFinal.length) {
    return res.status(400).json({ message: 'Executante inválido' });
  }

  const distribuicaoFinal = distribuicaoExecutantes
    .filter((item)=> idsExecutantesValidos.includes(String(item.executante)))
    .map((item)=> ({ executante: item.executante, procedimentos: item.procedimentos, itens: item.itens }));

  const distError = validateDistribuicao({ procedimentos, distribuicaoFinal, idsExecutantesValidos, executantesFinal });
  if (distError) return res.status(400).json({ message: distError });

  const valorDistribuido = distribuicaoFinal
    .flatMap((item)=> item.itens || [])
    .reduce((sum, item)=> sum + Number(item.valor || 0), 0);
  if (!(valorDistribuido > 0)) return res.status(400).json({ message: 'Informe os valores dos exames' });

  guia.executante = distribuicaoFinal[0].executante;
  guia.executantes = executantesFinal;
  guia.distribuicaoExecutantes = distribuicaoFinal;
  guia.procedimentos = procedimentos;
  guia.procedimento = procedimentos[0];
  guia.valor = valorDistribuido;
  await guia.save();

  const updated = await Guia.findById(guia._id)
    .populate('executante')
    .populate('executantes')
    .populate('distribuicaoExecutantes.executante')
    .populate('atendente', 'name email role');

  emitChange(req, 'updated', { id: guia._id, pacienteNome: guia.pacienteNome, atendente: String(guia.atendente) });
  res.json(updated);
});

// Buscar / filtrar histórico
router.get('/', protect, async (req, res) => {
  const { cpf, idPagamento, nome, executante, startDate, endDate } = req.query;
  const q = {};
  if (cpf) q.cpf = cpf;
  if (idPagamento) q.idPagamento = idPagamento;
  if (nome) q.pacienteNome = new RegExp(nome, 'i');
  if (executante) q.$or = [{ executante }, { executantes: executante }, { 'distribuicaoExecutantes.executante': executante }];
  if (startDate || endDate) q.emitidoEm = {};
  if (startDate) q.emitidoEm.$gte = new Date(startDate);
  if (endDate) q.emitidoEm.$lte = new Date(endDate);

  // recepção só vê próprio histórico
  if (req.user.role === 'recepcao') q.atendente = req.user._id;

  const results = await Guia.find(q)
    .populate('executante')
    .populate('executantes')
    .populate('distribuicaoExecutantes.executante')
    .populate('atendente', 'name email role');
  res.json(results);
});

router.get('/:id', protect, async (req, res) => {
  const guia = await Guia.findById(req.params.id)
    .populate('executante')
    .populate('executantes')
    .populate('distribuicaoExecutantes.executante')
    .populate('atendente', 'name email role');

  if (!guia) return res.status(404).json({ message: 'Guia não encontrada' });
  const atendenteId = guia.atendente && guia.atendente._id ? guia.atendente._id : guia.atendente;
  if (req.user.role === 'recepcao' && String(atendenteId) !== String(req.user._id)) {
    return res.status(403).json({ message: 'Sem permissão para acessar esta guia' });
  }

  res.json(guia);
});

module.exports = router;
