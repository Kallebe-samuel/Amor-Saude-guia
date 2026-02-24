const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');
const crypto = require('crypto');

function emitChange(req, action, payload){
  const io = req.app && req.app.locals ? req.app.locals.io : null;
  if (!io) return;
  io.emit('users:changed', { action, payload, at: Date.now() });
}

// Criar usuário (gestor)
router.post('/', protect, authorize('gestor'), async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) return res.status(400).json({ message: 'Campos obrigatórios ausentes' });
  try {
    const user = await User.create({ name, email, password, role: role || 'recepcao' });
    emitChange(req, 'created', { id: user._id, name: user.name, role: user.role });
    res.json({ user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    res.status(400).json({ message: 'Erro ao criar usuário', error: err.message });
  }
});

// Listar usuários (gestor)
router.get('/', protect, authorize('gestor'), async (req, res) => {
  const users = await User.find().select('-password');
  res.json(users);
});

// Editar usuário (gestor)
router.put('/:id', protect, authorize('gestor'), async (req, res) => {
  const updates = req.body;
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Usuário não encontrado' });
    if (updates.password) {
      user.password = updates.password;
    }
    user.name = updates.name || user.name;
    user.role = updates.role || user.role;
    await user.save();
    emitChange(req, 'updated', { id: user._id, name: user.name, role: user.role });
    res.json({ message: 'Atualizado' });
  } catch (err) {
    res.status(400).json({ message: 'Erro', error: err.message });
  }
});

// Remover usuário (gestor)
router.delete('/:id', protect, authorize('gestor'), async (req, res) => {
  try {
    if (String(req.user.id) === String(req.params.id)) {
      return res.status(400).json({ message: 'Você não pode remover o usuário logado' });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Usuário não encontrado' });
    await User.deleteOne({ _id: req.params.id });
    emitChange(req, 'deleted', { id: req.params.id, name: user.name });
    res.json({ message: 'Usuário removido com sucesso' });
  } catch (err) {
    res.status(400).json({ message: 'Erro ao remover usuário', error: err.message });
  }
});

// Reset senha - gestor gera senha temporária
router.post('/:id/reset', protect, authorize('gestor'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Usuário não encontrado' });
    const temp = crypto.randomBytes(4).toString('hex') + 'A1!';
    user.password = temp;
    user.mustChangePassword = true;
    await user.save();
    // Não enviamos email; retornamos a senha temporária para o gestor copiar manualmente
    res.json({ tempPassword: temp, message: 'Senha temporária gerada. Usuário será obrigado a alterar no próximo login.' });
  } catch (err) {
    res.status(400).json({ message: 'Erro', error: err.message });
  }
});

module.exports = router;
