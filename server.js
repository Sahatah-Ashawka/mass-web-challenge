const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3002);
const FLAG = process.env.FLAG || "flag{access_update_complete}";
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.createHash("sha256").update(`gatehouse:${FLAG}`).digest("hex");
const PUBLIC_DIR = path.join(__dirname, "public");

const users = new Map();

function makeId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function seedAdmin() {
  const adminId = makeId("user");
  users.set(adminId, {
    id: adminId,
    username: "director",
    password: crypto.randomBytes(18).toString("hex"),
    displayName: "Gatehouse Director",
    team: "Command Desk",
    tagline: "Credentials before coffee.",
    role: "admin"
  });
}

seedAdmin();

function html(strings, ...values) {
  return strings.reduce((out, chunk, index) => {
    const value = values[index] === undefined ? "" : String(values[index]);
    return out + chunk + value;
  }, "");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseCookies(req) {
  const raw = req.headers.cookie || "";
  const cookies = {};
  for (const part of raw.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (!name) continue;
    cookies[name] = decodeURIComponent(rest.join("="));
  }
  return cookies;
}

function sign(value) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(value).digest("base64url");
}

function packUser(user) {
  const publicProfile = {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    team: user.team,
    tagline: user.tagline,
    role: user.role
  };
  const payload = Buffer.from(JSON.stringify(publicProfile)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function unpackUser(token) {
  if (!token || !token.includes(".")) return null;
  const [payload, mac] = token.split(".");
  const expected = sign(payload);
  try {
    if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
    const user = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!user || !user.id || !user.username || !user.role) return null;
    return user;
  } catch {
    return null;
  }
}

function currentUser(req) {
  const sid = parseCookies(req).sid;
  const cookieUser = unpackUser(sid);
  if (cookieUser) return cookieUser;
  return null;
}

function setSession(res, user) {
  const sid = packUser(user);
  res.setHeader("Set-Cookie", `sid=${encodeURIComponent(sid)}; HttpOnly; SameSite=Lax; Path=/`);
}

function clearSession(req, res) {
  res.setHeader("Set-Cookie", "sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function sendHtml(res, status, body) {
  send(res, status, body, { "Content-Type": "text/html; charset=utf-8" });
}

function redirect(res, location) {
  send(res, 302, "", { Location: location });
}

function sendJson(res, status, body) {
  send(res, status, JSON.stringify(body, null, 2), {
    "Content-Type": "application/json; charset=utf-8"
  });
}

function renderShell(title, content, user) {
  const authLinks = user
    ? `<span class="identity">${escapeHtml(user.displayName)} · ${escapeHtml(user.role)}</span>
       <form method="POST" action="/logout"><button class="icon-button" title="Sign out" aria-label="Sign out">Exit</button></form>`
    : `<a href="/login">Sign in</a><a class="nav-strong" href="/register">Sign up</a>`;

  return html`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} · web</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <header class="topbar">
    <a class="brand" href="/">
      <span class="brand-mark">w</span>
      <span>web</span>
    </a>
    <nav>${authLinks}</nav>
  </header>
  <main>${content}</main>
</body>
</html>`;
}

function renderHome(req, res) {
  const user = currentUser(req);
  if (user) return redirect(res, "/portal");
  return sendHtml(res, 200, renderShell("Access Desk", html`
    <section class="hero-grid">
      <div class="hero-copy">
        <p class="eyebrow">Event access operations</p>
        <h1>Request a badge. Join the floor. Keep the gates moving.</h1>
        <p class="lead">web handles staff badge requests for the Atlas Security Forum. Regular crew can update their pass profile; admins approve protected credentials.</p>
        <div class="actions">
          <a class="button primary" href="/register">Sign up</a>
          <a class="button ghost" href="/login">I already have one</a>
        </div>
      </div>
      <div class="status-board" aria-label="Operations status">
        <div>
          <span class="metric">218</span>
          <span>badges issued</span>
        </div>
        <div>
          <span class="metric amber">14</span>
          <span>manual reviews</span>
        </div>
        <div>
          <span class="metric green">4</span>
          <span>active gates</span>
        </div>
      </div>
    </section>
  `, user));
}

function renderAuth(req, res, mode, error = "") {
  const isRegister = mode === "register";
  const content = html`
    <section class="form-stage">
      <div class="panel">
        ${isRegister ? `<p class="eyebrow">New credential</p><h1>Sign up</h1>` : ""}
        ${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}
        <form method="POST" action="/${isRegister ? "register" : "login"}" class="stack-form">
          <label>Username
            <input name="username" minlength="3" autocomplete="username" required>
          </label>
          <label>Password
            <input name="password" type="password" minlength="4" autocomplete="${isRegister ? "new-password" : "current-password"}" required>
          </label>
          ${isRegister ? `<label>Display name
            <input name="displayName" maxlength="48" placeholder="Maya Event Staff">
          </label>` : ""}
          <button class="button primary" type="submit">${isRegister ? "Sign up" : "Sign in"}</button>
        </form>
        <p class="switch">${isRegister ? `Already registered? <a href="/login">Sign in</a>.` : `Need a badge? <a href="/register">Sign up</a>.`}</p>
      </div>
    </section>
  `;
  sendHtml(res, 200, renderShell(isRegister ? "Register" : "Login", content, currentUser(req)));
}

function renderPortal(req, res) {
  const user = currentUser(req);
  if (!user) return redirect(res, "/login");

  const adminLink = user.role === "admin"
    ? `<a class="button primary" href="/admin">Open Admin Panel</a>`
    : `<a class="button ghost" href="/admin">Admin Panel</a>`;

  const content = html`
    <section class="portal-layout">
      <aside class="pass">
        <p class="eyebrow">Current pass</p>
        <h1>${escapeHtml(user.displayName)}</h1>
        <dl>
          <div><dt>Handle</dt><dd>${escapeHtml(user.username)}</dd></div>
          <div><dt>Team</dt><dd>${escapeHtml(user.team || "Badge Support")}</dd></div>
          <div><dt>Role</dt><dd>${escapeHtml(user.role)}</dd></div>
          <div><dt>Status</dt><dd>Active</dd></div>
        </dl>
        ${adminLink}
      </aside>

      <section class="panel wide">
        <p class="eyebrow">Profile desk</p>
        <h2>Update public badge details</h2>
        <p class="muted">Only display fields are editable from the modern desk.</p>
        <form method="POST" action="/api/profile" class="stack-form">
          <label>Display name
            <input name="displayName" value="${escapeHtml(user.displayName)}" maxlength="48">
          </label>
          <label>Team
            <input name="team" value="${escapeHtml(user.team || "")}" maxlength="48">
          </label>
          <label>Badge note
            <input name="tagline" value="${escapeHtml(user.tagline || "")}" maxlength="80">
          </label>
          <label>Role
            <input value="${escapeHtml(user.role)}" disabled>
          </label>
          <button class="button primary" type="submit">Save profile</button>
        </form>
      </section>
    </section>
  `;

  sendHtml(res, 200, renderShell("Portal", content, user));
}

function renderAdmin(req, res) {
  const user = currentUser(req);
  if (!user) return redirect(res, "/login");
  if (user.role !== "admin") {
    return sendHtml(res, 403, renderShell("Forbidden", html`
      <section class="form-stage">
        <div class="panel">
          <p class="eyebrow">Admin Panel</p>
          <h1>Manual approval required</h1>
          <p class="muted">Your current pass role is <strong>${escapeHtml(user.role)}</strong>. Admin credentials are required.</p>
          <a class="button ghost" href="/portal">Back to pass desk</a>
        </div>
      </section>
    `, user));
  }

  return sendHtml(res, 200, renderShell("Admin Panel", html`
    <section class="admin-band">
      <p class="eyebrow">Admin Panel</p>
      <h1>Vault release approved</h1>
      <p class="flag">${escapeHtml(FLAG)}</p>
      <p class="muted">This panel is only shown to passes with the admin role.</p>
    </section>
  `, user));
}

function parseBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 32_768) req.destroy();
    });
    req.on("end", () => {
      const type = req.headers["content-type"] || "";
      if (type.includes("application/json")) {
        try {
          resolve(JSON.parse(raw || "{}"));
        } catch {
          resolve({});
        }
        return;
      }
      const params = new URLSearchParams(raw);
      const body = {};
      for (const [key, value] of params.entries()) {
        body[key] = value;
      }
      resolve(body);
    });
  });
}

function acceptsJson(req) {
  return (req.headers.accept || "").includes("application/json");
}

async function handleRegister(req, res) {
  const body = await parseBody(req);
  const username = String(body.username || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (username.length < 3 || password.length < 4) {
    return renderAuth(req, res, "register", "Choose a longer username and password.");
  }
  for (const user of users.values()) {
    if (user.username === username) {
      return renderAuth(req, res, "register", "That username is already registered.");
    }
  }
  const user = {
    id: makeId("user"),
    username,
    password,
    displayName: String(body.displayName || username).trim().slice(0, 48) || username,
    team: "Badge Support",
    tagline: "Ready for floor duty.",
    role: "member"
  };
  users.set(user.id, user);
  setSession(res, user);
  redirect(res, "/portal");
}

async function handleLogin(req, res) {
  const body = await parseBody(req);
  const username = String(body.username || "").trim().toLowerCase();
  const password = String(body.password || "");
  const user = [...users.values()].find((entry) => entry.username === username && entry.password === password);
  if (!user) return renderAuth(req, res, "login", "Unknown badge credentials.");
  setSession(res, user);
  redirect(res, "/portal");
}

async function handleProfile(req, res, url) {
  const user = currentUser(req);
  if (!user) {
    if (acceptsJson(req)) return sendJson(res, 401, { error: "login required" });
    return redirect(res, "/login");
  }

  const body = await parseBody(req);
  const override = String(
    body._method ||
    req.headers["x-http-method-override"] ||
    url.searchParams.get("_method") ||
    req.method
  ).toUpperCase();

  if (override === "PATCH") {
    const updates = { ...body };
    delete updates._method;

    Object.assign(user, updates);
    users.set(user.id, { ...users.get(user.id), ...user });
    setSession(res, user);

    if (acceptsJson(req)) {
      return sendJson(res, 200, {
        ok: true,
        profile: {
          username: user.username,
          displayName: user.displayName,
          team: user.team,
          role: user.role
        }
      });
    }
    return redirect(res, "/portal");
  }

  user.displayName = String(body.displayName || user.displayName).slice(0, 48);
  user.team = String(body.team || user.team || "Badge Support").slice(0, 48);
  user.tagline = String(body.tagline || user.tagline || "").slice(0, 80);
  users.set(user.id, { ...users.get(user.id), ...user });
  setSession(res, user);

  if (acceptsJson(req)) {
    return sendJson(res, 200, {
      ok: true,
      profile: {
        username: user.username,
        displayName: user.displayName,
        team: user.team,
        role: user.role
      }
    });
  }
  redirect(res, "/portal");
}

function serveStatic(req, res, pathname) {
  const cleanPath = pathname.replace(/^\/+/, "");
  const filePath = path.join(PUBLIC_DIR, cleanPath);
  if (!filePath.startsWith(PUBLIC_DIR)) return false;
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return false;
  const ext = path.extname(filePath);
  const types = {
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".svg": "image/svg+xml"
  };
  send(res, 200, fs.readFileSync(filePath), { "Content-Type": types[ext] || "application/octet-stream" });
  return true;
}

function handleApiFlag(req, res) {
  const user = currentUser(req);
  if (!user) return sendJson(res, 401, { error: "login required" });
  if (user.role !== "admin") return sendJson(res, 403, { error: "admin role required", role: user.role });
  return sendJson(res, 200, { flag: FLAG });
}

async function router(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;

  if (req.method === "GET" && serveStatic(req, res, pathname)) return;

  if (req.method === "GET" && pathname === "/") return renderHome(req, res);
  if (req.method === "GET" && pathname === "/login") return renderAuth(req, res, "login");
  if (req.method === "GET" && pathname === "/register") return renderAuth(req, res, "register");
  if (req.method === "GET" && pathname === "/portal") return renderPortal(req, res);
  if (req.method === "GET" && pathname === "/admin") return renderAdmin(req, res);
  if (req.method === "GET" && pathname === "/api/admin/flag") return handleApiFlag(req, res);

  if (req.method === "POST" && pathname === "/register") return handleRegister(req, res);
  if (req.method === "POST" && pathname === "/login") return handleLogin(req, res);
  if (req.method === "POST" && pathname === "/logout") {
    clearSession(req, res);
    return redirect(res, "/");
  }
  if (req.method === "POST" && pathname === "/api/profile") return handleProfile(req, res, url);
  if (req.method === "PATCH" && pathname === "/api/profile") return handleProfile(req, res, url);

  sendHtml(res, 404, renderShell("Missing", html`
    <section class="form-stage">
      <div class="panel">
        <p class="eyebrow">404</p>
        <h1>Not Found</h1>
        <a class="button ghost" href="/">Return home</a>
      </div>
    </section>
  `, currentUser(req)));
}

const server = http.createServer((req, res) => {
  router(req, res).catch((error) => {
    console.error(error);
    send(res, 500, "Internal server error", { "Content-Type": "text/plain; charset=utf-8" });
  });
});

server.listen(PORT, () => {
  console.log(`web running at http://localhost:${PORT}`);
});
