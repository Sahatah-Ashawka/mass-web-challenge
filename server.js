const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3000);
const FLAG = process.env.FLAG || "flag{m3th0d_0v3rr1d3_m455_4551gnm3nt}";
const PUBLIC_DIR = path.join(__dirname, "public");

const users = new Map();
const sessions = new Map();

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

function currentUser(req) {
  const sid = parseCookies(req).sid;
  if (!sid || !sessions.has(sid)) return null;
  return users.get(sessions.get(sid)) || null;
}

function setSession(res, user) {
  const sid = makeId("sid");
  sessions.set(sid, user.id);
  res.setHeader("Set-Cookie", `sid=${encodeURIComponent(sid)}; HttpOnly; SameSite=Lax; Path=/`);
}

function clearSession(req, res) {
  const sid = parseCookies(req).sid;
  if (sid) sessions.delete(sid);
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
    : `<a href="/login">Sign in</a><a class="nav-strong" href="/register">Create pass</a>`;

  return html`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} · Gatehouse Pass</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <header class="topbar">
    <a class="brand" href="/">
      <span class="brand-mark">G</span>
      <span>Gatehouse Pass</span>
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
        <p class="lead">Gatehouse Pass handles staff badge requests for the Atlas Security Forum. Regular crew can update their pass profile; directors approve protected credentials.</p>
        <div class="actions">
          <a class="button primary" href="/register">Create attendee pass</a>
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
        <p class="eyebrow">${isRegister ? "New credential" : "Crew sign in"}</p>
        <h1>${isRegister ? "Create your event pass" : "Open your pass desk"}</h1>
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
          <button class="button primary" type="submit">${isRegister ? "Create pass" : "Sign in"}</button>
        </form>
        <p class="switch">${isRegister ? `Already registered? <a href="/login">Sign in</a>.` : `Need a badge? <a href="/register">Create one</a>.`}</p>
      </div>
    </section>
  `;
  sendHtml(res, 200, renderShell(isRegister ? "Register" : "Login", content, currentUser(req)));
}

function renderPortal(req, res) {
  const user = currentUser(req);
  if (!user) return redirect(res, "/login");

  const adminLink = user.role === "admin"
    ? `<a class="button primary" href="/admin">Open director console</a>`
    : `<a class="button ghost" href="/admin">Director console</a>`;

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
          <!-- The native clients still use the older profile endpoint during venue setup. -->
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
          <p class="eyebrow">Director console</p>
          <h1>Manual approval required</h1>
          <p class="muted">Your current pass role is <strong>${escapeHtml(user.role)}</strong>. Director credentials are required.</p>
          <a class="button ghost" href="/portal">Back to pass desk</a>
        </div>
      </section>
    `, user));
  }

  return sendHtml(res, 200, renderShell("Director Console", html`
    <section class="admin-band">
      <p class="eyebrow">Director console</p>
      <h1>Vault release approved</h1>
      <p class="flag">${escapeHtml(FLAG)}</p>
      <p class="muted">This console is only shown to passes with the director role.</p>
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

    // Intentional challenge bug: the legacy PATCH path trusts every submitted profile key.
    Object.assign(user, updates);

    if (acceptsJson(req)) {
      return sendJson(res, 200, {
        ok: true,
        mode: "legacy-patch",
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

  if (acceptsJson(req)) {
    return sendJson(res, 200, {
      ok: true,
      mode: "modern-post",
      ignored: ["role", "clearance", "isAdmin"],
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

function renderReleaseNotes(req, res) {
  sendHtml(res, 200, renderShell("Release Notes", html`
    <section class="notes">
      <p class="eyebrow">Gatehouse mobile compatibility</p>
      <h1>Release notes</h1>
      <article>
        <h2>1.8.2</h2>
        <p>Older venue tablets cannot send every HTTP verb through their proxy, so the profile endpoint accepts <code>_method=PATCH</code> and <code>X-HTTP-Method-Override</code> while those devices are being replaced.</p>
      </article>
      <article>
        <h2>1.8.1</h2>
        <p>The modern web desk now hides protected pass fields from the profile form. Directors can still approve credentials from the console.</p>
      </article>
      <article>
        <h2>1.7.9</h2>
        <p>Public badge notes were moved into the self-service profile desk.</p>
      </article>
    </section>
  `, currentUser(req)));
}

function renderApiDocs(req, res) {
  sendJson(res, 200, {
    service: "Gatehouse Pass profile API",
    routes: [
      {
        method: "POST",
        path: "/api/profile",
        description: "Modern web desk profile update."
      },
      {
        method: "PATCH",
        path: "/api/profile",
        description: "Legacy tablet profile update. Use _method or X-HTTP-Method-Override when PATCH is blocked by the client proxy."
      },
      {
        method: "GET",
        path: "/api/admin/flag",
        description: "Director role required."
      }
    ]
  });
}

function handleApiFlag(req, res) {
  const user = currentUser(req);
  if (!user) return sendJson(res, 401, { error: "login required" });
  if (user.role !== "admin") return sendJson(res, 403, { error: "director role required", role: user.role });
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
  if (req.method === "GET" && pathname === "/release-notes") return renderReleaseNotes(req, res);
  if (req.method === "GET" && pathname === "/api/docs") return renderApiDocs(req, res);
  if (req.method === "GET" && pathname === "/api/admin/flag") return handleApiFlag(req, res);

  if (req.method === "GET" && pathname === "/robots.txt") {
    return send(res, 200, "User-agent: *\nDisallow: /release-notes\nAllow: /api/docs\n", {
      "Content-Type": "text/plain; charset=utf-8"
    });
  }

  if (req.method === "GET" && pathname === "/sitemap.xml") {
    const host = `http://${req.headers.host || "localhost"}`;
    return send(res, 200, `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${host}/portal</loc></url>
  <url><loc>${host}/release-notes</loc></url>
  <url><loc>${host}/api/docs</loc></url>
  <url><loc>${host}/admin</loc></url>
</urlset>`, { "Content-Type": "application/xml; charset=utf-8" });
  }

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
        <p class="eyebrow">Not found</p>
        <h1>No pass desk here</h1>
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
  console.log(`Gatehouse Pass running at http://localhost:${PORT}`);
});
