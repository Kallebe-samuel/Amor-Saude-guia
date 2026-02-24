const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();
const crypto = require('crypto');
const Procedimento = require('../src/models/Procedimento');
const procedures = require('./procedures_catalog');

const MONGO = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/amor_saude';

async function run(){
  console.log('Seed procedimentos iniciado. MONGO=', MONGO);
  try {
    await mongoose.connect(MONGO, { serverSelectionTimeoutMS: 5000 });
    console.log('Conectado ao mongo');
  } catch (err) {
    console.error('Erro conectando ao MongoDB:', err.message || err);
    process.exit(1);
  }

  // First pass: detect TUSS codes that appear more than once (non-empty codes)
  const codeCount = {};
  for (const p of procedures){
    const c = (p.code || '').toString().trim();
    if (c) codeCount[c] = (codeCount[c] || 0) + 1;
  }

  // Build processed list: for duplicated codes, keep one record with empty code and the exam name;
  // for uniques, keep as-is. Also preserve flag originalEmpty for entries that originally had empty code
  const processed = [];
  const handledCodes = new Set();
  for (const p of procedures){
    const origCode = (p.code || '').toString().trim();
    if (origCode && codeCount[origCode] > 1){
      if (handledCodes.has(origCode)) {
        // skip subsequent duplicates
        continue;
      }
      // keep one entry for this code but with empty code (no TUSS) per your request
      processed.push({ code: '', name: p.name, preserveEmpty: true });
      handledCodes.add(origCode);
    } else {
      // unique code or originally empty
      processed.push({ code: origCode, name: p.name, originalEmpty: !origCode });
    }
  }

  let created = 0;
  for (const p of processed){
    try{
      let code = (p.code || '').toString().trim();
      // If this record was created to intentionally preserve an empty code (deduped), do NOT generate GEN-
      if (!code && !p.preserveEmpty) {
        // original empty: generate deterministic GEN-<md5(8)>
        const hash = crypto.createHash('md5').update(p.name).digest('hex').slice(0,8).toUpperCase();
        code = `GEN-${hash}`;
      }
      // ensure no spaces
      code = code.replace(/\s+/g, '');

      await Procedimento.findOneAndUpdate({ code: code, name: p.name }, { $set: { code: code, name: p.name } }, { upsert: true, new: true });
      created++;
    }catch(e){ console.error('Erro ao inserir', p, e.message || e); }
  }

  console.log(`Seed finalizado. Procedimentos processados: ${created}`);
  process.exit(0);
}

run().catch(err=>{ console.error(err); process.exit(1); });
