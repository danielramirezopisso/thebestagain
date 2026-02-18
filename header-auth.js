// header-auth.js — shows login status in the header

async function renderAuthHeader() {
  const user = await maybeUser();

  const el = document.getElementById("authStatus");
  if (!el) return;

  if (!user) {
    el.innerHTML = `<a href="login.html">Login</a>`;
  } else {
    const email = user.email || "logged in";
    el.innerHTML = `
      <span class="muted" style="margin-right:10px;">${email}</span>
      <a href="#" onclick="logout(); return false;">Logout</a>
    `;
  }
}
