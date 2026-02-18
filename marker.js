// marker.js — Release 6 (edit + deactivate) + Release 7 (my vote) + soft delete votes (is_active)

// const SUPABASE_URL = "https://pwlskdjmgqxikbamfshj.supabase.co";
// const SUPABASE_ANON_KEY = "sb_publishable_OIK8RJ8IZgHY0MW6FKqD6Q_yOm4YcmA";
// const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let MARKER_ID = null;
let CURRENT_MARKER = null;
let CATEGORIES = [];
let CURRENT_VOTE_ROW = null;

function qs(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function setStatus(msg) {
  const el = document.getElementById("pageStatus");
  if (el) el.textContent = msg || "";
}

function setVoteStatus(msg) {
  const el = document.getElementById("voteStatus");
  if (el) el.textContent = msg || "";
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(iso) {
  if (!iso) return "";
  return iso.replace("T", " ").slice(0, 19);
}

function fillSelect1to10(selectId, defaultValue = 7) {
  const sel = document.getElementById(selectId);
  if (!sel) return;

  sel.innerHTML = "";
  for (let i = 1; i <= 10; i++) {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = String(i);
    if (i === defaultValue) opt.selected = true;
    sel.appendChild(opt);
  }
}

async function initMarkerPage() {
  const user = await maybeUser();
  if (!user) {
    const v = document.getElementById("voteSection");
    if (v) v.style.display = "none";
  
    const b1 = document.getElementById("btnEdit");
    const b2 = document.getElementById("btnDeactivate");
    if (b1) b1.style.display = "none";
    if (b2) b2.style.display = "none";
  }
  MARKER_ID = qs("id");
  if (!MARKER_ID) {
    document.getElementById("markerTitle").textContent = "Missing marker id";
    document.getElementById("markerDetails").innerHTML =
      `<p>Open this page like: <code>marker.html?id=YOUR_MARKER_ID</code></p>`;
    return;
  }

  setStatus("Loading…");
  setVoteStatus("");

  fillSelect1to10("my_vote", 7);
  fillSelect1to10("e_rating", 7);

  const cats = await sb
    .from("categories")
    .select("id,name,icon_url")
    .eq("is_active", true)
    .order("id", { ascending: true });

  if (cats.error) {
    setStatus("Error loading categories: " + cats.error.message);
    return;
  }
  CATEGORIES = cats.data || [];

  const { data: marker, error } = await sb
    .from("markers")
    .select("id,title,group_type,category_id,rating_manual,address,lat,lon,is_active,created_at")
    .eq("id", MARKER_ID)
    .single();

  if (error || !marker) {
    document.getElementById("markerTitle").textContent = "Marker not found";
    document.getElementById("markerDetails").textContent = error ? error.message : "";
    setStatus("");
    return;
  }

  CURRENT_MARKER = marker;
  renderView();
  fillEditForm();
  await loadMyVote();
  setStatus("");
}

function getCategoryById(id) {
  return CATEGORIES.find(c => c.id === id) || null;
}

function renderView() {
  const m = CURRENT_MARKER;
  const cat = getCategoryById(m.category_id);
  const categoryName = cat ? cat.name : m.category_id;
  const iconUrl = cat ? (cat.icon_url || "") : "";

  document.getElementById("markerTitle").textContent = m.title;
  document.getElementById("markerSubtitle").textContent =
    `${m.group_type} · ${categoryName} · ${m.rating_manual}/10`;

  const latLon =
    (m.lat !== null && m.lon !== null) ? `${m.lat}, ${m.lon}` : "";

  const iconHtml = iconUrl
    ? `<img src="${escapeHtml(iconUrl)}" alt="" style="width:22px;height:22px;vertical-align:middle;margin-right:6px;" />`
    : "";

  document.getElementById("markerDetails").innerHTML = `
    <p><b>Category:</b> ${iconHtml}${escapeHtml(categoryName)}</p>
    <p><b>Group:</b> ${escapeHtml(m.group_type)}</p>
    <p><b>Rating:</b> ${escapeHtml(String(m.rating_manual))}/10</p>
    <p><b>Address:</b> ${escapeHtml(m.address || "")}</p>
    <p><b>Lat/Lon:</b> ${escapeHtml(latLon)}</p>
    <p><b>Active:</b> ${escapeHtml(String(m.is_active))}</p>
    <p><b>Created:</b> ${escapeHtml(formatDate(m.created_at))}</p>
    <p><b>ID:</b> <span class="muted">${escapeHtml(m.id)}</span></p>
  `;

  const isInactive = !m.is_active;
  document.getElementById("btnEdit").disabled = isInactive;
  document.getElementById("btnDeactivate").disabled = isInactive;
  if (isInactive) setStatus("This marker is inactive (deactivated).");
}

function fillEditForm() {
  const m = CURRENT_MARKER;

  const catSel = document.getElementById("e_category");
  if (catSel) {
    catSel.innerHTML = CATEGORIES
      .map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`)
      .join("");
    catSel.value = m.category_id || "";
  }

  fillSelect1to10("e_rating", Number(m.rating_manual) || 7);

  document.getElementById("e_title").value = m.title || "";
  document.getElementById("e_group_type").value = m.group_type || "place";
  document.getElementById("e_address").value = m.address || "";
  document.getElementById("e_lat").value = (m.lat ?? "");
  document.getElementById("e_lon").value = (m.lon ?? "");
}

function enterEditMode() {
  document.getElementById("viewCard").style.display = "none";
  document.getElementById("editCard").style.display = "block";

  document.getElementById("btnEdit").style.display = "none";
  document.getElementById("btnDeactivate").style.display = "none";
  document.getElementById("btnSave").style.display = "inline-block";
  document.getElementById("btnCancel").style.display = "inline-block";

  setStatus("");
}

function cancelEdits() {
  fillEditForm();
  document.getElementById("viewCard").style.display = "block";
  document.getElementById("editCard").style.display = "none";

  document.getElementById("btnEdit").style.display = "inline-block";
  document.getElementById("btnDeactivate").style.display = "inline-block";
  document.getElementById("btnSave").style.display = "none";
  document.getElementById("btnCancel").style.display = "none";

  setStatus("");
}

async function saveEdits() {
  setStatus("Saving changes…");

  const title = document.getElementById("e_title").value.trim();
  const group_type = document.getElementById("e_group_type").value;
  const category_id = document.getElementById("e_category").value;
  const rating_manual = Number(document.getElementById("e_rating").value);
  const address = document.getElementById("e_address").value.trim();

  const latRaw = document.getElementById("e_lat").value.trim();
  const lonRaw = document.getElementById("e_lon").value.trim();

  const lat = latRaw === "" ? null : Number(latRaw);
  const lon = lonRaw === "" ? null : Number(lonRaw);

  if (!title) { setStatus("Title required."); return; }
  if (!(rating_manual >= 1 && rating_manual <= 10)) { setStatus("Rating must be 1–10."); return; }
  if ((latRaw !== "" && Number.isNaN(lat)) || (lonRaw !== "" && Number.isNaN(lon))) {
    setStatus("Lat/Lon must be numbers (or empty).");
    return;
  }

  const patch = { title, group_type, category_id, rating_manual, address, lat, lon };

  const { data, error } = await sb
    .from("markers")
    .update(patch)
    .eq("id", MARKER_ID)
    .select("id,title,group_type,category_id,rating_manual,address,lat,lon,is_active,created_at")
    .single();

  if (error) {
    setStatus("Error: " + error.message);
    return;
  }

  CURRENT_MARKER = data;
  renderView();
  cancelEdits();
  setStatus("Saved ✅");
}

async function deactivateMarker() {
  const ok = confirm("Deactivate this marker? It will disappear from list/map.");
  if (!ok) return;

  setStatus("Deactivating…");

  const { data, error } = await sb
    .from("markers")
    .update({ is_active: false })
    .eq("id", MARKER_ID)
    .select("id,title,group_type,category_id,rating_manual,address,lat,lon,is_active,created_at")
    .single();

  if (error) {
    setStatus("Error: " + error.message);
    return;
  }

  CURRENT_MARKER = data;
  renderView();
  cancelEdits();
  setStatus("Deactivated ✅");
}

// --------------------
// Release 7: My vote (soft delete)
// --------------------
async function loadMyVote() {
  setVoteStatus("Loading your vote…");

  const { data, error } = await sb
    .from("votes")
    .select("id,marker_id,vote,is_active")
    .eq("marker_id", MARKER_ID)
    .maybeSingle();

  if (error) {
    setVoteStatus("Error loading vote: " + error.message);
    return;
  }

  CURRENT_VOTE_ROW = data || null;

  if (CURRENT_VOTE_ROW && CURRENT_VOTE_ROW.is_active) {
    const v = Number(CURRENT_VOTE_ROW.vote);
    document.getElementById("my_vote").value = String(Math.round(v));
    setVoteStatus(`Saved vote: ${CURRENT_VOTE_ROW.vote}`);
  } else {
    setVoteStatus("No active vote yet.");
  }
}

async function saveMyVote() {
  const v = Number(document.getElementById("my_vote").value);
  if (!(v >= 1 && v <= 10)) {
    setVoteStatus("Vote must be 1–10.");
    return;
  }

  setVoteStatus("Saving…");

  // Upsert: create if missing, otherwise update existing row
  const { error } = await sb
    .from("votes")
    .upsert([{ marker_id: MARKER_ID, vote: v, is_active: true }], { onConflict: "marker_id" });

  if (error) {
    setVoteStatus("Error: " + error.message);
    return;
  }

  await loadMyVote();
  setVoteStatus("Saved ✅");
}

async function clearMyVote() {
  if (!confirm("Remove your vote for this marker?")) return;

  setVoteStatus("Removing…");

  // Soft delete: keep row, set is_active=false (preserve old vote value if it exists)
  const existingVote = CURRENT_VOTE_ROW?.vote ?? 1;

  const { error } = await sb
    .from("votes")
    .upsert([{ marker_id: MARKER_ID, vote: existingVote, is_active: false }], { onConflict: "marker_id" });

  if (error) {
    setVoteStatus("Error: " + error.message);
    return;
  }

  await loadMyVote();
  setVoteStatus("Removed ✅ (soft delete)");
}
