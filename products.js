// products.js — Products list + add product only (requires login)

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

  // Load brands
  setProductsStatus("Loading brands/categories…");

  const { data: brandData, error: brandErr } = await sb
    .from("brands")
    .select("id,name")
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

  // Load product categories only
  const { data: catData, error: catErr } = await sb
    .from("categories")
    .select("id,name,icon_url")
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
    .select("id,title,group_type,category_id,brand_id,address,rating_avg,rating_count,is_active")
    .eq("is_active", true)
    .eq("group_type", "product");

  if (error) {
    setProductsStatus("Error products: " + error.message);
    return;
  }

  const rows = (data || []).slice();
  rows.sort((a, b) => Number(b.rating_avg ?? 0) - Number(a.rating_avg ?? 0));

  const brandName = {};
  BRANDS.forEach(b => brandName[String(b.id)] = b.name);

  const catName = {};
  PRODUCT_CATEGORIES.forEach(c => catName[String(c.id)] = c.name);

  if (!rows.length) {
    document.getElementById("productsWrap").innerHTML = `<p class="muted">No products yet.</p>`;
    setProductsStatus("Loaded 0 product(s).");
    return;
  }

  document.getElementById("productsWrap").innerHTML = `
    <table class="table">
      <thead>
        <tr>
          <th>Title</th>
          <th>Brand</th>
          <th>Category</th>
          <th>Overall</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(p => `
          <tr>
            <td><a href="marker.html?id=${encodeURIComponent(p.id)}">${escapeHtml(p.title)}</a></td>
            <td>${escapeHtml(brandName[String(p.brand_id)] || "")}</td>
            <td>${escapeHtml(catName[String(p.category_id)] || p.category_id || "")}</td>
            <td>${escapeHtml(overallText(p.rating_avg, p.rating_count))}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  setProductsStatus(`Loaded ${rows.length} product(s).`);
}

async function saveProduct() {
  const user = await requireAuth(); // forces login if not logged
  if (!user) return;

  setPStatus("Saving…");

  const title = document.getElementById("p_title").value.trim();
  const category_id = document.getElementById("p_category").value;
  const brand_id = document.getElementById("p_brand").value;
  const myVote = Number(document.getElementById("p_vote").value);

  if (!title) { setPStatus("Title required."); return; }
  if (!brand_id) { setPStatus("Brand is required."); return; }
  if (!(myVote >= 1 && myVote <= 10)) { setPStatus("Vote must be 1–10."); return; }

  // 1) Create product marker
  const payload = {
    title,
    category_id,
    brand_id,               // ✅ required for product
    group_type: "product",
    is_active: true,
    rating_manual: myVote,  // legacy field (ok to keep)
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
    setPStatus("Error creating product: " + mErr.message);
    return;
  }

  // 2) Create your vote
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

  // 3) Redirect to marker page
  window.location.href = `marker.html?id=${encodeURIComponent(markerRow.id)}`;
}
