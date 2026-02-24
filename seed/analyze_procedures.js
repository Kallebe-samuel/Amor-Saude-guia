const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, 'seed_procedures.js');
const txt = fs.readFileSync(file, 'utf8');

// crude regex to capture objects like { code: '...', name: '...'}
const re = /\{\s*code:\s*'([^']*)'\s*,\s*name:\s*'([^']*)'\s*\}/g;
let m;
const items = [];
while ((m = re.exec(txt)) !== null){
  items.push({ code: m[1], name: m[2]});
}

const codeCount = {};
for (const it of items){
  const c = (it.code||'').trim();
  if (c) codeCount[c] = (codeCount[c]||0)+1;
}

const duplicates = Object.entries(codeCount).filter(([,v])=>v>1).map(([k,v])=>({code:k,count:v}));
const emptyCodes = items.filter(it=>!(it.code||'').trim()).map(it=>it.name);

console.log('Procedimentos totais na lista:', items.length);
console.log('Entradas sem código (vazias):', emptyCodes.length);
if (emptyCodes.length>0){
  console.log('  Exemplos (até 10):');
  emptyCodes.slice(0,10).forEach(n=>console.log('   -', n));
}

console.log('\nCódigos duplicados (count>1):', duplicates.length);
if (duplicates.length>0){
  duplicates.forEach(d=>{
    console.log(`  - Código: ${d.code} (ocorre ${d.count} vezes)`);
    // list the names for that code
    items.filter(it=>((it.code||'').trim())===d.code).forEach(it=>console.log('     *', it.name));
  });
}

// Show final processed logic preview (which entries will become preserveEmpty)
const processed = [];
const handled = new Set();
for (const p of items){
  const origCode = (p.code||'').trim();
  if (origCode && codeCount[origCode]>1){
    if (handled.has(origCode)) continue;
    processed.push({ code:'', name: p.name, note: 'deduped_preserve_empty' });
    handled.add(origCode);
  } else {
    processed.push({ code: origCode, name: p.name, note: origCode? 'keep' : 'generate_gen' });
  }
}

console.log('\nPreview de processamento (primeiras 50):');
processed.slice(0,50).forEach(p=>console.log(`  [${p.code||'<EMPTY>'}] ${p.name} -> ${p.note}`));

console.log('\nResumo:');
console.log('  Total originais:', items.length);
console.log('  Após processamento (itens únicos):', processed.length);
console.log('  Duplicados transformados em entrada sem código:', duplicates.length);
