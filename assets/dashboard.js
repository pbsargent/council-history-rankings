"use strict";

const nf = new Intl.NumberFormat("en-US");
const pct = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1, minimumFractionDigits: 1 });
const pct0 = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 0 });
const dateFmt = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" });

const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
})[character]);

const formatNumber = (value) => value == null ? "—" : nf.format(Math.round(value));
const formatPct = (value) => value == null ? "—" : pct.format(value);
const formatPct0 = (value) => value == null ? "—" : pct0.format(value);
const formatSigned = (value) => value == null ? "—" : `${value > 0 ? "+" : ""}${nf.format(Math.round(value))}`;
const formatSignedPct = (value) => value == null ? "—" : `${value > 0 ? "+" : ""}${pct.format(value)}`;
const formatRank = (value) => value == null ? "—" : `#${nf.format(value)}`;
const tone = (value, good = 0, warn = -0.05) => value >= good ? "good" : value >= warn ? "warning" : "danger";
const classForValue = (value) => value > 0 ? "positive" : value < 0 ? "negative" : "muted";
const getQueryCouncil = () => new URLSearchParams(window.location.search).get("council");
const setQueryCouncil = (number) => {
  const url = new URL(window.location.href);
  url.searchParams.set("council", number);
  window.history.replaceState({}, "", url);
};

function councilByNumber(data, number) {
  return data.councils.find((council) => council.council_number === String(number)) || data.selected;
}

function councilOptions(data, selectedNumber) {
  return [...data.councils]
    .sort((a, b) => a.council.localeCompare(b.council))
    .map((council) => `<option value="${escapeHtml(council.council_number)}"${council.council_number === selectedNumber ? " selected" : ""}>${escapeHtml(council.council)}</option>`)
    .join("");
}

function kpiCard(label, value, sub, toneClass = "") {
  return `<article class="kpi ${toneClass}"><span class="kpi-label">${escapeHtml(label)}</span><strong class="kpi-value">${escapeHtml(value)}</strong><span class="kpi-sub">${escapeHtml(sub)}</span></article>`;
}

function metricLine(label, value, valueClass = "") {
  return `<div class="metric-line"><span>${escapeHtml(label)}</span><strong class="${valueClass}">${escapeHtml(value)}</strong></div>`;
}

function peerSet(data, selected) {
  return data.councils
    .filter((record) => record.council !== selected.council
      && record.units / selected.units >= 0.8 && record.units / selected.units <= 1.2
      && record.current_youth / selected.current_youth >= 0.8 && record.current_youth / selected.current_youth <= 1.2
      && record.tay / selected.tay >= 0.8 && record.tay / selected.tay <= 1.2)
    .sort((a, b) => b.yoy_pct - a.yoy_pct || a.council.localeCompare(b.council));
}

function chartRow(label, detail, value, maxAbs, valueFormatter = formatSignedPct) {
  const width = Math.max(2, Math.abs(value || 0) / Math.max(maxAbs, .001) * 100);
  return `<div class="chart-row">
    <div class="chart-label">${escapeHtml(label)}<span>${escapeHtml(detail)}</span></div>
    <div class="bar ${value < 0 ? "negative" : ""}" aria-hidden="true"><span style="width:${Math.min(100, width).toFixed(1)}%"></span></div>
    <strong class="bar-value ${classForValue(value)}">${escapeHtml(valueFormatter(value))}</strong>
  </div>`;
}

function updateSourceDates(data) {
  const sourceDate = dateFmt.format(new Date(data.metadata.source_downloaded_at));
  document.querySelectorAll("[data-source-date]").forEach((element) => { element.textContent = sourceDate; });
}

function sourceLink(data) {
  const url = escapeHtml(data.metadata.source_url);
  return `<a class="source-link" href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
}

function renderOverview(data, selected) {
  const peers = peerSet(data, selected);
  const percentile = Math.round((1 - (selected.yoy_rank - 1) / Math.max(1, data.national.council_count - 1)) * 100);
  document.getElementById("focusNote").textContent = `${selected.council} · ${peers.length} comparable councils`;
  document.getElementById("overviewKpis").innerHTML = [
    kpiCard("Current youth", formatNumber(selected.current_youth), `${formatSigned(selected.yoy_delta)} year over year`, tone(selected.yoy_pct)),
    kpiCard("YOY growth", formatSignedPct(selected.yoy_pct), `National: ${formatSignedPct(data.national.yoy_pct)}`, tone(selected.yoy_pct)),
    kpiCard("National rank", `#${selected.yoy_rank}`, `Top ${100 - percentile}% by growth`, "teal"),
    kpiCard("Registered units", formatNumber(selected.units), `${(selected.current_youth / selected.units).toFixed(1)} youth per unit`),
    kpiCard("TAY penetration", formatPct(selected.tay_pct), `Rank ${formatRank(selected.tay_rank)} where available`, "teal"),
    kpiCard("Urban population", formatPct(selected.urban_pct), "2020 Census urban population share", "teal"),
    kpiCard("Square miles", formatNumber(selected.square_miles), "Matched ZIP land area"),
    kpiCard("Peer set", formatNumber(peers.length), "±20% units, youth, and TAY", "teal"),
  ].join("");

  document.getElementById("peerTitle").textContent = `${selected.council.replace(/\s\d{3}$/, "")} compared with peers`;
  document.getElementById("peerCount").textContent = `${peers.length} peers`;
  const peerRows = [...peers, selected].sort((a, b) => b.yoy_pct - a.yoy_pct || a.council.localeCompare(b.council));
  const maxAbs = Math.max(...peerRows.map((record) => Math.abs(record.yoy_pct || 0)), .01);
  document.getElementById("peerChart").innerHTML = peerRows.length
    ? peerRows.map((record) => chartRow(
      record.council.replace(/\s\d{3}$/, ""),
      record.council === selected.council ? "Focus council" : `${formatNumber(record.current_youth)} youth · ${formatNumber(record.units)} units`,
      record.yoy_pct,
      maxAbs,
    )).join("")
    : '<div class="empty-state">No scale-matched peers were found.</div>';

  const peerAverage = peers.length ? peers.reduce((sum, record) => sum + record.yoy_pct, 0) / peers.length : null;
  const unitHealth = data.unit_metrics["All Units"].find((record) => record.council === selected.council);
  const signals = [
    {
      title: selected.yoy_pct >= data.national.yoy_pct ? "Growth is ahead of the national total" : "Growth trails the national total",
      body: `${selected.council} is ${formatSignedPct(selected.yoy_pct - data.national.yoy_pct)} versus the aggregate national rate.`,
    },
    {
      title: peerAverage == null ? "Peer comparison unavailable" : selected.yoy_pct >= peerAverage ? "Outperforming scale peers" : "Peer growth is stronger",
      body: peerAverage == null ? "No councils met both scale bands." : `The ${peers.length}-council peer average is ${formatSignedPct(peerAverage)}.`,
    },
    {
      title: selected.tay_pct == null ? "TAY context unavailable" : `TAY penetration ranks ${formatRank(selected.tay_rank)}`,
      body: selected.tay_pct == null ? "The workbook does not supply a TAY value for this council." : `${formatNumber(selected.current_youth)} current youth represent ${formatPct(selected.tay_pct)} of ${formatNumber(selected.tay)} TAY in the workbook's market context.`,
    },
    {
      title: unitHealth ? `${formatPct0(unitHealth.metric_low_rate)} of units score 0–2` : "Unit health data unavailable",
      body: unitHealth ? `Average unit metric is ${unitHealth.average_metric?.toFixed(2) ?? "—"}; ${formatPct0(unitHealth.trained_rate)} meet the workbook’s training signal.` : "The selected council has no matching unit metric record.",
    },
  ];
  document.getElementById("signals").innerHTML = signals.map((signal) => `<article class="signal"><strong>${escapeHtml(signal.title)}</strong><p>${escapeHtml(signal.body)}</p></article>`).join("");

  document.getElementById("growthRows").innerHTML = data.top_growth.map((record) => `<tr${record.council === selected.council ? ' class="focus-row"' : ""}><td>#${record.yoy_rank}</td><td><strong>${escapeHtml(record.council)}</strong></td><td class="num">${formatNumber(record.current_youth)}</td><td class="num ${classForValue(record.yoy_delta)}">${formatSigned(record.yoy_delta)}</td><td class="num ${classForValue(record.yoy_pct)}">${formatSignedPct(record.yoy_pct)}</td></tr>`).join("");

  document.getElementById("nationalContext").innerHTML = [
    metricLine("Councils ranked", formatNumber(data.national.council_count)),
    metricLine("Current youth", formatNumber(data.national.current_youth)),
    metricLine("TAY population", formatNumber(data.national.tay)),
    metricLine("TAY penetration", `${formatPct(data.national.tay_pct)} · ${formatNumber(data.national.tay_covered_councils)} councils`),
    metricLine("Registered units", formatNumber(data.national.units)),
    metricLine("YOY movement", formatSigned(data.national.yoy_delta), classForValue(data.national.yoy_delta)),
    metricLine("Aggregate growth", formatSignedPct(data.national.yoy_pct), classForValue(data.national.yoy_pct)),
    metricLine("Councils growing", `${formatNumber(data.national.positive_growth_councils)} of ${formatNumber(data.national.council_count)}`),
  ].join("");

  document.getElementById("sourceSummary").innerHTML = `${sourceLink(data)}<span>${escapeHtml(data.metadata.source_name)}, downloaded ${escapeHtml(dateFmt.format(new Date(data.metadata.source_downloaded_at)))}. Growth rates and ranks are recalculated from the workbook’s cached current, prior-year, and 2025 year-end council totals. TAY penetration is current youth divided by the workbook's TAY value where supplied.</span>`;
}

function initOverview(data) {
  const select = document.getElementById("councilSelect");
  let selected = councilByNumber(data, getQueryCouncil() || data.selected.council_number);
  select.innerHTML = councilOptions(data, selected.council_number);
  select.addEventListener("change", () => {
    selected = councilByNumber(data, select.value);
    setQueryCouncil(selected.council_number);
    renderOverview(data, selected);
  });
  renderOverview(data, selected);
}

function renderRankings(data) {
  const search = document.getElementById("rankingSearch").value.trim().toLowerCase();
  const scope = document.getElementById("rankingScope").value;
  const focus = councilByNumber(data, document.getElementById("rankingCouncil").value);
  const sort = document.getElementById("rankingSort").value;
  let rows = scope === "peers" ? [...peerSet(data, focus), focus] : [...data.councils];
  if (search) rows = rows.filter((record) => record.council.toLowerCase().includes(search) || record.council_number.includes(search));
  const sorters = {
    yoy_rank: (a, b) => a.yoy_rank - b.yoy_rank || a.council.localeCompare(b.council),
    yoy_pct_desc: (a, b) => b.yoy_pct - a.yoy_pct || a.council.localeCompare(b.council),
    current_youth_desc: (a, b) => b.current_youth - a.current_youth || a.council.localeCompare(b.council),
    year_end_rank: (a, b) => a.year_end_rank - b.year_end_rank || a.council.localeCompare(b.council),
    tay_rank: (a, b) => a.tay_rank - b.tay_rank || a.council.localeCompare(b.council),
    tay_pct_desc: (a, b) => b.tay_pct - a.tay_pct || a.council.localeCompare(b.council),
    urban_pct_desc: (a, b) => (b.urban_pct ?? -Infinity) - (a.urban_pct ?? -Infinity) || a.council.localeCompare(b.council),
    square_miles_desc: (a, b) => (b.square_miles ?? -Infinity) - (a.square_miles ?? -Infinity) || a.council.localeCompare(b.council),
    name: (a, b) => a.council.localeCompare(b.council),
  };
  rows.sort(sorters[sort]);
  document.getElementById("rankingCount").textContent = `${formatNumber(rows.length)} councils`;
  document.getElementById("rankingRows").innerHTML = rows.length ? rows.map((record) => `<tr${record.council === focus.council ? ' class="focus-row"' : ""}>
    <td>#${record.yoy_rank}</td><td><strong>${escapeHtml(record.council)}</strong></td><td class="num">${formatNumber(record.units)}</td><td class="num">${formatNumber(record.current_youth)}</td><td class="num">${formatNumber(record.prior_youth)}</td><td class="num ${classForValue(record.yoy_delta)}">${formatSigned(record.yoy_delta)}</td><td class="num ${classForValue(record.yoy_pct)}">${formatSignedPct(record.yoy_pct)}</td><td class="num ${classForValue(record.year_end_pct)}">${formatSignedPct(record.year_end_pct)}</td><td class="num">${formatPct(record.tay_pct)}</td><td class="num">${formatRank(record.tay_rank)}</td><td class="num">${formatPct(record.urban_pct)}</td><td class="num">${formatNumber(record.square_miles)}</td><td><a class="detail-link" href="overview.html?council=${record.council_number}">Overview</a></td>
  </tr>`).join("") : '<tr><td colspan="13" class="empty-state">No councils match these filters.</td></tr>';
  document.getElementById("rankingKpis").innerHTML = [
    kpiCard("Focus rank", `#${focus.yoy_rank}`, focus.council, "teal"),
    kpiCard("Focus growth", formatSignedPct(focus.yoy_pct), `${formatSigned(focus.yoy_delta)} youth`, tone(focus.yoy_pct)),
    kpiCard("Focus TAY penetration", formatPct(focus.tay_pct), `Rank ${formatRank(focus.tay_rank)}`, "teal"),
    kpiCard("National growth", formatSignedPct(data.national.yoy_pct), `${formatSigned(data.national.yoy_delta)} youth`, tone(data.national.yoy_pct)),
  ].join("");
}

function initRankings(data) {
  const focus = councilByNumber(data, getQueryCouncil() || data.selected.council_number);
  const councilSelect = document.getElementById("rankingCouncil");
  councilSelect.innerHTML = councilOptions(data, focus.council_number);
  ["rankingSearch", "rankingScope", "rankingCouncil", "rankingSort"].forEach((id) => {
    const element = document.getElementById(id);
    element.addEventListener(id === "rankingSearch" ? "input" : "change", () => {
      if (id === "rankingCouncil") setQueryCouncil(element.value);
      renderRankings(data);
    });
  });
  renderRankings(data);
}

function comparisonRow(label, selectedValue, nationalValue, formatter = formatPct0) {
  return `<div class="comparison-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(formatter(selectedValue))}</strong><strong>${escapeHtml(formatter(nationalValue))}</strong></div>`;
}

function renderHealth(data) {
  const council = councilByNumber(data, document.getElementById("healthCouncil").value);
  const program = document.getElementById("programSelect").value;
  const metric = data.unit_metrics[program].find((record) => record.council === council.council);
  const national = data.program_summaries[program];
  document.getElementById("healthProgramLabel").textContent = program;
  if (!metric) {
    document.getElementById("healthKpis").innerHTML = kpiCard("No data", "—", `${council.council} has no ${program.toLowerCase()} metric row.`, "warning");
    document.getElementById("metricMix").innerHTML = '<div class="empty-state">No unit metric record is available for this council and program.</div>';
    document.getElementById("healthComparison").innerHTML = "";
    document.getElementById("capabilityChart").innerHTML = "";
  } else {
    document.getElementById("healthKpis").innerHTML = [
      kpiCard("Average metric", metric.average_metric?.toFixed(2) ?? "—", `National ${national.average_metric?.toFixed(2) ?? "—"}`, metric.average_metric >= national.average_metric ? "good" : "warning"),
      kpiCard("Units", formatNumber(metric.units), `${program} in ${council.council_number}`),
      kpiCard("Metric 0–2", formatPct0(metric.metric_low_rate), `${formatNumber(metric.metric_low_count)} units`, metric.metric_low_rate <= national.metric_low_count / national.units ? "good" : "danger"),
      kpiCard("UL & CC trained", formatPct0(metric.trained_rate), `National ${formatPct0(national.trained_rate)}`, metric.trained_rate >= national.trained_rate ? "good" : "warning"),
      kpiCard("Youth growth", formatSignedPct(metric.youth_growth_rate), `${formatSigned(metric.youth_delta)} youth`, tone(metric.youth_growth_rate)),
      kpiCard("Youth", formatNumber(metric.youth_current), `${formatNumber(metric.youth_prior)} prior year`),
    ].join("");

    const total = (metric.metric_low_count || 0) + (metric.metric_mid_count || 0) + (metric.metric_high_count || 0);
    const width = (value) => total ? value / total * 100 : 0;
    document.getElementById("metricMix").innerHTML = `<div class="mix-total">
      <div class="mix-segment low"><strong>${formatNumber(metric.metric_low_count)}</strong><span>Metric 0–2 · ${formatPct0(metric.metric_low_rate)}</span></div>
      <div class="mix-segment mid"><strong>${formatNumber(metric.metric_mid_count)}</strong><span>Metric 3 · ${formatPct0(metric.metric_mid_rate)}</span></div>
      <div class="mix-segment high"><strong>${formatNumber(metric.metric_high_count)}</strong><span>Metric 4–5 · ${formatPct0(metric.metric_high_rate)}</span></div>
    </div><div class="stacked-bar" aria-label="Unit metric distribution"><span class="low" style="width:${width(metric.metric_low_count || 0)}%"></span><span class="mid" style="width:${width(metric.metric_mid_count || 0)}%"></span><span class="high" style="width:${width(metric.metric_high_count || 0)}%"></span></div>`;

    document.getElementById("healthComparison").innerHTML = `<div class="comparison-row comparison-head"><span>Measure</span><strong>Council</strong><strong>National</strong></div>${[
      comparisonRow("Average metric", metric.average_metric, national.average_metric, (value) => value == null ? "—" : value.toFixed(2)),
      comparisonRow("Metric 0–2", metric.metric_low_rate, national.metric_low_count / national.units),
      comparisonRow("UL & CC trained", metric.trained_rate, national.trained_rate),
      comparisonRow("Healthy size", metric.healthy_size_rate, national.healthy_size_rate),
      comparisonRow("Youth growth", metric.youth_growth_rate, national.youth_growth_rate, formatSignedPct),
    ].join("")}`;

    const capabilities = [
      ["UL & CC trained", metric.trained_rate],
      ["Exceeds small-unit threshold", metric.healthy_size_rate],
      ["Units with membership growth", metric.membership_growth_unit_rate],
      ["Advancement / leadership", metric.advancement_rate],
      ["Outdoor activity", metric.outdoor_rate],
      ["Imported “retention”*", metric.retention_rate],
    ];
    document.getElementById("capabilityChart").innerHTML = capabilities.map(([label, value]) => chartRow(label, `${program} workbook signal`, value, Math.max(1, value || 0), formatPct0)).join("");
  }

  const pin = council.pin;
  document.getElementById("pinProfile").innerHTML = pin ? [
    metricLine("PIN active", formatPct0(pin.pin_active_rate)),
    metricLine("Apply active", formatPct0(pin.apply_active_rate)),
    metricLine("Updated in a year", formatPct0(pin.updated_in_year_rate)),
    metricLine("Meeting day listed", formatPct0(pin.meeting_day_rate)),
    metricLine("Trial visit allowed", formatPct0(pin.trial_visit_rate)),
    metricLine("Unit fee listed", formatPct0(pin.unit_fee_rate)),
  ].join("") : '<div class="empty-state">No Unit PIN record is available.</div>';
}

function initHealth(data) {
  const council = councilByNumber(data, getQueryCouncil() || data.selected.council_number);
  const select = document.getElementById("healthCouncil");
  select.innerHTML = councilOptions(data, council.council_number);
  select.addEventListener("change", () => { setQueryCouncil(select.value); renderHealth(data); });
  document.getElementById("programSelect").addEventListener("change", () => renderHealth(data));
  renderHealth(data);
}

function initAbout(data) {
  document.getElementById("methodSource").innerHTML = `${sourceLink(data)}<span>${escapeHtml(data.metadata.source_name)} was downloaded ${escapeHtml(dateFmt.format(new Date(data.metadata.source_downloaded_at)))}. The site data was generated ${escapeHtml(dateFmt.format(new Date(data.metadata.generated_at)))} from cached workbook values.</span>`;
}

// CSTs are source assignments, never a fixed list of territories or councils.
function cstGroups(councils) {
  const groups = new Map();
  for (const council of councils) {
    const key = council.cst == null ? "unassigned" : String(council.cst);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(council);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true }));
}

const cstLabel = (key) => key === "unassigned" ? "Unassigned CST" : `CST ${key}`;

function membershipSummary(rows) {
  // Missing observations stay unavailable. TAY uses only the covered councils
  // for BOTH numerator and denominator, just like the national payload.
  const sum = (field) => rows.length && rows.every((row) => row[field] != null)
    ? rows.reduce((total, row) => total + row[field], 0) : null;
  const current = sum("current_youth");
  const prior = sum("prior_youth");
  const yearEnd = sum("year_end_youth");
  const covered = rows.filter((row) => row.tay != null && row.tay > 0);
  const tay = covered.reduce((total, row) => total + row.tay, 0);
  const tayYouth = covered.reduce((total, row) => total + row.current_youth, 0);
  const delta = current == null || prior == null ? null : current - prior;
  const yearEndDelta = current == null || yearEnd == null ? null : current - yearEnd;
  return { councils: rows.length, units: sum("units"), current_youth: current,
    prior_youth: prior, yoy_delta: delta, yoy_pct: prior > 0 && delta != null ? delta / prior : null,
    year_end_youth: yearEnd, year_end_delta: yearEndDelta,
    year_end_pct: yearEnd > 0 && yearEndDelta != null ? yearEndDelta / yearEnd : null,
    tay: covered.length ? tay : null, tay_pct: tay > 0 ? tayYouth / tay : null,
    tay_covered_councils: covered.length };
}

function cstCouncilDetail(data, council) {
  const membership = [
    metricLine("Current youth", formatNumber(council.current_youth)),
    metricLine("Prior-year youth", formatNumber(council.prior_youth)),
    metricLine("YOY change", `${formatSigned(council.yoy_delta)} · ${formatSignedPct(council.yoy_pct)}`, classForValue(council.yoy_delta)),
    metricLine("2025 year-end youth", formatNumber(council.year_end_youth)),
    metricLine("Change since year-end", `${formatSigned(council.year_end_delta)} · ${formatSignedPct(council.year_end_pct)}`, classForValue(council.year_end_delta)),
    metricLine("National YOY / year-end rank", `${formatRank(council.yoy_rank)} / ${formatRank(council.year_end_rank)}`),
    metricLine("Registered units", formatNumber(council.units)),
  ].join("");
  const market = [
    metricLine("TAY population", formatNumber(council.tay)),
    metricLine("TAY penetration", formatPct(council.tay_pct)),
    metricLine("National TAY rank", formatRank(council.tay_rank)),
    metricLine("Square miles", formatNumber(council.square_miles)),
    metricLine("Urban population (2020)", formatPct(council.urban_pct)),
  ].join("");
  const pin = council.pin;
  const pins = pin ? [
    metricLine("Unit PIN population", formatNumber(pin.units)),
    ...[["PIN active", "pin_active_rate"], ["Apply active", "apply_active_rate"],
      ["Fundraising active", "fundraising_active_rate"], ["Trial visit allowed", "trial_visit_rate"],
      ["Unit fee listed", "unit_fee_rate"], ["Updated in a year", "updated_in_year_rate"],
      ["Meeting day listed", "meeting_day_rate"]].map(([label, key]) => metricLine(label, formatPct0(pin[key]))),
  ].join("") : '<p class="muted">No Unit PIN record is available.</p>';
  const programs = Object.entries(data.unit_metrics).map(([program, rows]) => {
    const metric = rows.find((row) => row.council_number === council.council_number);
    if (!metric) return `<tr><th scope="row">${escapeHtml(program)}</th><td colspan="11">No metric record available</td></tr>`;
    return `<tr><th scope="row">${escapeHtml(program)}</th><td class="num">${formatNumber(metric.units)}</td><td class="num">${formatNumber(metric.youth_current)}</td><td class="num ${classForValue(metric.youth_growth_rate)}">${formatSignedPct(metric.youth_growth_rate)}</td><td class="num">${metric.average_metric?.toFixed(2) ?? "—"}</td><td class="num">${formatPct0(metric.metric_low_rate)}</td><td class="num">${formatPct0(metric.trained_rate)}</td><td class="num">${formatPct0(metric.healthy_size_rate)}</td><td class="num">${formatPct0(metric.membership_growth_unit_rate)}</td><td class="num">${formatPct0(metric.advancement_rate)}</td><td class="num">${formatPct0(metric.outdoor_rate)}</td><td class="num">${formatPct(metric.retention_rate)}</td></tr>`;
  }).join("");
  const packTroop = council.pack_troop;
  return `<div class="council-detail">
    <div class="council-detail-grid">
      <section><h3>Membership</h3><div class="metric-stack">${membership}</div></section>
      <section><h3>Market and geography</h3><div class="metric-stack">${market}</div></section>
      <section><h3>BeAScout indicators</h3><div class="metric-stack">${pins}</div></section>
    </div>
    ${packTroop ? `<p class="muted">Packs and troops combined: ${formatNumber(packTroop.units)} units · ${formatNumber(packTroop.current_youth)} youth · ${formatSignedPct(packTroop.yoy_pct)} YOY.</p>` : ""}
    <h3>Program Unit Metrics</h3>
    <p class="panel-intro">Program tabs use a separate population from membership totals above. Blank values remain unavailable. Scroll the table for all measures.</p>
    <div class="table-wrap program-table" tabindex="0" role="region" aria-label="Scrollable program metrics"><table><caption class="sr-only">Program Unit Metrics for ${escapeHtml(council.council)}</caption><thead><tr><th scope="col">Program</th><th scope="col" class="num">Units</th><th scope="col" class="num">Youth</th><th scope="col" class="num">YOY %</th><th scope="col" class="num">Avg metric</th><th scope="col" class="num">Metric 0–2</th><th scope="col" class="num">UL &amp; CC trained</th><th scope="col" class="num">Healthy size</th><th scope="col" class="num">Units growing</th><th scope="col" class="num">Advancement</th><th scope="col" class="num">Outdoor</th><th scope="col" class="num">Imported “retention”*</th></tr></thead><tbody>${programs}</tbody></table></div>
    <p class="metric-caveat">*Imported “retention” follows the workbook model; its cohort and measurement window are unverified. It is not a verified annual cohort-retention measure. Values above 100% are preserved.</p>
    <div class="board-actions"><a class="detail-link" href="overview.html?council=${encodeURIComponent(council.council_number)}">Council overview</a><a class="detail-link" href="unit-health.html?council=${encodeURIComponent(council.council_number)}">Explore unit health</a></div>
  </div>`;
}

function cstGrowthRow(label, detail, value, maxAbs) {
  const width = value == null ? 0 : Math.abs(value) / maxAbs * 50;
  const left = value < 0 ? 50 - width : 50;
  return `<div class="chart-row cst-chart-row"><div class="chart-label">${escapeHtml(label)}<span>${escapeHtml(detail)}</span></div><div class="cst-growth-track" aria-hidden="true"><span class="${value < 0 ? "decline" : "increase"}" style="left:${left.toFixed(3)}%;width:${width.toFixed(3)}%"></span></div><strong class="bar-value ${classForValue(value)}">${formatSignedPct(value)}</strong></div>`;
}

function renderCst(data, selectedCst) {
  const search = document.getElementById("cstSearch").value.trim().toLowerCase();
  const scoped = data.councils.filter((row) => selectedCst === "all" || (row.cst == null ? "unassigned" : String(row.cst)) === selectedCst);
  const rows = scoped.filter((row) => !search || row.council.toLowerCase().includes(search) || row.council_number.includes(search));
  const summary = membershipSummary(rows);
  const groups = cstGroups(rows);
  const label = selectedCst === "all" ? "All CSTs" : cstLabel(selectedCst);
  document.getElementById("cstScope").textContent = `${label} · ${rows.length} of ${scoped.length} councils${search ? " match the search" : " in this view"}. Summaries and charts use the councils shown.`;
  document.getElementById("cstKpis").innerHTML = [
    kpiCard("Councils", formatNumber(summary.councils), `${groups.length} ${groups.length === 1 ? "territory" : "territories"} in view`),
    kpiCard("Current youth", formatNumber(summary.current_youth), `${formatSigned(summary.yoy_delta)} year over year`, tone(summary.yoy_pct)),
    kpiCard("YOY growth", formatSignedPct(summary.yoy_pct), `Prior youth: ${formatNumber(summary.prior_youth)}`, tone(summary.yoy_pct)),
    kpiCard("Registered units", formatNumber(summary.units), "Council membership population"),
    kpiCard("Change since year-end", formatSignedPct(summary.year_end_pct), `${formatSigned(summary.year_end_delta)} since year-end 2025`, tone(summary.year_end_pct)),
    kpiCard("TAY penetration", formatPct(summary.tay_pct), `${summary.tay_covered_councils} of ${rows.length} councils with TAY`),
    kpiCard("TAY population", formatNumber(summary.tay), "Covered councils only"),
    kpiCard("Councils growing", formatNumber(rows.filter((row) => row.yoy_pct > 0).length), "Positive year-over-year membership growth"),
  ].join("");
  document.getElementById("cstChartTitle").textContent = selectedCst === "all" ? "Year-over-Year Growth by CST" : `${label} Council Growth`;
  const comparisons = selectedCst === "all"
    ? groups.map(([key, councils]) => ({ label: cstLabel(key), summary: membershipSummary(councils) }))
    : [...rows].sort((a, b) => (b.yoy_pct ?? -Infinity) - (a.yoy_pct ?? -Infinity) || a.council.localeCompare(b.council))
      .map((row) => ({ label: row.council, summary: row }));
  const maxAbs = Math.max(...comparisons.map((row) => Math.abs(row.summary.yoy_pct || 0)), .001);
  document.getElementById("cstGrowthChart").innerHTML = comparisons.length ? comparisons.map(({ label: name, summary: s }) => cstGrowthRow(name, `${formatNumber(s.current_youth)} youth · ${formatSigned(s.yoy_delta)} YOY`, s.yoy_pct, maxAbs)).join("") : '<div class="empty-state">No councils match this search.</div>';
  const sort = document.getElementById("cstSort").value;
  const sorters = {
    name: (a, b) => a.council.localeCompare(b.council),
    growth: (a, b) => (b.yoy_pct ?? -Infinity) - (a.yoy_pct ?? -Infinity) || a.council.localeCompare(b.council),
    youth: (a, b) => b.current_youth - a.current_youth || a.council.localeCompare(b.council),
  };
  document.getElementById("cstGroups").innerHTML = groups.length ? groups.map(([key, councils]) => {
    const total = membershipSummary(councils);
    return `<details class="territory-group"${selectedCst !== "all" || search ? " open" : ""}><summary class="territory-summary"><span><strong>${escapeHtml(cstLabel(key))}</strong><small>${councils.length} ${councils.length === 1 ? "council" : "councils"} · ${formatNumber(total.units)} units</small></span><span>${formatNumber(total.current_youth)} youth</span><span class="${classForValue(total.yoy_pct)}">${formatSignedPct(total.yoy_pct)} YOY</span></summary><div class="territory-councils">${[...councils].sort(sorters[sort]).map((council) => `<details class="council-record" data-council="${escapeHtml(council.council_number)}"><summary class="council-summary"><span class="council-name"><strong>${escapeHtml(council.council)}</strong><small>${formatNumber(council.units)} units · National YOY rank ${formatRank(council.yoy_rank)}</small></span><span>${formatNumber(council.current_youth)} youth</span><span class="${classForValue(council.yoy_pct)}">${formatSignedPct(council.yoy_pct)} YOY</span></summary>${cstCouncilDetail(data, council)}</details>`).join("")}</div></details>`;
  }).join("") : '<div class="empty-state">No councils match this search. Reset filters to restore this territory’s councils.</div>';
  const missingTay = rows.filter((row) => row.tay == null || row.tay <= 0);
  document.getElementById("cstSource").innerHTML = `${sourceLink(data)}<span>${escapeHtml(data.metadata.source_name)}, downloaded ${escapeHtml(dateFmt.format(new Date(data.metadata.source_downloaded_at)))}. CST assignments come from the council membership source. Growth uses summed current and baseline youth, not an average of council percentages. TAY penetration uses youth and TAY only from covered councils. ${missingTay.length ? `TAY unavailable for ${escapeHtml(missingTay.map((row) => row.council).join("; "))}.` : "All councils in this view have TAY coverage."} Rankings shown are national; program and PIN populations may differ from membership totals.</span>`;
}

function initCst(data) {
  const groups = cstGroups(data.councils);
  const requested = new URLSearchParams(window.location.search).get("cst");
  const selectedCst = requested === "all" || groups.some(([key]) => key === requested) ? requested : "all";
  const title = selectedCst === "all" ? "CST Dashboard" : `${cstLabel(selectedCst)} Dashboard`;
  document.getElementById("cstTitle").textContent = title;
  document.title = `${title} · Council Performance Rankings`;
  document.getElementById("cstSubtitle").textContent = selectedCst === "all"
    ? "Explore every territory, then expand its councils for membership and program details."
    : `Membership performance and council details for ${cstLabel(selectedCst)}.`;
  document.getElementById("cstLinks").innerHTML = [["all", data.councils], ...groups].map(([key, councils]) => `<a class="cst-link${selectedCst === key ? " selected" : ""}" href="cst.html?cst=${encodeURIComponent(key)}"${selectedCst === key ? ' aria-current="page"' : ""}><strong>${key === "all" ? "All CSTs" : escapeHtml(cstLabel(key))}</strong><span>${councils.length} ${councils.length === 1 ? "council" : "councils"}</span></a>`).join("");
  if (requested != null && requested !== selectedCst) {
    const notice = document.createElement("p");
    notice.className = "panel-intro";
    notice.textContent = "That CST is not in the current source. Showing all CSTs.";
    document.getElementById("cstLinks").before(notice);
  }
  document.getElementById("cstSearch").addEventListener("input", () => renderCst(data, selectedCst));
  document.getElementById("cstSort").addEventListener("change", () => renderCst(data, selectedCst));
  document.getElementById("cstReset").addEventListener("click", () => {
    document.getElementById("cstSearch").value = "";
    document.getElementById("cstSort").value = "name";
    renderCst(data, selectedCst);
  });
  for (const [id, open] of [["cstExpand", true], ["cstCollapse", false]]) {
    document.getElementById(id).addEventListener("click", () => document.querySelectorAll("#cstGroups details").forEach((detail) => { detail.open = open; }));
  }
  renderCst(data, selectedCst);
}

function showError(error) {
  const main = document.querySelector("main");
  const banner = document.createElement("div");
  banner.className = "error-banner";
  banner.textContent = `The dashboard data could not be loaded: ${error.message}`;
  main.prepend(banner);
}

async function main() {
  try {
    const response = await fetch("data/latest.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    updateSourceDates(data);
    const page = document.body.dataset.page;
    if (page === "overview") initOverview(data);
    if (page === "rankings") initRankings(data);
    if (page === "unit-health") initHealth(data);
    if (page === "about") initAbout(data);
    if (page === "cst") initCst(data);
  } catch (error) {
    showError(error);
  }
}

main();
