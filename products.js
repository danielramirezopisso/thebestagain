// products.js — Products list + add product only (requires login)
// Product identity = (category_id, brand_id). If exists, redirect instead of creating new.

let PRODUCT_CATEGORIES = [];
let BRANDS = [];

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setPStatus(msg) {
  const el = document.getElementById("p_status");
  if (el) el.textContent = msg || "";
}

function setProductsStatus(msg) {
  const el = document.getElementById("productsStatus");
  if (el) el.textContent = msg || "";
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

function overallText(avg, cnt) {
  const a = Number(avg ?? 0);
  const c = Number(cnt ?? 0);
  if (!c) return "—/10 (0 votes)";
  return `${a.toFixed(2)}/10 (${c} vote${c === 1 ? "" : "s"})`;
}

function brandNameById(id) {
  return (BRANDS.find(b => String(b.id) === String(id))?.name) || "";
}

function categoryNameById(id) {
  return (PRODUCT_CATEGORIES.find(c => String(c.id) === String(id))?.name) || "";
}

// Auto title for product markers
function makeProductTitle(category_id, brand_id) {
  const c = categoryNameById(category_id);
  const b = brandNameById(brand_id);
  return `${c} · ${b}`.trim();
}

async function initProductsPage() {
  const user = await maybeUser();

  // Hide create form if logged out
  if (!user) {
    const card = document.getElementById("productCreateCard");
    if (card) {
      card.innerHTML = `
        <h2>Add product</h2>
        <p class="muted">Please <a href="login.html">login</a> to add products.</p>
      `;
    }
  }

  fillSelect1to10("p_vote", 7);

  setProductsStatus("Loading brands/categories…");

  // Brands
  const { data: brandData, error: brandErr } = await sb
    .from("brands")
    .select("id,name,is_active")
    .eq("is_active", true)
    .order("id", { ascending: true });

  if (brandErr) {
    setProductsStatus("Error brands: " + brandErr.message);
    return;
  }
  BRANDS = brandData || [];

  const brandSel = document.getElementById("p_brand");
  if (brandSel) {
    brandSel.innerHTML = BRANDS
      .map(b => `<option value="${escapeHtml(b.id)}">${escapeHtml(b.name)}</option>`)
      .join("");
  }

  // Product categories only
  const { data: catData, error: catErr } = await sb
    .from("categories")
    .select("id,name,icon_url,is_active,for_products")
    .eq("is_active", true)
    .eq("for_products", true)
    .order("id", { ascending: true });

  if (catErr) {
    setProductsStatus("Error categories: " + catErr.message);
    return;
  }
  PRODUCT_CATEGORIES = catData || [];

  const catSel = document.getElementById("p_category");
  if (catSel) {
    catSel.innerHTML = PRODUCT_CATEGORIES
      .map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`)
      .join("");
  }

  await reloadProducts();
}

async function reloadProducts() {
  setProductsStatus("Loading products…");

  const { data, error } = await sb
    .from("markers")
    .select("id,title,group_type,category_id,brand_id,rating_avg,rating_count,is_active")
    .eq("is_active", true)
    .eq("group_type", "product");

  if (error) {
    setProductsStatus("Error products: " + error.message);
    return;
  }

  const rows = (data || []).slice();
  rows.sort((a, b) => Number(b.rating_avg ?? 0) - Number(a.rating_avg ?? 0));

  if (!rows.length) {
    document.getElementById("productsWrap").innerHTML = `<p class="muted">No products yet.</p>`;
    setProductsStatus("Loaded 0 product(s).");
    return;
  }

  document.getElementById("productsWrap").innerHTML = `
    <table class="table">
      <thead>
        <tr>
          <th>Category</th>
          <th>Brand</th>
          <th>Overall</th>
          <th>Open</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(p => `
          <tr>
            <td>${escapeHtml(categoryNameById(p.category_id) || p.category_id || "")}</td>
            <td>${escapeHtml(brandNameById(p.brand_id) || "")}</td>
            <td>${escapeHtml(overallText(p.rating_avg, p.rating_count))}</td>
            <td><a href="marker.html?id=${encodeURIComponent(p.id)}">Open</a></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  setProductsStatus(`Loaded ${rows.length} product(s).`);
}

async function saveProduct() {
  const user = await requireAuth();
  if (!user) return;

  setPStatus("Saving…");

  const category_id = document.getElementById("p_category").value;
  const brand_id = document.getElementById("p_brand").value;
  const myVote = Number(document.getElementById("p_vote").value);

  if (!category_id) { setPStatus("Category required."); return; }
  if (!brand_id) { setPStatus("Brand required."); return; }
  if (!(myVote >= 1 && myVote <= 10)) { setPStatus("Vote must be 1–10."); return; }

  // 1) Check if product already exists (category+brand)
  const { data: existing, error: eErr } = await sb
    .from("markers")
    .select("id,is_active")
    .eq("group_type", "product")
    .eq("category_id", category_id)
    .eq("brand_id", brand_id)
    .maybeSingle();

  if (eErr) {
    setPStatus("Error checking existing product: " + eErr.message);
    return;
  }

  if (existing?.id) {
    setPStatus("Already exists ✅ Opening it…");
    window.location.href = `marker.html?id=${encodeURIComponent(existing.id)}`;
    return;
  }

  // 2) Create marker (auto title)
  const title = makeProductTitle(category_id, brand_id);

  const payload = {
    title,
    category_id,
    brand_id,
    group_type: "product",
    is_active: true,
    rating_manual: myVote, // legacy
    lat: null,
    lon: null,
    address: null
  };

  const { data: markerRow, error: mErr } = await sb
    .from("markers")
    .insert([payload])
    .select("id")
    .single();

  if (mErr) {
    // If DB uniqueness triggers, handle nicely
    if (String(mErr.code) === "23505") {
      setPStatus("Already exists ✅ Opening it…");
      const { data: again } = await sb
        .from("markers")
        .select("id")
        .eq("group_type", "product")
        .eq("category_id", category_id)
        .eq("brand_id", brand_id)
        .maybeSingle();

      if (again?.id) {
        window.location.href = `marker.html?id=${encodeURIComponent(again.id)}`;
        return;
      }
    }

    setPStatus("Error creating product: " + mErr.message);
    return;
  }

  // 3) Create your vote
  const { error: vErr } = await sb
    .from("votes")
    .insert([{
      marker_id: markerRow.id,
      user_id: user.id,
      vote: myVote,
      is_active: true
    }]);

  if (vErr) {
    setPStatus("Product saved ✅ but vote failed: " + vErr.message);
    window.location.href = `marker.html?id=${encodeURIComponent(markerRow.id)}`;
    return;
  }

  // 4) Redirect
  window.location.href = `marker.html?id=${encodeURIComponent(markerRow.id)}`;
}
