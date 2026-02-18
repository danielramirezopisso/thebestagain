// votes.js — Release 7: show my votes high -> low

const SUPABASE_URL = "https://pwlskdjmgqxikbamfshj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_OIK8RJ8IZgHY0MW6FKqD6Q_yOm4YcmA";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function setStatus(msg) {
  document.getElementById("votesStatus").textContent = msg || "";
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fmt(iso) {
  return (iso || "").replace("T", " ").slice(0, 19);
}

async function initVotesPage() {
  await requireAuth();
  setStatus("Loading…");

  // Join votes -> markers -> categories for display
  const { data, error } = await sb
  .from("votes")
  .select(`
    id,
    vote,
    updated_at,
    marker_id,
    is_active,
    markers (
      id,
      title,
      group_type,
      category_id,
      is_active,
      categories ( name )
    )
  `)
  .eq("is_active", true)
  .order("vote", { ascending: false })
  .order("updated_at", { ascending: false });


  if (error) {
    setStatus("Error: " + error.message);
    return;
  }

  const rows = (data || [])
    .filter(v => v.markers); // safety

  if (!rows.length) {
    setStatus("No votes yet. Open a marker and set your vote.");
    document.getElementById("votesTable").innerHTML = "";
    return;
  }

  setStatus("");

  document.getElementById("votesTable").innerHTML = `
    <table style="width:100%; border-collapse:collapse;">
      <thead>
        <tr>
          <th style="text-align:left; border-bottom:1px solid #e6e6e6; padding:8px;">Vote</th>
          <th style="text-align:left; border-bottom:1px solid #e6e6e6; padding:8px;">Title</th>
          <th style="text-align:left; border-bottom:1px solid #e6e6e6; padding:8px;">Group</th>
          <th style="text-align:left; border-bottom:1px solid #e6e6e6; padding:8px;">Category</th>
          <th style="text-align:left; border-bottom:1px solid #e6e6e6; padding:8px;">Updated</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(v => {
          const m = v.markers;
          const cat = m.categories?.name || "";
          const link = `marker.html?id=${encodeURIComponent(m.id)}`;
          const inactiveBadge = m.is_active ? "" : ` <span class="muted">(inactive)</span>`;
          return `
            <tr>
              <td style="padding:8px; border-bottom:1px solid #f0f0f0;"><b>${escapeHtml(v.vote)}</b></td>
              <td style="padding:8px; border-bottom:1px solid #f0f0f0;">
                <a href="${link}">${escapeHtml(m.title)}</a>${inactiveBadge}
              </td>
              <td style="padding:8px; border-bottom:1px solid #f0f0f0;">${escapeHtml(m.group_type)}</td>
              <td style="padding:8px; border-bottom:1px solid #f0f0f0;">${escapeHtml(cat)}</td>
              <td style="padding:8px; border-bottom:1px solid #f0f0f0;">${escapeHtml(fmt(v.updated_at))}</td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;
}
