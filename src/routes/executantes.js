const express = require('express');
const router = express.Router();
const Executante = require('../models/Executante');
const { protect, authorize } = require('../middleware/auth');

function emitChange(req, action, payload){
  const io = req.app && req.app.locals ? req.app.locals.io : null;
  if (!io) return;
  io.emit('executantes:changed', { action, payload, at: Date.now() });
}

// Listar executantes (autenticado)
router.get('/', protect, async (req, res) => {
  const lista = await Executante.find();
  res.json(lista);
});

// Criar executante (gestor)
router.post('/', protect, authorize('gestor'), async (req, res) => {
  try {
    const e = await Executante.create(req.body);
    emitChange(req, 'created', { id: e._id, name: e.name });
    res.json(e);
  } catch (err) {
    res.status(400).json({ message: 'Erro', error: err.message });
  }
});

// Editar executante (gestor)
router.put('/:id', protect, authorize('gestor'), async (req, res) => {
  try {
    const e = await Executante.findByIdAndUpdate(req.params.id, req.body, { new: true });
    emitChange(req, 'updated', { id: e && e._id, name: e && e.name });
    res.json(e);
  } catch (err) {
    res.status(400).json({ message: 'Erro', error: err.message });
  }
});

// Remover executante (gestor)
router.delete('/:id', protect, authorize('gestor'), async (req, res) => {
  try {
    const existing = await Executante.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Executante não encontrado' });
    await Executante.deleteOne({ _id: req.params.id });
    emitChange(req, 'deleted', { id: req.params.id, name: existing.name });
    res.json({ message: 'Executante removido com sucesso' });
  } catch (err) {
    res.status(400).json({ message: 'Erro ao remover executante', error: err.message });
  }
});

module.exports = router;
