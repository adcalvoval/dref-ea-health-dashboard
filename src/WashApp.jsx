import { useState, useEffect, useRef, useMemo } from 'react';
import Chart from 'chart.js/auto';

/* ── Constants ── */
const SECTORS = [
  { key: 'sector_shelter_and_basic_household_items',              label: 'Shelter & NFIs',      color: '#3B82F6' },
  { key: 'sector_livelihoods',                                    label: 'Livelihoods',          color: '#10B981' },
  { key: 'sector_multi_purpose_cash_grants',                      label: 'Cash Grants',          color: '#F59E0B' },
  { key: 'sector_health',                                         label: 'Health',               color: '#EF4444' },
  { key: 'sector_water_sanitation_and_hygiene',                   label: 'WASH',                 color: '#06B6D4' },
  { key: 'sector_protection_gender_and_inclusion',                label: 'Protection & Gender',  color: '#8B5CF6' },
  { key: 'sector_education',                                      label: 'Education',            color: '#F97316' },
  { key: 'sector_migration_and_displacement',                     label: 'Migration',            color: '#EC4899' },
  { key: 'sector_risk_reduction_climate_adaptation_and_recovery', label: 'Risk Reduction',       color: '#84CC16' },
  { key: 'sector_community_engagement_and_accountability',        label: 'CEA',                  color: '#14B8A6' },
  { key: 'sector_environmental_sustainability',                   label: 'Environment',          color: '#6366F1' },
  { key: 'sector_coordination_and_partnerships',                  label: 'Coordination',         color: '#D97706' },
  { key: 'sector_secretariat_services',                           label: 'Secretariat Services', color: '#9CA3AF' },
  { key: 'sector_national_society_strengthening',                 label: 'NS Strengthening',     color: '#1D4ED8' },
];

const DISASTER_PILL = { Epidemic: 'pill-ep', Flood: 'pill-fl', Cyclone: 'pill-cy', Earthquake: 'pill-eq' };

const TYPE_OPTIONS    = [{ value: 'all', label: 'All Types' }, { value: 'dref', label: 'DREF' }, { value: 'ea', label: 'Emergency Appeal' }];
const STATUS_OPTIONS  = [{ value: 'all', label: 'All Statuses' }, { value: 'active', label: 'Active' }, { value: 'closed', label: 'Closed' }];
const REGION_OPTIONS  = [
  { value: 'all', label: 'All Regions' },
  { value: 'Africa', label: 'Africa' },
  { value: 'Americas', label: 'Americas' },
  { value: 'Asia Pacific', label: 'Asia Pacific' },
  { value: 'Europe', label: 'Europe' },
  { value: 'Middle East & North Africa', label: 'Middle East & North Africa' },
];
const QUICK_FILTERS = [
  { term: 'Epidemic',            label: 'Epidemic / Outbreak', cls: 'tag-ep' },
  { term: 'Flood',               label: 'Flood',               cls: 'tag-fl' },
  { term: 'Cyclone',             label: 'Cyclone',             cls: 'tag-cy' },
  { term: 'Drought',             label: 'Drought',             cls: 'tag-dr' },
  { term: 'Earthquake',          label: 'Earthquake',          cls: 'tag-eq' },
  { term: 'Population Movement', label: 'Population Movement', cls: 'tag-pm' },
  { term: 'Food Insecurity',     label: 'Food Insecurity',     cls: 'tag-fi' },
];

const WASH_ERU_KEYWORDS      = ['WASH', 'Water', 'Household Water', 'Cholera'];
const WASH_PERSONNEL_TERMS   = ['wash', 'water', 'sanitation', 'hygiene', 'cholera', 'phie', 'public health in emergencies'];
const PG = 25;

/* ── Formatters ── */
function fMoney(v) {
  if (!v) return '—';
  if (v >= 1e9) return `CHF ${(v/1e9).toFixed(2)}B`;
  if (v >= 1e6) return `CHF ${(v/1e6).toFixed(1)}M`;
  if (v >= 1e3) return `CHF ${(v/1e3).toFixed(0)}K`;
  return `CHF ${v.toFixed(0)}`;
}
function fNum(v) {
  if (!v) return '—';
  if (v >= 1e6) return `${(v/1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v/1e3).toFixed(0)}K`;
  return v.toLocaleString();
}
function scaleBudget(v) {
  if (!v) return { val: undefined, sfx: '' };
  if (v >= 1e9) return { val: +((v/1e9).toFixed(2)), sfx: 'B CHF' };
  if (v >= 1e6) return { val: +((v/1e6).toFixed(1)), sfx: 'M CHF' };
  return { val: +((v/1e3).toFixed(0)), sfx: 'K CHF' };
}
function scalePeople(v) {
  if (!v) return { val: undefined, sfx: '' };
  if (v >= 1e6) return { val: +((v/1e6).toFixed(1)), sfx: 'M' };
  if (v >= 1e3) return { val: +((v/1e3).toFixed(0)), sfx: 'K' };
  return { val: v, sfx: '' };
}

/* ── Data processing ── */
function processDref(raw) {
  const list = Array.isArray(raw) ? raw : (raw?.results ?? []);
  const groups = {};
  list.forEach(r => {
    if (!groups[r.appeal_id]) groups[r.appeal_id] = [];
    groups[r.appeal_id].push(r);
  });
  return Object.entries(groups).map(([aid, stages]) => {
    const latest = stages.find(s => s.is_latest_stage) || stages.at(-1);
    const app    = stages.find(s => s.stage === 'Application') || stages[0];
    const date   = app.date_of_approval || app.start_date_of_operation
                || latest.start_date_of_operation || (latest.modified_at || '').substring(0, 10);
    const sectorBudgets = {};
    SECTORS.forEach(s => { sectorBudgets[s.key] = latest[s.key + '_budget'] || 0; });
    const washBudget = sectorBudgets.sector_water_sanitation_and_hygiene || 0;
    if (!washBudget) return null;
    return {
      _src: 'dref',
      appeal_id: aid,
      name: app.disaster_name || latest.disaster_name || '—',
      country: app.country || latest.country || '—',
      country_iso3: app.country_iso3 || latest.country_iso3,
      region: app.region || latest.region || '—',
      disaster: latest.disaster_definition || app.disaster_definition || '—',
      stage: latest.stage,
      status: latest.operation_status || app.operation_status || '',
      date,
      total_budget: latest.total_approved || app.amount_approved || 0,
      people_targeted: latest.people_targeted || app.people_targeted || 0,
      people_reached:  latest.people_reached  || 0,
      link: latest.link_to_emergency_page || app.link_to_emergency_page,
      washBudget,
      sectorBudgets,
    };
  }).filter(Boolean);
}

function processEA(raw) {
  return raw.map(r => ({
    _src: 'ea',
    appeal_id: r.code,
    name: r.name || '—',
    country: r.country?.name || '—',
    country_iso3: r.country?.iso3,
    region: r.region?.region_name || '—',
    disaster: r.dtype?.name || '—',
    stage: null,
    status: r.status === 0 ? 'active' : 'closed',
    date: (r.start_date || '').substring(0, 10),
    total_budget: r.amount_requested || 0,
    amount_funded: r.amount_funded || 0,
    people_targeted: r.num_beneficiaries || 0,
    people_reached: 0,
    link: null,
    washBudget: 0,
    sectorBudgets: null,
  }));
}

function processEru(raw) {
  const events = Array.isArray(raw) ? raw : (raw?.results ?? []);
  const flat = [];
  events.forEach(ev => {
    (ev.active_erus || []).forEach(e => {
      if (!WASH_ERU_KEYWORDS.some(k => (e.type_display || '').includes(k))) return;
      flat.push({
        id: e.id,
        type: e.type,
        type_display: e.type_display,
        units: e.units,
        equipment_units: e.equipment_units,
        deployed_to: e.deployed_to,
        event: { id: ev.id, name: ev.name },
        eru_owner: {
          society_name: e.eru_owner_details?.national_society_country_details?.society_name,
        },
        start_date: (e.start_date || '').slice(0, 10),
        end_date:   (e.end_date   || '').slice(0, 10),
      });
    });
  });
  return flat;
}

function processPersonnel(raw) {
  const list = raw?.results ?? (Array.isArray(raw) ? raw : []);
  return list.filter(p => WASH_PERSONNEL_TERMS.some(t => (p.role || '').toLowerCase().includes(t)));
}

const LEGACY_WASH_DTYPES = ['flood', 'pluvial/flash flood'];
const LEGACY_WASH_NAME_KW = ['wash', 'water', 'sanit', 'hygiene', 'cholera', 'hepatitis', 'typhoid'];

function processDrefAppeals(raw) {
  const list = Array.isArray(raw) ? raw : (raw?.results ?? []);
  return list.map(r => {
    const name  = (r.name  || '').toLowerCase();
    const dtype = ((r.dtype?.name) || '').toLowerCase();
    if (!LEGACY_WASH_DTYPES.some(d => dtype.includes(d)) && !LEGACY_WASH_NAME_KW.some(k => name.includes(k))) return null;
    return {
      _src: 'dref',
      _legacy: true,
      appeal_id: r.code,
      name: r.name || '—',
      country: r.country?.name || '—',
      country_iso3: r.country?.iso3,
      region: r.region?.region_name || '—',
      disaster: r.dtype?.name || '—',
      stage: null,
      status: r.status === 0 ? 'active' : 'closed',
      date: (r.start_date || '').substring(0, 10),
      total_budget: r.amount_requested || 0,
      amount_funded: r.amount_funded || 0,
      people_targeted: r.num_beneficiaries || 0,
      people_reached: 0,
      link: null,
      washBudget: 0,
      sectorBudgets: null,
    };
  }).filter(Boolean);
}

/* ── Inline UI components ── */
function KeyFigure({ value, label, suffix, description }) {
  const display = value != null ? `${value}${suffix ? ' ' + suffix : ''}` : '—';
  return (
    <div>
      <div className="kf-value">{display}</div>
      <div className="kf-label">{label}</div>
      {description && <div className="kf-desc">{description}</div>}
    </div>
  );
}
function FilterSelect({ label, name, value, options, onChange }) {
  return (
    <div className="filter-field">
      <label className="filter-label" htmlFor={name}>{label}</label>
      <select id={name} className="filter-select" value={value} onChange={e => onChange(e.target.value)}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
function FilterSelectYear({ label, name, value, options, onChange }) {
  return (
    <div className="filter-field">
      <label className="filter-label" htmlFor={name}>{label}</label>
      <select id={name} className="filter-select" value={value ?? ''} onChange={e => onChange(e.target.value ? Number(e.target.value) : undefined)}>
        <option value="">Any</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
function FilterInput({ label, name, value, onChange, placeholder }) {
  return (
    <div className="filter-field">
      <label className="filter-label" htmlFor={name}>{label}</label>
      <input id={name} className="filter-input" type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}
function Pager({ activePage, itemsCount, maxItemsPerPage, onActivePageChange }) {
  const totalPages = Math.ceil(itemsCount / maxItemsPerPage);
  if (totalPages <= 1) return null;
  const pages = [];
  const start = Math.max(1, activePage - 2);
  const end   = Math.min(totalPages, activePage + 2);
  for (let i = start; i <= end; i++) pages.push(i);
  return (
    <div className="pager">
      <button className="pg-btn" disabled={activePage === 1} onClick={() => onActivePageChange(activePage - 1)}>‹</button>
      {start > 1 && (<><button className="pg-btn" onClick={() => onActivePageChange(1)}>1</button>{start > 2 && <span className="pg-ellipsis">…</span>}</>)}
      {pages.map(p => <button key={p} className={`pg-btn${p === activePage ? ' pg-active' : ''}`} onClick={() => onActivePageChange(p)}>{p}</button>)}
      {end < totalPages && (<>{end < totalPages - 1 && <span className="pg-ellipsis">…</span>}<button className="pg-btn" onClick={() => onActivePageChange(totalPages)}>{totalPages}</button></>)}
      <button className="pg-btn" disabled={activePage === totalPages} onClick={() => onActivePageChange(activePage + 1)}>›</button>
    </div>
  );
}

/* ── Cell renderers ── */
function NameCell({ name, link }) {
  return link ? <a href={link} target="_blank" rel="noopener" className="name-link">{name}</a> : <span>{name}</span>;
}
function TypeBadge({ src }) {
  return src === 'dref' ? <span className="badge b-dref">DREF</span> : <span className="badge b-ea">EA</span>;
}
function DisasterCell({ disaster }) {
  return <span className={`pill ${DISASTER_PILL[disaster] || ''}`}>{disaster}</span>;
}
function StatusCell({ status, stage }) {
  const s = (status || '').toLowerCase();
  if (['active', 'ongoing'].includes(s)) return <span className="badge b-active">Active</span>;
  if (s === 'closed') return <span className="badge b-closed">Closed</span>;
  if (stage) return <span className="badge b-stage">{stage}</span>;
  return <span className="faint">—</span>;
}
function CoverageCell({ src, total, funded }) {
  if (src !== 'ea' || !total) return <span className="faint">—</span>;
  const pct = Math.min((funded / total) * 100, 100);
  const cls = pct >= 85 ? 'green' : pct >= 45 ? 'yellow' : 'red';
  return (
    <div className="bbar-wrap">
      <div className="bbar-bg"><div className={`bbar-fill ${cls}`} style={{ width: `${pct.toFixed(0)}%` }} /></div>
      <span className="bbar-pct">{pct.toFixed(0)}%</span>
    </div>
  );
}

/* ── Chart drawing ── */
const RCOLS = ['#F5333F', '#FF6B35', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6'];
const DCOLS = ['#F5333F', '#3B82F6', '#F59E0B', '#10B981', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#9CA3AF'];

function baseOpts(legend = true) {
  return {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: legend ? { position: 'top', labels: { font: { size: 11 }, usePointStyle: true, pointStyleWidth: 8 } } : { display: false } },
    scales: { x: { grid: { display: false }, ticks: { font: { size: 11 } } }, y: { grid: { color: '#F3F4F6' }, ticks: { font: { size: 11 }, precision: 0 } } },
  };
}

const moneyTooltip = { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fMoney(ctx.raw)}` } };
const moneyAxisX   = { grid: { color: '#F3F4F6' }, ticks: { font: { size: 11 }, callback: v => fMoney(v) } };
const moneyAxisY   = { grid: { color: '#F3F4F6' }, ticks: { font: { size: 11 }, callback: v => fMoney(v) } };
const plainAxisX   = { grid: { display: false }, ticks: { font: { size: 11 } } };
const plainAxisY   = { grid: { display: false }, ticks: { font: { size: 11 } } };
const peopleAxisX  = { grid: { color: '#F3F4F6' }, ticks: { font: { size: 11 }, callback: v => fNum(v) } };
const peopleAxisY  = { grid: { color: '#F3F4F6' }, ticks: { font: { size: 11 }, callback: v => fNum(v) } };

function drawCharts(filtered, refs, instances) {
  const withSectors   = filtered.filter(o => o.sectorBudgets);
  const hasSectorData = withSectors.length > 0;

  if (refs.year) {
    const byYear = {};
    filtered.forEach(op => {
      if (!op.date) return;
      const y = new Date(op.date).getFullYear();
      if (y < 2016 || y > 2026) return;
      if (!byYear[y]) byYear[y] = { dref: 0, ea: 0 };
      if (op._src === 'dref') byYear[y].dref++; else byYear[y].ea++;
    });
    const yrs = Object.keys(byYear).sort();
    instances.year = new Chart(refs.year, {
      type: 'bar',
      data: { labels: yrs, datasets: [
        { label: 'DREF',             data: yrs.map(y => byYear[y].dref), backgroundColor: '#F5333F', borderRadius: 3, stack: 's' },
        { label: 'Emergency Appeal', data: yrs.map(y => byYear[y].ea),   backgroundColor: '#FF6B35', borderRadius: 3, stack: 's' },
      ]},
      options: baseOpts(true),
    });
  }

  if (refs.region) {
    const counts = {};
    filtered.forEach(op => { counts[op.region] = (counts[op.region] || 0) + 1; });
    const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    instances.region = new Chart(refs.region, {
      type: 'bar',
      data: { labels: rows.map(r => r[0]), datasets: [{ label: 'Operations', data: rows.map(r => r[1]), backgroundColor: rows.map((_, i) => RCOLS[i % RCOLS.length]), borderRadius: 4 }] },
      options: { ...baseOpts(false), indexAxis: 'y' },
    });
  }

  if (refs.sector) {
    if (hasSectorData) {
      const totals = SECTORS.map(s => ({
        label: s.label,
        sum: withSectors.reduce((acc, op) => acc + (op.sectorBudgets[s.key] || 0), 0),
        color: s.color,
      })).filter(s => s.sum > 0).sort((a, b) => b.sum - a.sum);
      instances.sector = new Chart(refs.sector, {
        type: 'bar',
        data: { labels: totals.map(s => s.label), datasets: [{ label: 'Budget (CHF)', data: totals.map(s => s.sum), backgroundColor: totals.map(s => s.color), borderRadius: 4 }] },
        options: { ...baseOpts(false), indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ' ' + fMoney(ctx.raw) } } }, scales: { x: moneyAxisX, y: plainAxisY } },
      });
    } else {
      const totalReq    = filtered.reduce((s, o) => s + (o.total_budget  || 0), 0);
      const totalFunded = filtered.reduce((s, o) => s + (o.amount_funded || 0), 0);
      instances.sector = new Chart(refs.sector, {
        type: 'bar',
        data: { labels: ['Amount Requested', 'Amount Funded'], datasets: [{ data: [totalReq, totalFunded], backgroundColor: ['#FF6B35', '#10B981'], borderRadius: 4 }] },
        options: { ...baseOpts(false), indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ' ' + fMoney(ctx.raw) } } }, scales: { x: moneyAxisX, y: plainAxisY } },
      });
    }
  }

  if (refs.dtype) {
    const counts = {};
    filtered.forEach(op => { counts[op.disaster] = (counts[op.disaster] || 0) + 1; });
    let rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (rows.length > 9) { const other = rows.slice(9).reduce((s, [, v]) => s + v, 0); rows = [...rows.slice(0, 9), ['Other', other]]; }
    instances.dtype = new Chart(refs.dtype, {
      type: 'doughnut',
      data: { labels: rows.map(r => r[0]), datasets: [{ data: rows.map(r => r[1]), backgroundColor: DCOLS.slice(0, rows.length), borderWidth: 2, borderColor: '#fff' }] },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '55%',
        plugins: { legend: { position: 'right', labels: { font: { size: 11 }, usePointStyle: true, pointStyleWidth: 8, boxHeight: 8,
          generateLabels: chart => chart.data.labels.map((lbl, i) => ({ text: `${lbl} (${chart.data.datasets[0].data[i]})`, fillStyle: chart.data.datasets[0].backgroundColor[i], strokeStyle: '#fff', pointStyle: 'circle', index: i })) } } },
      },
    });
  }

  if (refs.hwYear) {
    const byYear = {};
    filtered.filter(o => o.date).forEach(op => {
      const y = new Date(op.date).getFullYear();
      if (y < 2016 || y > 2026) return;
      const yk = String(y);
      if (!byYear[yk]) byYear[yk] = { targeted: 0, reached: 0 };
      byYear[yk].targeted += op.people_targeted || 0;
      byYear[yk].reached  += op.people_reached  || 0;
    });
    const yrs = Object.keys(byYear).sort();
    instances.hwYear = new Chart(refs.hwYear, {
      type: 'bar',
      data: { labels: yrs, datasets: [
        { label: 'People Targeted', data: yrs.map(y => byYear[y].targeted), backgroundColor: '#3B82F6', borderRadius: 3 },
        { label: 'People Reached',  data: yrs.map(y => byYear[y].reached),  backgroundColor: '#10B981', borderRadius: 3 },
      ]},
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'top', labels: { font: { size: 11 }, usePointStyle: true, pointStyleWidth: 8 } }, tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fNum(ctx.raw)}` } } },
        scales: { x: plainAxisX, y: peopleAxisY },
      },
    });
  }

  if (refs.hwRegion) {
    const byRegion = {};
    filtered.forEach(op => {
      const r = op.region || 'Unknown';
      if (!byRegion[r]) byRegion[r] = { targeted: 0, reached: 0 };
      byRegion[r].targeted += op.people_targeted || 0;
      byRegion[r].reached  += op.people_reached  || 0;
    });
    const rows = Object.entries(byRegion).map(([r, v]) => ({ r, ...v })).sort((a, b) => b.targeted - a.targeted);
    instances.hwRegion = new Chart(refs.hwRegion, {
      type: 'bar',
      data: { labels: rows.map(r => r.r), datasets: [
        { label: 'People Targeted', data: rows.map(r => r.targeted), backgroundColor: '#3B82F6', borderRadius: 3, stack: 's' },
        { label: 'People Reached',  data: rows.map(r => r.reached),  backgroundColor: '#10B981', borderRadius: 3, stack: 's' },
      ]},
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'top', labels: { font: { size: 11 }, usePointStyle: true, pointStyleWidth: 8 } }, tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fNum(ctx.raw)}`, afterBody: items => { const t = items.reduce((s, i) => s + i.raw, 0); return t > 0 ? [`Total: ${fNum(t)}`] : []; } } } },
        scales: { x: peopleAxisX, y: plainAxisY },
      },
    });
  }
}

/* ── Personnel / ERU charts ── */
function drawPersonnelCharts(erus, refs, instances) {
  if (refs.eruType) {
    const counts = {};
    erus.forEach(e => { const t = e.type_display || 'Unknown'; counts[t] = (counts[t] || 0) + 1; });
    const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    instances.eruType = new Chart(refs.eruType, {
      type: 'bar',
      data: { labels: rows.map(r => r[0]), datasets: [{ label: 'ERUs', data: rows.map(r => r[1]), backgroundColor: '#06B6D4', borderRadius: 4 }] },
      options: { ...baseOpts(false), indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { grid: { color: '#F3F4F6' }, ticks: { font: { size: 11 }, precision: 0 } }, y: plainAxisY } },
    });
  }
  if (refs.eruEvent) {
    if (erus.length === 0) return;
    const counts = {};
    erus.forEach(e => { const ev = e.event?.name || 'Unknown'; counts[ev] = (counts[ev] || 0) + 1; });
    const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    instances.eruEvent = new Chart(refs.eruEvent, {
      type: 'bar',
      data: { labels: rows.map(r => r[0]), datasets: [{ label: 'ERUs', data: rows.map(r => r[1]), backgroundColor: '#F59E0B', borderRadius: 4 }] },
      options: { ...baseOpts(false), indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { grid: { color: '#F3F4F6' }, ticks: { font: { size: 11 }, precision: 0 } }, y: plainAxisY } },
    });
  }
  if (refs.eruTimeline) {
    if (erus.length === 0) return;
    const today = new Date();
    const withDates = erus.filter(e => e.start_date);
    if (withDates.length === 0) return;

    // Epoch = start of the earliest deployment month
    const earliest = new Date(Math.min(...withDates.map(e => new Date(e.start_date))));
    earliest.setDate(1);
    const epoch = earliest.getTime();
    const toDay = d => (d.getTime() - epoch) / 86400000;

    const labels = withDates.map(e => {
      const ns = e.eru_owner?.society_name || '?';
      const country = e.deployed_to?.name || '';
      return country ? `${e.type_display} · ${country} (${ns})` : `${e.type_display} (${ns})`;
    });
    const data = withDates.map(e => [
      toDay(new Date(e.start_date)),
      toDay(e.end_date ? new Date(e.end_date) : today),
    ]);
    const maxDay = Math.max(...data.map(d => d[1])) + 15;

    const fmtDay = v => {
      const d = new Date(epoch + v * 86400000);
      return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
    };

    instances.eruTimeline = new Chart(refs.eruTimeline, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: '#06B6D4',
          borderRadius: 4,
          borderSkipped: false,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: {
            label: ctx => {
              const [s, e] = ctx.raw;
              return ` ${fmtDay(s)}  →  ${fmtDay(e)}`;
            },
          }},
        },
        scales: {
          x: {
            min: 0, max: maxDay,
            grid: { color: '#F3F4F6' },
            ticks: { font: { size: 10 }, stepSize: 30, callback: v => fmtDay(v) },
          },
          y: { ticks: { font: { size: 10 } } },
        },
      },
    });
  }
}

/* ── App ── */
export default function WashApp() {
  const [loading, setLoading]         = useState(true);
  const [drefOps, setDrefOps]         = useState([]);
  const [eaOps, setEaOps]             = useState([]);
  const [eruData, setEruData]         = useState([]);
  const [personnelData, setPersonnel] = useState([]);
  const [filterType, setFilterType]         = useState('all');
  const [filterYearFrom, setFilterYearFrom] = useState(undefined);
  const [filterYearTo, setFilterYearTo]     = useState(undefined);
  const [filterStatus, setFilterStatus]     = useState('all');
  const [filterRegion, setFilterRegion]     = useState('all');
  const [filterDisaster, setFilterDisaster] = useState('');
  const [filterName, setFilterName]         = useState('');
  const [page, setPage] = useState(1);

  const [eruFilterType, setEruFilterType] = useState('all');
  const [eruFilterNs,   setEruFilterNs]   = useState('');
  const [personnelFilterRole,      setPersonnelFilterRole]      = useState('');
  const [personnelFilterCountry,   setPersonnelFilterCountry]   = useState('');
  const [personnelFilterDateFrom,  setPersonnelFilterDateFrom]  = useState('');
  const [personnelFilterDateTo,    setPersonnelFilterDateTo]    = useState('');
  const [personnelFilterStatus,    setPersonnelFilterStatus]    = useState('all');

  const yearRef     = useRef(null);
  const regionRef   = useRef(null);
  const sectorRef   = useRef(null);
  const dtypeRef    = useRef(null);
  const hwYearRef   = useRef(null);
  const hwRegionRef = useRef(null);
  const chartInstances = useRef({});

  const eruTypeRef     = useRef(null);
  const eruEventRef    = useRef(null);
  const eruTimelineRef = useRef(null);
  const eruInstances   = useRef({});

  useEffect(() => {
    Promise.all([
      fetch('/api/dref3').then(r => r.json()),
      fetch('/api/appeals').then(r => r.json()),
      fetch('/api/dref-appeals').then(r => r.json()).catch(() => []),
      fetch('/api/eru').then(r => r.json()).catch(() => ({ results: [] })),
      fetch('/api/personnel').then(r => r.json()).catch(() => ({ results: [] })),
    ]).then(([dref3, eas, drefAppeals, erus, personnel]) => {
      const dref3Ops = processDref(dref3);
      const dref3Codes = new Set(dref3Ops.map(o => o.appeal_id));
      const legacyOps = processDrefAppeals(drefAppeals).filter(o => !dref3Codes.has(o.appeal_id));
      setDrefOps([...legacyOps, ...dref3Ops]);
      setEaOps(processEA(eas));
      setEruData(processEru(erus));
      setPersonnel(processPersonnel(personnel));
    }).catch(err => console.error('Failed to load data:', err))
      .finally(() => setLoading(false));
  }, []);

  const years = useMemo(() => {
    const yrs = new Set();
    [...drefOps, ...eaOps].forEach(op => {
      if (op.date) { const y = new Date(op.date).getFullYear(); if (y >= 2016 && y <= 2026) yrs.add(y); }
    });
    return [...yrs].sort((a, b) => b - a);
  }, [drefOps, eaOps]);

  const filtered = useMemo(() => {
    let pool = [];
    if (filterType !== 'ea')   pool.push(...drefOps);
    if (filterType !== 'dref') pool.push(...eaOps);
    return pool.filter(op => {
      if (op.date) {
        const y = new Date(op.date).getFullYear();
        if (y < 2016 || y > 2026) return false;
        if (filterYearFrom != null && y < filterYearFrom) return false;
        if (filterYearTo   != null && y > filterYearTo)   return false;
      }
      if (filterStatus !== 'all') {
        const isActive = ['active', 'ongoing'].includes((op.status || '').toLowerCase());
        if (filterStatus === 'active' && !isActive) return false;
        if (filterStatus === 'closed' &&  isActive) return false;
      }
      if (filterRegion !== 'all' && op.region !== filterRegion) return false;
      if (filterDisaster && !(op.disaster || '').toLowerCase().includes(filterDisaster.toLowerCase())) return false;
      if (filterName) {
        const h = `${op.name} ${op.appeal_id} ${op.country}`.toLowerCase();
        if (!h.includes(filterName.toLowerCase())) return false;
      }
      return true;
    }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [drefOps, eaOps, filterType, filterYearFrom, filterYearTo, filterStatus, filterRegion, filterDisaster, filterName]);

  const stats = useMemo(() => {
    const drefs      = filtered.filter(o => o._src === 'dref');
    const eas        = filtered.filter(o => o._src === 'ea');
    const washBudget = drefs.reduce((s, o) => s + (o.washBudget || 0), 0);
    const totalPeople   = filtered.reduce((s, o) => s + (o.people_targeted || 0), 0);
    const peopleReached = drefs.reduce((s, o) => s + (o.people_reached  || 0), 0);
    const countries  = new Set(filtered.map(o => o.country_iso3).filter(Boolean)).size;
    const eaReq      = eas.reduce((s, o) => s + (o.total_budget  || 0), 0);
    const eaFunded   = eas.reduce((s, o) => s + (o.amount_funded || 0), 0);
    const coverage   = eaReq > 0 ? (eaFunded / eaReq) * 100 : null;
    const withSectors   = filtered.filter(o => o.sectorBudgets);
    const sectorTotal   = withSectors.reduce((s, o) => s + (o.total_budget || 0), 0);
    const hasSectorData = withSectors.length > 0;
    const reachRate  = totalPeople > 0 ? (peopleReached / totalPeople) * 100 : null;
    const eruDeployed   = eruData.filter(e => e.deployed_to).length;
    return { total: filtered.length, drefCount: drefs.length, eaCount: eas.length, washBudget, totalPeople, peopleReached, countries, coverage, sectorTotal, hasSectorData, reachRate, eruDeployed };
  }, [filtered, eruData]);

  const eruTypeOptions = useMemo(() => {
    const types = [...new Set(eruData.map(e => e.type_display).filter(Boolean))].sort();
    return [{ value: 'all', label: 'All Types' }, ...types.map(t => ({ value: t, label: t }))];
  }, [eruData]);

  const filteredEru = useMemo(() => eruData.filter(e => {
    if (eruFilterType !== 'all' && e.type_display !== eruFilterType) return false;
    if (eruFilterNs && !(e.eru_owner?.society_name || '').toLowerCase().includes(eruFilterNs.toLowerCase())) return false;
    return true;
  }), [eruData, eruFilterType, eruFilterNs]);

  const filteredPersonnel = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return personnelData.filter(p => {
      if (personnelFilterRole && !(p.role || '').toLowerCase().includes(personnelFilterRole.toLowerCase())) return false;
      if (personnelFilterCountry) {
        const dest = (p.country_to?.name || p.deployment?.country_deployed_to?.name || '').toLowerCase();
        if (!dest.includes(personnelFilterCountry.toLowerCase())) return false;
      }
      if (personnelFilterDateFrom && p.start_date && p.start_date < personnelFilterDateFrom) return false;
      if (personnelFilterDateTo   && p.start_date && p.start_date > personnelFilterDateTo)   return false;
      if (personnelFilterStatus !== 'all') {
        const start  = p.start_date || '';
        const end    = p.end_date   || '';
        const active = start && start <= today && (!end || end >= today);
        const completed = end && end < today;
        const upcoming  = start && start > today;
        if (personnelFilterStatus === 'active'    && !active)    return false;
        if (personnelFilterStatus === 'completed' && !completed) return false;
        if (personnelFilterStatus === 'upcoming'  && !upcoming)  return false;
      }
      return true;
    });
  }, [personnelData, personnelFilterRole, personnelFilterCountry, personnelFilterDateFrom, personnelFilterDateTo, personnelFilterStatus]);

  useEffect(() => {
    if (loading) return;
    const instances = chartInstances.current;
    drawCharts(filtered, {
      year: yearRef.current, region: regionRef.current,
      sector: sectorRef.current, dtype: dtypeRef.current,
      hwYear: hwYearRef.current, hwRegion: hwRegionRef.current,
    }, instances);
    return () => { Object.values(instances).forEach(c => c?.destroy()); chartInstances.current = {}; };
  }, [filtered, loading]);

  useEffect(() => {
    if (loading) return;
    const instances = eruInstances.current;
    drawPersonnelCharts(filteredEru, {
      eruType: eruTypeRef.current, eruEvent: eruEventRef.current,
      eruTimeline: eruTimelineRef.current,
    }, instances);
    return () => { Object.values(instances).forEach(c => c?.destroy()); eruInstances.current = {}; };
  }, [filteredEru, loading]);

  const yearOptions = years.map(y => ({ value: y, label: String(y) }));
  const pageData    = filtered.slice((page - 1) * PG, page * PG);
  const washScale   = scaleBudget(stats.washBudget);
  const people      = scalePeople(stats.totalPeople);
  const reached     = scalePeople(stats.peopleReached);

  function reset() {
    setFilterType('all'); setFilterYearFrom(undefined); setFilterYearTo(undefined);
    setFilterStatus('all'); setFilterRegion('all'); setFilterDisaster(''); setFilterName(''); setPage(1);
  }

  return (
    <>
      {loading && (
        <div className="loading-overlay">
          <div className="spinner" />
          <span style={{ marginLeft: 12, color: '#6B7280', fontSize: 14 }}>Loading WASH data…</span>
        </div>
      )}

      <header className="header" style={{ background: '#0E7490' }}>
        <span className="header-logo">IFRC</span>
        <span className="header-sep" />
        <span className="header-title">WASH Dashboard — DREF &amp; Emergency Appeals</span>
      </header>

      <div className="wrap">

        {/* ── Filters ── */}
        <div className="filters">
          <div className="filter-row">
            <FilterSelect name="type" label="Operation Type" options={TYPE_OPTIONS} value={filterType} onChange={val => { setFilterType(val); setPage(1); }} />
            <FilterSelectYear name="yearFrom" label="Year From" options={yearOptions} value={filterYearFrom} onChange={val => { setFilterYearFrom(val); setPage(1); }} />
            <span className="year-arrow">→</span>
            <FilterSelectYear name="yearTo" label="Year To" options={yearOptions} value={filterYearTo} onChange={val => { setFilterYearTo(val); setPage(1); }} />
            <FilterSelect name="status" label="Status" options={STATUS_OPTIONS} value={filterStatus} onChange={val => { setFilterStatus(val); setPage(1); }} />
            <FilterSelect name="region" label="Region" options={REGION_OPTIONS} value={filterRegion} onChange={val => { setFilterRegion(val); setPage(1); }} />
            <FilterInput name="disaster" label="Disaster Type Search" value={filterDisaster} onChange={val => { setFilterDisaster(val); setPage(1); }} placeholder='"Epidemic", "Flood"…' />
            <FilterInput name="name" label="Operation Name / Code" value={filterName} onChange={val => { setFilterName(val); setPage(1); }} placeholder="Search name or code…" />
            <div className="filter-field"><label className="filter-label">&nbsp;</label><button className="btn-reset" onClick={reset}>Reset</button></div>
          </div>
          <div className="tags">
            <span className="tag-label">Quick filters:</span>
            {QUICK_FILTERS.map(qf => (
              <button key={qf.term} type="button" className={`tag ${qf.cls}${filterDisaster === qf.term ? ' active-tag' : ''}`} onClick={() => { setFilterDisaster(qf.term); setPage(1); }}>
                {qf.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── KPI Stats ── */}
        <div className="stats">
          <div className="stat"><KeyFigure value={stats.total} label="WASH Operations" description={`${stats.drefCount} DREF · ${stats.eaCount} EA`} /></div>
          <div className="stat"><KeyFigure value={washScale.val} label="WASH Budget" suffix={washScale.sfx} description="DREF sector allocations" /></div>
          <div className="stat"><KeyFigure value={people.val} label="People Targeted" suffix={people.sfx} /></div>
          <div className="stat"><KeyFigure value={reached.val} label="People Reached" suffix={reached.sfx} description="DREF Final Reports" /></div>
          <div className="stat"><KeyFigure value={stats.countries} label="Countries Affected" description="unique countries" /></div>
        </div>

        {/* ── Charts row 1 ── */}
        <div className="charts-top">
          <div className="card">
            <div className="card-title">Operations by Year</div>
            <div className="card-sub">WASH DREF operations and Emergency Appeals approved per year</div>
            <div className="chart-wrap"><canvas ref={yearRef} /></div>
          </div>
          <div className="card">
            <div className="card-title">Operations by Region</div>
            <div className="card-sub">Distribution across IFRC regions</div>
            <div className="chart-wrap"><canvas ref={regionRef} /></div>
          </div>
        </div>

        {/* ── Charts row 2 ── */}
        <div className="charts-bot">
          <div className="card">
            <div className="card-title">{stats.hasSectorData ? 'Budget by Sector' : 'Budget Overview'}</div>
            <div className="card-sub">
              {stats.hasSectorData
                ? 'Total approved budget per sector across filtered WASH operations (CHF)'
                : 'Total amount requested vs funded (CHF)'}
            </div>
            <div className="chart-wrap chart-tall"><canvas ref={sectorRef} /></div>
          </div>
          <div className="card">
            <div className="card-title">Disaster Types</div>
            <div className="card-sub">Top categories in filtered results</div>
            <div className="chart-wrap"><canvas ref={dtypeRef} /></div>
          </div>
        </div>

        {/* ── People Analysis ── */}
        <div className="section-hdr">
          <span className="section-hdr-title">People &amp; WASH Budget Analysis</span>
          <span className="section-hdr-badge">DREF reached figures from Final Reports only</span>
        </div>

        <div className="hw-stats">
          <div className="hw-stat hw-wash">
            <div className="hw-icon">💧</div>
            <div>
              <div className="hw-stat-lbl">WASH Budget</div>
              <div className="hw-stat-val">{fMoney(stats.washBudget)}</div>
              <div className="hw-stat-sub">{stats.sectorTotal > 0 ? `${(stats.washBudget / stats.sectorTotal * 100).toFixed(1)}% of sector-tracked total` : 'DREF operations only'}</div>
            </div>
          </div>
          <div className="hw-stat hw-health">
            <div className="hw-icon">👥</div>
            <div>
              <div className="hw-stat-lbl">People Targeted</div>
              <div className="hw-stat-val">{fNum(stats.totalPeople)}</div>
              <div className="hw-stat-sub">across all WASH operations</div>
            </div>
          </div>
          <div className="hw-stat hw-combo">
            <div className="hw-icon">✅</div>
            <div>
              <div className="hw-stat-lbl">People Reached</div>
              <div className="hw-stat-val">{fNum(stats.peopleReached) !== '—' ? fNum(stats.peopleReached) : '—'}</div>
              <div className="hw-stat-sub">
                {stats.reachRate != null ? `${stats.reachRate.toFixed(1)}% reach rate` : 'no reach data in current filter'}
              </div>
            </div>
          </div>
        </div>

        <div className="charts-top" style={{ marginBottom: '16px' }}>
          <div className="card">
            <div className="card-title">People Targeted vs Reached by Year</div>
            <div className="card-sub">Annual figures across filtered WASH operations (reach from DREF Final Reports)</div>
            <div className="chart-wrap"><canvas ref={hwYearRef} /></div>
          </div>
          <div className="card">
            <div className="card-title">People Targeted vs Reached by Region</div>
            <div className="card-sub">Total per IFRC region</div>
            <div className="chart-wrap"><canvas ref={hwRegionRef} /></div>
          </div>
        </div>

        {/* ── Deployed Personnel & ERUs ── */}
        <div className="section-hdr">
          <span className="section-hdr-title">Deployed WASH Personnel &amp; ERUs</span>
          <span className="section-hdr-badge">Live from IFRC GO · not affected by filters above</span>
        </div>

        {/* ERU Charts */}
        <div className="charts-top" style={{ marginBottom: '16px' }}>
          <div className="card">
            <div className="card-title">Active WASH ERUs by Type</div>
            <div className="card-sub">Currently deployed WASH ERU types</div>
            <div className="chart-wrap chart-tall"><canvas ref={eruTypeRef} /></div>
          </div>
          <div className="card">
            <div className="card-title">Active WASH ERUs by Emergency</div>
            <div className="card-sub">Which emergencies currently have WASH ERUs deployed</div>
            <div className="chart-wrap chart-tall"><canvas ref={eruEventRef} /></div>
          </div>
        </div>
        <div style={{ marginBottom: '16px' }}>
          <div className="card">
            <div className="card-title">WASH ERU Deployment Timeline</div>
            <div className="card-sub">Deployment period for each active WASH ERU (start → end date)</div>
            <div className="chart-wrap chart-tall"><canvas ref={eruTimelineRef} /></div>
          </div>
        </div>

        {/* Personnel Table */}
        <div style={{ marginBottom: '16px' }}>
          <div className="tbl-card">
            <div className="tbl-head">
              <div className="tbl-head-title">WASH Personnel Deployments</div>
              <div className="tbl-count">{filteredPersonnel.length} of {personnelData.length} from 500 most recent</div>
            </div>
            <div className="filters" style={{ padding: '8px 12px', gap: 8 }}>
              <div className="filter-row" style={{ gap: 8 }}>
                <div className="filter-field">
                  <label className="filter-label" htmlFor="pRole">Role</label>
                  <input id="pRole" className="filter-input" type="text" value={personnelFilterRole} onChange={e => setPersonnelFilterRole(e.target.value)} placeholder="Search role…" />
                </div>
                <div className="filter-field">
                  <label className="filter-label" htmlFor="pCountry">Deployed To</label>
                  <input id="pCountry" className="filter-input" type="text" value={personnelFilterCountry} onChange={e => setPersonnelFilterCountry(e.target.value)} placeholder="Search country…" />
                </div>
                <div className="filter-field">
                  <label className="filter-label" htmlFor="pStatus">Status</label>
                  <select id="pStatus" className="filter-select" value={personnelFilterStatus} onChange={e => setPersonnelFilterStatus(e.target.value)}>
                    <option value="all">All</option>
                    <option value="active">Active</option>
                    <option value="completed">Completed</option>
                    <option value="upcoming">Upcoming</option>
                  </select>
                </div>
                <div className="filter-field">
                  <label className="filter-label" htmlFor="pDateFrom">Start From</label>
                  <input id="pDateFrom" className="filter-input" type="date" value={personnelFilterDateFrom} onChange={e => setPersonnelFilterDateFrom(e.target.value)} />
                </div>
                <div className="filter-field">
                  <label className="filter-label" htmlFor="pDateTo">Start To</label>
                  <input id="pDateTo" className="filter-input" type="date" value={personnelFilterDateTo} onChange={e => setPersonnelFilterDateTo(e.target.value)} />
                </div>
                <div className="filter-field"><label className="filter-label">&nbsp;</label>
                  <button className="btn-reset" onClick={() => { setPersonnelFilterRole(''); setPersonnelFilterCountry(''); setPersonnelFilterStatus('all'); setPersonnelFilterDateFrom(''); setPersonnelFilterDateTo(''); }}>Reset</button>
                </div>
              </div>
            </div>
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Role</th>
                    <th>Type</th>
                    <th>From</th>
                    <th>To Country</th>
                    <th>Start</th>
                    <th>End</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPersonnel.length === 0 && (
                    <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--faint)', padding: '24px' }}>No personnel match the current filters</td></tr>
                  )}
                  {filteredPersonnel.map(p => {
                    const today = new Date().toISOString().slice(0, 10);
                    const start = p.start_date || '';
                    const end   = p.end_date   || '';
                    const isActive    = start && start <= today && (!end || end >= today);
                    const isCompleted = end && end < today;
                    const isUpcoming  = start && start > today;
                    return (
                      <tr key={p.id}>
                        <td style={{ maxWidth: 220 }}>{p.role || '—'}</td>
                        <td><span className="badge b-stage">{(p.type || '').toUpperCase()}</span></td>
                        <td>{p.country_from?.name || '—'}</td>
                        <td>{p.country_to?.name || p.deployment?.country_deployed_to?.name || '—'}</td>
                        <td>{p.start_date || '—'}</td>
                        <td>{p.end_date || '—'}</td>
                        <td>
                          {isActive    ? <span className="badge b-active">Active</span>
                         : isCompleted ? <span className="badge b-closed">Completed</span>
                         : isUpcoming  ? <span className="badge b-stage">Upcoming</span>
                         :               <span className="faint">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ── Operations Table ── */}
        <div className="tbl-card">
          <div className="tbl-head">
            <div className="tbl-head-title">WASH Operations</div>
            <div className="tbl-count">
              {filtered.length.toLocaleString()} records
              {filtered.some(r => r._legacy) && (
                <span style={{ marginLeft: 10 }}>
                  <span className="badge b-legacy">No sector data</span>
                  <span style={{ marginLeft: 5, color: '#92400E', fontSize: 11 }}>= pre-2022 DREF matched by flood / cholera / hepatitis E / typhoid</span>
                </span>
              )}
            </div>
          </div>
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Country</th>
                  <th>Region</th>
                  <th>Type</th>
                  <th>Disaster</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>WASH Budget</th>
                  <th>Total Budget</th>
                  <th>EA Coverage</th>
                  <th>People Targeted</th>
                  <th>People Reached</th>
                </tr>
              </thead>
              <tbody>
                {pageData.map((row, idx) => (
                  <tr key={idx} className={row._legacy ? 'row-legacy' : ''}>
                    <td>{row.appeal_id}</td>
                    <td><NameCell name={row.name} link={row.link} /></td>
                    <td>{row.country}</td>
                    <td>{row.region}</td>
                    <td><TypeBadge src={row._src} /></td>
                    <td><DisasterCell disaster={row.disaster} /></td>
                    <td><StatusCell status={row.status} stage={row.stage} /></td>
                    <td>{row.date || '—'}</td>
                    <td>
                      {row._legacy
                        ? <span className="badge b-legacy" title="Pre-2022 operation — no sector budget data available">No sector data</span>
                        : row._src === 'dref' ? <span className="num">{fMoney(row.washBudget)}</span>
                        : <span className="faint">—</span>}
                    </td>
                    <td><span className="num">{fMoney(row.total_budget)}</span></td>
                    <td><CoverageCell src={row._src} total={row.total_budget} funded={row.amount_funded} /></td>
                    <td><span className="num">{fNum(row.people_targeted)}</span></td>
                    <td><span className="num">{row._src === 'dref' && row.people_reached ? fNum(row.people_reached) : <span className="faint">—</span>}</span></td>
                  </tr>
                ))}
                {pageData.length === 0 && (
                  <tr><td colSpan={13} style={{ textAlign: 'center', color: 'var(--faint)', padding: '32px' }}>No operations match the current filters</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <div className="pg-info">
              {filtered.length > 0
                ? `Showing ${(page - 1) * PG + 1}–${Math.min(page * PG, filtered.length)} of ${filtered.length.toLocaleString()} operations`
                : 'No operations match the current filters'}
            </div>
            <Pager activePage={page} itemsCount={filtered.length} maxItemsPerPage={PG} onActivePageChange={setPage} />
          </div>
        </div>

      </div>
    </>
  );
}
