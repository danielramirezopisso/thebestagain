// login.js — login + register with display name + email confirmation

function showTab(tab) {
  const isLogin = tab === "login";

  document.getElementById("loginForm").style.display    = isLogin ? "block" : "none";
  document.getElementById("registerForm").style.display = isLogin ? "none"  : "block";
  document.getElementById("confirmSent").style.display  = "none";

  document.getElementById("tabLogin").classList.toggle("active", isLogin);
  document.getElementById("tabRegister").classList.toggle("active", !isLogin);

  // Clear statuses
  document.getElementById("loginStatus").textContent    = "";
  document.getElementById("registerStatus").textContent = "";
}

/* ── LOGIN ── */
async function doLogin() {
  const statusEl = document.getElementById("loginStatus");
  const email    = document.getElementById("l_email").value.trim();
  const password = document.getElementById("l_password").value;

  if (!email || !password) {
    statusEl.textContent = "Email and password are required.";
    return;
  }

  statusEl.className = "auth-status";
  statusEl.textContent = "Signing in…";

  const { error } = await sb.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.message.includes("Email not confirmed")) {
      statusEl.textContent = "Please confirm your email first — check your inbox.";
    } else if (error.message.includes("Invalid login")) {
      statusEl.textContent = "Wrong email or password.";
    } else {
      statusEl.textContent = error.message;
    }
    return;
  }

  statusEl.className = "auth-status success";
  statusEl.textContent = "Signed in ✅ Redirecting…";

  // Redirect to where they came from, or home
  const redirect = new URLSearchParams(window.location.search).get("redirect") || "index.html";
  window.location.href = redirect;
}

/* ── REGISTER ── */
async function doRegister() {
  const statusEl  = document.getElementById("registerStatus");
  const name      = document.getElementById("r_name").value.trim();
  const email     = document.getElementById("r_email").value.trim();
  const password  = document.getElementById("r_password").value;
  const password2 = document.getElementById("r_password2").value;

  if (!name) { statusEl.textContent = "Display name is required."; return; }
  if (!email) { statusEl.textContent = "Email is required."; return; }
  if (!password) { statusEl.textContent = "Password is required."; return; }
  if (password.length < 6) { statusEl.textContent = "Password must be at least 6 characters."; return; }
  if (password !== password2) { statusEl.textContent = "Passwords don't match."; return; }

  statusEl.className = "auth-status";
  statusEl.textContent = "Creating account…";

  const { error } = await sb.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: name },
      // Supabase will send a confirmation email automatically
    }
  });

  if (error) {
    if (error.message.includes("already registered")) {
      statusEl.textContent = "This email is already registered. Try signing in.";
    } else {
      statusEl.textContent = error.message;
    }
    return;
  }

  // Show confirmation screen
  document.getElementById("registerForm").style.display = "none";
  document.getElementById("confirmSent").style.display  = "block";
  document.getElementById("confirmEmail").textContent   = email;
  document.getElementById("tabRegister").classList.remove("active");
}

/* ── Enter key ── */
document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const loginVisible = document.getElementById("loginForm").style.display !== "none";
  if (loginVisible) doLogin();
  else doRegister();
});

/* ── If already logged in, redirect away ── */
(async function checkAlreadyLoggedIn() {
  const user = await maybeUser();
  if (user) window.location.href = "index.html";
