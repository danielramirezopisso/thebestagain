// traction.js — handles all "coming soon" interest capture popups
// Used by: marker.html, products.html, map.html

/* ══════════════════════════════════════════════════════
   POPUP CONFIG per type
══════════════════════════════════════════════════════ */
const TRACTION_CONFIG = {
  claim: {
    emoji:    "🏢",
    title:    "Claim this place",
    body:     "Own or manage this venue? We're building tools to help you connect with your customers here.",
    cta:      "Notify me when it's ready",
    table:    "business_interest",
    field:    "marker_id",
  },
  preorder: {
    emoji:    "🛒",
    title:    "Pre-order coming soon",
    body:     "Imagine reserving a tiramisù at this spot before you even arrive — we're working on it.",
    cta:      "Notify me when it launches",
    table:    "purchase_interest",
    field:    "marker_id",
    extra:    { type: "preorder" },
  },
  top5: {
    emoji:    "🍽️",
    title:    "Taste the Top 5",
    body:     "We're curating tasting sets of the highest-rated products — so you can taste and rank them yourself at home.",
    cta:      "Notify me when it's ready",
    table:    "purchase_interest",
    field:    "category_id",
    extra:    { type: "top5" },
  },
  request: {
    emoji:    "💡",
    title:    "Can't find what you're looking for?",
    body:     "Tell us what category or brand is missing — we read every submission.",
    cta:      "Send request",
    table:    "feature_requests",
    field:    null,  // text-based, different handling
    isRequest: true,
  },
};

/* ══════════════════════════════════════════════════════
   STATE
══════════════════════════════════════════════════════ */
let _tractionType    = null;
let _tractionRefId   = null; // marker_id or category_id

/* ══════════════════════════════════════════════════════
   OPEN
══════════════════════════════════════════════════════ */
function openTraction(type, refId, label) {
  _tractionType  = type;
  _tractionRefId = refId || null;

  const cfg = TRACTION_CONFIG[type];
  if (!cfg) { console.error("Unknown traction type:", type); return; }

  document.getElementById("trEmoji").textContent      = cfg.emoji;
  document.getElementById("trTitle").textContent      = cfg.title;

  // Dynamic body text: for preorder, use the category name if provided
  let body = cfg.body;
  if (type === "preorder" && label) {
    body = `Want to pre-order a ${label} here before you arrive? We're building this feature — leave your email and we'll let you know when it launches.`;
  }
  document.getElementById("trBody").textContent       = body;

  // Always fully reset the form state
  const submitBtn = document.getElementById("trSubmitBtn");
  submitBtn.textContent  = cfg.cta;
  submitBtn.style.display = "";
  submitBtn.disabled     = false;
  document.getElementById("trSkipBtn").textContent    = "Maybe later";
  document.getElementById("trEmail").value            = "";
  document.getElementById("trRequestText").value      = "";
  document.getElementById("trStatus").textContent     = "";
  document.getElementById("trStatus").style.color     = "";

  // Pre-fill email if user is logged in (non-blocking)
  if (typeof maybeUser === "function") {
    maybeUser().then(user => {
      if (user?.email) {
        const el = document.getElementById("trEmail");
        if (el && !el.value) el.value = user.email;
      }
    }).catch(() => {});
  }

  document.getElementById("tractionOverlay").classList.add("active");
  setTimeout(() => { const el = document.getElementById("trEmail"); if (el) el.focus(); }, 120);
}

function closeTraction() {
  document.getElementById("tractionOverlay").classList.remove("active");
  _tractionType  = null;
  _tractionRefId = null;
}

/* ══════════════════════════════════════════════════════
   SUBMIT
══════════════════════════════════════════════════════ */
async function submitTraction() {
  const cfg   = TRACTION_CONFIG[_tractionType];
  const email = document.getElementById("trEmail").value.trim();
  const text  = document.getElementById("trRequestText").value.trim();
  const btn   = document.getElementById("trSubmitBtn");
  const status = document.getElementById("trStatus");

  if (!email || !email.includes("@")) {
    status.textContent = "Please enter a valid email.";
    status.style.color = "#c0392b";
    return;
  }
  if (cfg.isRequest && !text) {
    status.textContent = "Please describe what you're looking for.";
    status.style.color = "#c0392b";
    return;
  }

  btn.disabled    = true;
  btn.textContent = "Sending…";
  status.textContent = "";

  try {
    let payload = { email };

    if (cfg.isRequest) {
      // Feature request
      payload.text = text;
      payload.type = "other";
      const user = await maybeUser();
      if (user) payload.user_id = user.id;
    } else {
      // Interest capture
      if (cfg.field && _tractionRefId) payload[cfg.field] = _tractionRefId;
      if (cfg.extra) Object.assign(payload, cfg.extra);
    }

    const { error } = await sb.from(cfg.table).insert([payload]);

    if (error) throw error;

    // Success state
    document.getElementById("trEmoji").textContent  = "✅";
    document.getElementById("trTitle").textContent  = "You're on the list!";
    document.getElementById("trBody").textContent   = "We'll let you know as soon as this is ready.";
    document.getElementById("trEmailArea").style.display   = "none";
    document.getElementById("trRequestArea").style.display = "none";
    document.getElementById("trSubmitBtn").style.display   = "none";
    document.getElementById("trSkipBtn").textContent       = "Close";

  } catch (err) {
    console.error("Traction submit error:", err);
    status.textContent = "Something went wrong. Try again.";
    status.style.color = "#c0392b";
    btn.disabled    = false;
    btn.textContent = cfg.cta;
  }
}

/* ══════════════════════════════════════════════════════
   KEYBOARD
══════════════════════════════════════════════════════ */
document.addEventListener("keydown", e => {
  if (e.key === "Escape") closeTraction();
});
