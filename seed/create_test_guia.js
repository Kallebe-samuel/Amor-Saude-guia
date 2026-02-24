const fetch = global.fetch || require('node-fetch');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3002';
console.log('Using BASE URL =', BASE);

async function run(){
  try{
    console.log('Logging in as gestor...');
    const login = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ email: 'catalao.go@amorsaude.com', password: 'Amor@100' })
    });
    const lj = await login.json();
    if (!login.ok) throw new Error('Login failed: '+(lj.message||JSON.stringify(lj)));
    const token = lj.token;
  console.log('Token received');

    const payload = {
      pacienteNome: 'TESTE AUTOMÁTICO',
      cpf: '01886372144',
      dataNascimento: '1955-01-01',
      idade: 71,
      idPagamento: 'TESTE-'+Date.now(),
      valor: 40.00,
      dataPagamento: new Date().toISOString().slice(0,10),
      solicitante: 'Piter Lacerda - CRM/29218',
      procedimento: 'RX de Pé ou pododáctilo',
      executante: null
    };

    // buscar um executante existente
    const exr = await fetch(`${BASE}/api/executantes`, { headers: { Authorization: 'Bearer '+token } });
    const exl = await exr.json();
    if (exl && exl.length) payload.executante = exl[0]._id;

  console.log('Creating guia...', payload.idPagamento);
    const res = await fetch(`${BASE}/api/guias`, { method: 'POST', headers: { 'Content-Type':'application/json', Authorization: 'Bearer '+token }, body: JSON.stringify(payload) });
    const jr = await res.json();
    if (!res.ok) throw new Error('Create failed: '+(jr.message||JSON.stringify(jr)));
    console.log('Guia criada:', jr);

    // fetch list filtered by idPagamento
    const check = await fetch(`${BASE}/api/guias?idPagamento=${encodeURIComponent(payload.idPagamento)}`, { headers: { Authorization: 'Bearer '+token } });
    const list = await check.json();
    console.log('Check result:', list);

  } catch (err){
    console.error('ERROR', err.message||err);
    process.exit(1);
  }
}

run();
