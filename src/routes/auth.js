const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Credenciais ausentes' });
  const normalizedEmail = String(email).trim().toLowerCase();
  const user = await User.findOne({ email: normalizedEmail }) || await User.findOne({ email: new RegExp(`^${normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
  if (!user) return res.status(401).json({ message: 'Credenciais inválidas' });
  const match = await user.comparePassword(password);
  if (!match) return res.status(401).json({ message: 'Credenciais inválidas' });
  const payload = { id: user._id, role: user.role };
  const token = jwt.sign(payload, process.env.JWT_SECRET || 'troque_em_producao', { expiresIn: process.env.JWT_EXPIRES_IN || '8h' });
  res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role, mustChangePassword: user.mustChangePassword } });
});

module.exports = router;
