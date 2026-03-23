// wishlist-btn.js — shared heart button logic
// Depends on: sb (supabase client), maybeUser() — both from auth.js

// In-memory cache of wishlisted marker IDs for the current session
let WL_SET  = new Set();   // marker ids the user has wishlisted
let WL_READY = false;      // true once we've fetched from DB

/* ── Load user's wishlist into WL_SET ── */
async function wlLoad() {
  if (WL_READY) return;
  const user = await maybeUser();
  if (!user) { WL_READY = true; return; }
  const { data } = await sb
    .from("wishlists")
    .select("marker_id")
    .eq("user_id", user.id);
  WL_SET = new Set((data || []).map(r => r.marker_id));
  WL_READY = true;
  _wlRefreshAll();
}

/* ── Toggle wishlist for a marker ── */
async function wlToggle(markerId, btn) {
  const user = await maybeUser();
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const wasLiked = WL_SET.has(markerId);
  // Optimistic UI
  if (wasLiked) {
    WL_SET.delete(markerId);
  } else {
    WL_SET.add(markerId);
  }
  _wlSetBtnState(btn, !wasLiked);

  if (wasLiked) {
    await sb.from("wishlists")
      .delete()
      .eq("user_id", user.id)
      .eq("marker_id", markerId);
  } else {
    await sb.from("wishlists")
      .upsert({ user_id: user.id, marker_id: markerId }, { onConflict: "user_id,marker_id" });
  }

  // Refresh all buttons for this marker on the page
  _wlRefreshAll();
}

/* ── Render all heart buttons on the page ── */
function _wlRefreshAll() {
  document.querySelectorAll("[data-wl-id]").forEach(btn => {
    const id = btn.dataset.wlId;
    _wlSetBtnState(btn, WL_SET.has(id));
  });
}

function _wlSetBtnState(btn, liked) {
  btn.classList.toggle("wl-active", liked);
  btn.setAttribute("aria-label", liked ? "Remove from wishlist" : "Add to wishlist");
  btn.title = liked ? "Remove from wishlist" : "Save to wishlist";
}

/* ── Generate heart button HTML ── */
// Returns an <button> HTML string with data-wl-id set
// Call wlLoad() on page init so the state is correct
function wlBtnHtml(markerId, extraClass = "") {
  const liked = WL_SET.has(markerId);
  return `<button
    class="wl-btn${extraClass ? " " + extraClass : ""}${liked ? " wl-active" : ""}"
    data-wl-id="${markerId}"
    onclick="event.stopPropagation(); wlToggle('${markerId}', this)"
    aria-label="${liked ? "Remove from wishlist" : "Add to wishlist"}"
    title="${liked ? "Remove from wishlist" : "Save to wishlist"}"
  >🏷️</button>`;
}

/* ── Init: call on every page that shows hearts ── */
async function wlInit() {
  await wlLoad();
  _wlRefreshAll();
}
