const COOKIE = "gasak_session";
const SESSION_DAYS = 30;

function htmlEscape(value) {
  return String(value).replace(/[&<>'"]/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  }[c]));
}

function loginPage(message = "") {
  const safeMessage = htmlEscape(message);
  return new Response(`<!doctype html>
<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>GASAK, KALO IYA. — Akses</title>
<style>
:root{--ivory:#f7f2e8;--paper:#fffdf8;--ink:#292724;--muted:#746e64;--brown:#7a6755;--terracotta:#b87962;--line:#ded5c8}
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:var(--ivory);color:var(--ink);font-family:Inter,system-ui,sans-serif;display:grid;place-items:center;padding:24px}
.card{width:min(520px,100%);background:var(--paper);border:1px solid var(--line);border-radius:28px;padding:34px;box-shadow:0 18px 60px #4b3d2a12}
.kicker{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}h1{font-size:clamp(32px,7vw,54px);line-height:.95;margin:10px 0 14px}p{color:var(--muted);line-height:1.6}.mini{font-size:13px}.error{background:#f7e8e2;border:1px solid #e3c5b8;padding:12px 14px;border-radius:14px;margin:18px 0;color:#6d4436}
label{display:block;font-weight:700;margin:18px 0 8px}input{width:100%;padding:15px 16px;border:1px solid var(--line);border-radius:14px;background:#fff;font:inherit;letter-spacing:.08em;text-transform:uppercase}button{margin-top:14px;width:100%;padding:15px 18px;border:0;border-radius:14px;background:var(--brown);color:white;font:inherit;font-weight:800;cursor:pointer}button:hover{filter:brightness(.96)}
.footer{margin-top:22px;font-size:12px;color:var(--muted);text-align:center}
</style></head><body><main class="card">
<div class="kicker">HALLOW MY FUTURE</div><h1>GASAK,<br>KALO IYA.</h1>
<p>yaudah, kalau emang mau nikah, sini duduk. kita ngobrol.</p>
${safeMessage ? `<div class="error">${safeMessage}</div>` : ""}
<form method="POST" action="/api/login">
<label for="code">Access code</label>
<input id="code" name="code" autocomplete="one-time-code" placeholder="GASAK-XXXX-XXXX" required>
<button type="submit">Masuk ke GASAK →</button>
</form>
<div class="footer">Kode akses diberikan setelah pembelian.</div>
</main></body></html>`, {headers:{"Content-Type":"text/html; charset=UTF-8"}});
}

function cookieValue(request) {
  const raw = request.headers.get("Cookie") || "";
  const match = raw.match(new RegExp("(?:^|;\\s*)" + COOKIE + "=([^;]+)"));
  return match ? decodeURIComponent(match[1]) : null;
}

function cookieHeader(token) {
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  return `${COOKIE}=${encodeURIComponent(token)}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

function clearCookieHeader() {
  return `${COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map(b => b.toString(16).padStart(2,"0")).join("");
}

async function hasValidSession(request, env) {
  if (!env.DB) return false;
  const token = cookieValue(request);
  if (!token) return false;
  const row = await env.DB.prepare(`
    SELECT s.token
    FROM sessions s
    JOIN access_codes a ON a.id = s.access_code_id
    WHERE s.token = ? AND a.active = 1 AND s.expires_at > datetime('now')
    LIMIT 1
  `).bind(token).first();
  return !!row;
}

async function login(request, env) {
  if (!env.DB) return loginPage("Akses database belum terpasang. Hubungkan D1 dengan binding bernama DB di project Cloudflare ini.");
  const form = await request.formData();
  const code = String(form.get("code") || "").trim().toUpperCase();
  if (!code) return loginPage("Masukkan access code dulu ya.");

  const row = await env.DB.prepare(`SELECT id FROM access_codes WHERE code = ? AND active = 1 LIMIT 1`).bind(code).first();
  if (!row) return loginPage("Kode aksesnya belum cocok. Coba cek lagi tulisan kodenya.");

  const token = randomToken();
  await env.DB.prepare(`
    INSERT INTO sessions (token, access_code_id, expires_at)
    VALUES (?, ?, datetime('now', '+30 days'))
  `).bind(token, row.id).run();
  await env.DB.prepare(`UPDATE access_codes SET used_at = COALESCE(used_at, CURRENT_TIMESTAMP) WHERE id = ?`).bind(row.id).run();

  return new Response(null, {status:303, headers:{"Location":"/", "Set-Cookie":cookieHeader(token)}});
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/api/login") {
      return login(request, env);
    }

    if (url.pathname === "/logout") {
      const token = cookieValue(request);
      if (env.DB && token) {
        await env.DB.prepare(`DELETE FROM sessions WHERE token = ?`).bind(token).run();
      }
      return new Response(null, {status:303, headers:{"Location":"/", "Set-Cookie":clearCookieHeader()}});
    }

    const allowed = await hasValidSession(request, env);
    if (!allowed) return loginPage();

    return env.ASSETS.fetch(request);
  }
};