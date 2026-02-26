// header-auth.js — shows login status in the header with display name

async function renderAuthHeader() {
  const user = await maybeUser();
  const el = document.getElementById("authStatus");
  if (!el) return;

  if (!user) {
    el.innerHTML = `<a href="login.html">Login</a>`;
  } else {
    const displayName = user.user_metadata?.display_name || user.email || "Account";
    el.innerHTML = `
      <span class="muted" style="margin-right:8px;font-size:13px;">👤 ${escapeHtmlHeader(displayName)}</span>
      <a href="#" onclick="logout(); return false;">Logout</a>
    `;
  }
}

function escapeHtmlHeader(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
