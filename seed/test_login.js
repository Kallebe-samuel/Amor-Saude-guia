const url = process.env.TEST_LOGIN_URL || 'http://127.0.0.1:3002/api/auth/login';
const email = process.env.TEST_LOGIN_EMAIL || 'catalao.go@amorsaude.com';
const password = process.env.TEST_LOGIN_PASSWORD || 'Amor@100';

(async () => {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) {}

    console.log('STATUS:', res.status);
    if (json) {
      console.log('BODY:', JSON.stringify({
        message: json.message,
        hasToken: !!json.token,
        user: json.user ? { email: json.user.email, role: json.user.role } : null
      }, null, 2));
    } else {
      console.log('BODY_TEXT:', text);
    }
  } catch (err) {
    console.error('ERROR:', err.message || err);
    process.exit(1);
  }
})();
