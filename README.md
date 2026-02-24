# Amor Saúde - Sistema de Guias (Catalão/GO)

Sistema local para geração e controle de Guias de Encaminhamento usando Node.js, Express, MongoDB e jsPDF (client-side). Pronto para rodar localmente sem serviços pagos.

Principais pontos:
- Backend: Node.js + Express
- Autenticação: JWT
- Senhas: bcrypt
- DB: MongoDB local (recomendado) ou ajuste para SQLite caso prefira
- PDF: jsPDF (client-side)

Pré-requisitos
- Node.js 16+
- MongoDB rodando localmente (ex: serviço MongoDB Community)

Instalação (PowerShell)
```powershell
cd C:\Users\TRIAGEM\Documents\PROJETO
npm install
copy .env.example .env
# Edite .env se necessário (MONGO_URI, JWT_SECRET)
npm run seed
npm run dev # ou npm start
```

Conta inicial (gestor)
- Email: catalao.go@amorsaude.com
- Senha: Amor@100

Uso
- Abra http://localhost:3000 no navegador
- Login com a conta gestor ou crie usuários via API (rota apenas gestor)
- Gere guias, elas serão salvas no banco e o PDF abrirá em nova aba

Segurança e produção
- Troque JWT_SECRET no .env
- Use HTTPS no deploy
- Considere variáveis de ambiente para o MongoDB remoto ou replica set

Arquitetura
- `server.js` - ponto de entrada
- `src/models` - modelos Mongoose
- `src/routes` - rotas REST
- `public/` - frontend estático (jsPDF)
- `seed/seed.js` - cria gestor + executantes iniciais

Seed adicional
- `seed/seed_procedures.js` - insere (upsert) uma lista grande de procedimentos/exames pré-existentes para aparecer no painel de Procedimentos. Use o comando abaixo para popular:

PowerShell:
```powershell
npm run seed:procedures
```

O script é idempotente (usa upsert por code+name) para evitar duplicatas se executado várias vezes.

Limitações e próximos passos
- Validação de CPF robusta já implementada no frontend; backend faz checagem básica. Pode-se adicionar validação completa no servidor.
- Melhorar layout do PDF para seguir exato modelo visual fornecido (substituir textos por posicionamento exato e imagens de alta qualidade).
- Adicionar testes automatizados e controle de versão das migrations/seeds.

## Publicação online (Mongo Atlas + Render + Netlify)

### 1) MongoDB Atlas (já conectado)
- Em `Network Access`, libere o IP `0.0.0.0/0` (temporário) ou o IP dos provedores.
- Em `Database Access`, confirme usuário/senha com permissão no banco.
- Use a `MONGO_URI` no formato `mongodb+srv://...`.

### 2) Backend no Render
- Suba este projeto para um repositório Git (GitHub/GitLab/Bitbucket).
- No Render: `New` -> `Web Service` -> conecte o Git provider **ou** use `Public Git Repository` com a URL do repo.
- Configuração:
	- `Build Command`: `npm install`
	- `Start Command`: `npm start`
	- `Environment`: `Node`
- Variáveis no Render:
	- `NODE_ENV=production`
	- `HOST=0.0.0.0`
	- `MONGO_URI=<sua string do Atlas>`
	- `JWT_SECRET=<segredo forte>`
	- `JWT_EXPIRES_IN=8h`

### 3) Frontend no Netlify
- Deploy da pasta `public`.
- Defina no Netlify (Site settings -> Environment variables):
	- `API_BASE_URL=https://SEU-SERVICO.onrender.com`
- No `index.html`, antes de carregar `app.js`, exponha a variável global:

```html
<script>
	window.API_BASE_URL = 'https://SEU-SERVICO.onrender.com';
</script>
```

### 4) CORS e integração
- O backend já permite CORS e o frontend agora suporta `API_BASE_URL` para chamadas `/api`.
- Socket.IO também passa a conectar no backend remoto automaticamente quando `API_BASE_URL` está definido.
