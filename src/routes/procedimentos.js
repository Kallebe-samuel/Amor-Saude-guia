const express = require('express');
const router = express.Router();
const Procedimento = require('../models/Procedimento');
const { protect, authorize } = require('../middleware/auth');

function emitChange(req, action, payload){
  const io = req.app && req.app.locals ? req.app.locals.io : null;
  if (!io) return;
  io.emit('procedimentos:changed', { action, payload, at: Date.now() });
}

// Listar procedimentos (qualquer usuário pode ver)
router.get('/', protect, async (req, res) => {
  const q = {};
  if (req.query.q) q.name = new RegExp(req.query.q, 'i');
  if (req.query.executante) q.executante = req.query.executante;
  const list = await Procedimento.find(q).sort({ name: 1 });
  res.json(list);
});

// Criar (gestor)
router.post('/', protect, authorize('gestor'), async (req, res) => {
  const { name, code, executante } = req.body;
  if (!name) return res.status(400).json({ message: 'Nome do procedimento é obrigatório' });
  try{
    const p = await Procedimento.create({ name, code, executante });
    emitChange(req, 'created', { id: p._id, name: p.name });
    res.json(p);
  }catch(err){ res.status(400).json({ message: 'Erro', error: err.message }); }
});

// Atualizar (gestor)
router.put('/:id', protect, authorize('gestor'), async (req, res) => {
  try{
    const p = await Procedimento.findById(req.params.id);
    if (!p) return res.status(404).json({ message: 'Não encontrado' });
    p.name = req.body.name || p.name;
    p.code = req.body.code || p.code;
    p.executante = req.body.executante || p.executante;
    await p.save();
    emitChange(req, 'updated', { id: p._id, name: p.name });
    res.json(p);
  }catch(err){ res.status(400).json({ message: 'Erro', error: err.message }); }
});

// Deletar (gestor)
router.delete('/:id', protect, authorize('gestor'), async (req, res) => {
  try{
    const existing = await Procedimento.findById(req.params.id);
    await Procedimento.findByIdAndDelete(req.params.id);
    emitChange(req, 'deleted', { id: req.params.id, name: existing && existing.name ? existing.name : '' });
    res.json({ message: 'Removido' });
  }catch(err){ res.status(400).json({ message: 'Erro', error: err.message }); }
});

module.exports = router;
