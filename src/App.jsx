import { useState, useEffect, useRef, useMemo } from 'react';
import Chart from 'chart.js/auto';

/* ── Constants ────────────────────────────────────────────────────── */

const SECTORS = [
  { key: 'sector_shelter_and_basic_household_items',              label: 'Shelter & NFIs',        color: '#3B82F6' },
  { key: 'sector_livelihoods',                                    label: 'Livelihoods',            color: '#10B981' },
  { key: 'sector_multi_purpose_cash_grants',                      label: 'Cash Grants',            color: '#F59E0B' },
  { key: 'sector_health',                                         label: 'Health',                 color: '#EF4444' },
  { key: 'sector_water_sanitation_and_hygiene',                   label: 'WASH',                   color: '#06B6D4' },
  { key: 'sector_protection_gender_and_inclusion',                label: 'Protection & Gender',    color: '#8B5CF6' },
  { key: 'sector_education',                                      label: 'Education',              color: '#F97316' },
  { key: 'sector_migration_and_displacement',                     label: 'Migration',              color: '#EC4899' },
  { key: 'sector_risk_reduction_climate_adaptation_and_recovery', label: 'Risk Reduction',         color: '#84CC16' },
  { key: 'sector_community_engagement_and_accountability',        label: 'CEA',                    color: '#14B8A6' },
  { key: 'sector_environmental_sustainability',                   label: 'Environment',            color: '#6366F1' },
  { key: 'sector_coordination_and_partnerships',                  label: 'Coordination',           color: '#D97706' },
  { key: 'sector_secretariat_services',                           label: 'Secretariat Services',   color: '#9CA3AF' },
  { key: 'sector_national_society_strengthening',                 label: 'NS Strengthening',       color: '#1D4ED8' },
];

const DISASTER_PILL = { Epidemic: 'pill-ep', Flood: 'pill-fl', Cyclone: 'pill-cy', Earthquake: 'pill-eq' };

const TYPE_OPTIONS = [
  { value: 'all', label: 'All Types' },
  { value: 'dref', label: 'DREF' },
  { value: 'ea', label: 'Emergency Appeal' },
];
const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'active', label: 'Active' },
  { value: 'closed', label: 'Closed' },
];
const REGION_OPTIONS = [
  { value: 'all', label: 'All Regions' },
  { value: 'Africa', label: 'Africa' },
  { value: 'Americas', label: 'Americas' },
  { value: 'Asia Pacific', label: 'Asia Pacific' },
  { value: 'Europe', label: 'Europe' },
  { value: 'Middle East & North Africa', label: 'Middle East & North Africa' },
];
const QUICK_FILTERS = [
  { term: 'Epidemic',            label: 'Epidemic / Outbreak',  cls: 'tag-ep' },
  { term: 'Flood',               label: 'Flood',                cls: 'tag-fl' },
  { term: 'Cyclone',             label: 'Cyclone',              cls: 'tag-cy' },
  { term: 'Drought',             label: 'Drought',              cls: 'tag-dr' },
  { term: 'Earthquake',          label: 'Earthquake',           cls: 'tag-eq' },
  { term: 'Population Movement', label: 'Population Movement',  cls: 'tag-pm' },
  { term: 'Food Insecurity',     label: 'Food Insecurity',      cls: 'tag-fi' },
];

const PG = 25;

/* ── Formatters ───────────────────────────────────────────────────── */

function fMoney(v) {
  if (!v) return '—';
  if (v >= 1e9) return `CHF ${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `CHF ${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `CHF ${(v / 1e3).toFixed(0)}K`;
  return `CHF ${v.toFixed(0)}`;
}
function fNum(v) {
  if (!v) return '—';
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return v.toLocaleString();
}
function scaleBudget(v) {
  if (!v) return { val: undefined, sfx: '' };
  if (v >= 1e9) return { val: +((v / 1e9).toFixed(2)), sfx: 'B CHF' };
  if (v >= 1e6) return { val: +((v / 1e6).toFixed(1)), sfx: 'M CHF' };
  return { val: +((v / 1e3).toFixed(0)), sfx: 'K CHF' };
}
function scalePeople(v) {
  if (!v) return { val: undefined, sfx: '' };
  if (v >= 1e6) return { val: +((v / 1e6).toFixed(1)), sfx: 'M' };
  if (v >= 1e3) return { val: +((v / 1e3).toFixed(0)), sfx: 'K' };
  return { val: v, sfx: '' };
}

/* ── Data processing ──────────────────────────────────────────────── */

function processDref(raw) {
  const list = Array.isArray(raw) ? raw : (raw?.results ?? []);
  const groups = {};
  list.forEach(r => {
    if (!groups[r.appeal_id]) groups[r.appeal_id] = [];
    groups[r.appeal_id].push(r);
  });
  return Object.entries(groups).map(([aid, stages]) => {
    const latest = stages.find(s => s.is_latest_stage) || stages.at(-1);
    const app = stages.find(s => s.stage === 'Application') || stages[0];
    const date =
      app.date_of_approval ||
      app.start_date_of_operation ||
      latest.start_date_of_operation ||
      (latest.modified_at || '').substring(0, 10);
    const sectorBudgets = {};
    SECTORS.forEach(s => { sectorBudgets[s.key] = latest[s.key + '_budget'] || 0; });
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
      link: latest.link_to_emergency_page || app.link_to_emergency_page,
      sectorBudgets,
    };
  });
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
    link: null,
    sectorBudgets: null,
  }));
}

/* ── Inline UI components ─────────────────────────────────────────── */

function KeyFigure({ value, label, suffix, description }) {
  const display = value != null ? `${value}${suffix ? ' ' + suffix : ''}` : '—';
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
      <select
        id={name}
        className="filter-select"
        value={value}
        onChange={e => onChange(e.target.value)}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function FilterSelectYear({ label, name, value, options, onChange }) {
  return (
    <div className="filter-field">
      <label className="filter-label" htmlFor={name}>{label}</label>
      <select
        id={name}
        className="filter-select"
        value={value ?? ''}
        onChange={e => onChange(e.target.value ? Number(e.target.value) : undefined)}
      >
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
      <input
        id={name}
        className="filter-input"
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function Pager({ activePage, itemsCount, maxItemsPerPage, onActivePageChange }) {
  const totalPages = Math.ceil(itemsCount / maxItemsPerPage);
  if (totalPages <= 1) return null;
  const pages = [];
  const start = Math.max(1, activePage - 2);
  const end = Math.min(totalPages, activePage + 2);
  for (let i = start; i <= end; i++) pages.push(i);
  return (
    <div className="pager">
      <button className="pg-btn" disabled={activePage === 1} onClick={() => onActivePageChange(activePage - 1)}>‹</button>
      {start > 1 && (
        <>
          <button className="pg-btn" onClick={() => onActivePageChange(1)}>1</button>
          {start > 2 && <span className="pg-ellipsis">…</span>}
        </>
      )}
      {pages.map(p => (
        <button key={p} className={`pg-btn${p === activePage ? ' pg-active' : ''}`} onClick={() => onActivePageChange(p)}>{p}</button>
      ))}
      {end < totalPages && (
        <>
          {end < totalPages - 1 && <span className="pg-ellipsis">…</span>}
          <button className="pg-btn" onClick={() => onActivePageChange(totalPages)}>{totalPages}</button>
        </>
      )}
      <button className="pg-btn" disabled={activePage === totalPages} onClick={() => onActivePageChange(activePage + 1)}>›</button>
    </div>
  );
}

/* ── Cell renderers ───────────────────────────────────────────────── */

function NameCell({ name, link }) {
  return link
    ? <a href={link} target="_blank" rel="noopener" className="name-link">{name}</a>
    : <span>{name}</span>;
}
function TypeBadge({ src }) {
  return src === 'dref'
    ? <span className="badge b-dref">DREF</span>
    : <span className="badge b-ea">EA</span>;
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
      <div className="bbar-bg">
        <div className={`bbar-fill ${cls}`} style={{ width: `${pct.toFixed(0)}%` }} />
      </div>
      <span className="bbar-pct">{pct.toFixed(0)}%</span>
    </div>
  );
}

/* ── Chart drawing ────────────────────────────────────────────────── */

const RCOLS = ['#F5333F', '#FF6B35', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6'];
const DCOLS = ['#F5333F', '#3B82F6', '#F59E0B', '#10B981', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#9CA3AF'];

function baseOpts(legend = true) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: legend
        ? { position: 'top', labels: { font: { size: 11 }, usePointStyle: true, pointStyleWidth: 8 } }
        : { display: false },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 11 } } },
      y: { grid: { color: '#F3F4F6' }, ticks: { font: { size: 11 }, precision: 0 } },
    },
  };
}

const moneyTooltip = { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fMoney(ctx.raw)}` } };
const moneyAxisX   = { grid: { color: '#F3F4F6' }, ticks: { font: { size: 11 }, callback: v => fMoney(v) } };
const moneyAxisY   = { grid: { color: '#F3F4F6' }, ticks: { font: { size: 11 }, callback: v => fMoney(v) } };
const plainAxisX   = { grid: { display: false }, ticks: { font: { size: 11 } } };
const plainAxisY   = { grid: { display: false }, ticks: { font: { size: 11 } } };

function drawCharts(filtered, refs, instances) {
  const withSectors  = filtered.filter(o => o.sectorBudgets);
  const hasSectorData = withSectors.length > 0;

  // Operations by Year
  if (refs.year) {
    const byYear = {};
    filtered.forEach(op => {
      if (!op.date) return;
      const y = new Date(op.date).getFullYear();
      if (y < 2018 || y > 2026) return;
      if (!byYear[y]) byYear[y] = { dref: 0, ea: 0 };
      if (op._src === 'dref') byYear[y].dref++; else byYear[y].ea++;
    });
    const yrs = Object.keys(byYear).sort();
    instances.year = new Chart(refs.year, {
      type: 'bar',
      data: {
        labels: yrs,
        datasets: [
          { label: 'DREF',             data: yrs.map(y => byYear[y].dref), backgroundColor: '#F5333F', borderRadius: 3, stack: 's' },
          { label: 'Emergency Appeal', data: yrs.map(y => byYear[y].ea),   backgroundColor: '#FF6B35', borderRadius: 3, stack: 's' },
        ],
      },
      options: baseOpts(true),
    });
  }

  // Operations by Region
  if (refs.region) {
    const counts = {};
    filtered.forEach(op => { counts[op.region] = (counts[op.region] || 0) + 1; });
    const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    instances.region = new Chart(refs.region, {
      type: 'bar',
      data: {
        labels: rows.map(r => r[0]),
        datasets: [{ label: 'Operations', data: rows.map(r => r[1]), backgroundColor: rows.map((_, i) => RCOLS[i % RCOLS.length]), borderRadius: 4 }],
      },
      options: { ...baseOpts(false), indexAxis: 'y' },
    });
  }

  // Budget by Sector  –OR–  Requested vs Funded overview for EA
  if (refs.sector) {
    if (hasSectorData) {
      const totals = SECTORS.map(s => ({
        label: s.label,
        sum: withSectors.reduce((acc, op) => acc + (op.sectorBudgets[s.key] || 0), 0),
        color: s.color,
      })).filter(s => s.sum > 0).sort((a, b) => b.sum - a.sum);
      instances.sector = new Chart(refs.sector, {
        type: 'bar',
        data: {
          labels: totals.map(s => s.label),
          datasets: [{ label: 'Budget (CHF)', data: totals.map(s => s.sum), backgroundColor: totals.map(s => s.color), borderRadius: 4 }],
        },
        options: {
          ...baseOpts(false), indexAxis: 'y',
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ' ' + fMoney(ctx.raw) } } },
          scales: { x: moneyAxisX, y: plainAxisY },
        },
      });
    } else {
      const totalReq    = filtered.reduce((s, o) => s + (o.total_budget  || 0), 0);
      const totalFunded = filtered.reduce((s, o) => s + (o.amount_funded || 0), 0);
      instances.sector = new Chart(refs.sector, {
        type: 'bar',
        data: {
          labels: ['Amount Requested', 'Amount Funded'],
          datasets: [{ data: [totalReq, totalFunded], backgroundColor: ['#FF6B35', '#10B981'], borderRadius: 4 }],
        },
        options: {
          ...baseOpts(false), indexAxis: 'y',
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ' ' + fMoney(ctx.raw) } } },
          scales: { x: moneyAxisX, y: plainAxisY },
        },
      });
    }
  }

  // Disaster Types
  if (refs.dtype) {
    const counts = {};
    filtered.forEach(op => { counts[op.disaster] = (counts[op.disaster] || 0) + 1; });
    let rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (rows.length > 9) {
      const other = rows.slice(9).reduce((s, [, v]) => s + v, 0);
      rows = [...rows.slice(0, 9), ['Other', other]];
    }
    instances.dtype = new Chart(refs.dtype, {
      type: 'doughnut',
      data: {
        labels: rows.map(r => r[0]),
        datasets: [{ data: rows.map(r => r[1]), backgroundColor: DCOLS.slice(0, rows.length), borderWidth: 2, borderColor: '#fff' }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '55%',
        plugins: {
          legend: {
            position: 'right',
            labels: {
              font: { size: 11 }, usePointStyle: true, pointStyleWidth: 8, boxHeight: 8,
              generateLabels: chart => chart.data.labels.map((lbl, i) => ({
                text: `${lbl} (${chart.data.datasets[0].data[i]})`,
                fillStyle: chart.data.datasets[0].backgroundColor[i],
                strokeStyle: '#fff', pointStyle: 'circle', index: i,
              })),
            },
          },
        },
      },
    });
  }

  // Budget by Year  –  H&W breakdown (DREF) or Requested vs Funded (EA)
  if (refs.hwYear) {
    if (hasSectorData) {
      const byYear = {};
      withSectors.filter(o => o.date).forEach(op => {
        const y = new Date(op.date).getFullYear();
        if (y < 2018 || y > 2026) return;
        const yk = String(y);
        if (!byYear[yk]) byYear[yk] = { health: 0, wash: 0 };
        byYear[yk].health += op.sectorBudgets.sector_health || 0;
        byYear[yk].wash   += op.sectorBudgets.sector_water_sanitation_and_hygiene || 0;
      });
      const yrs = Object.keys(byYear).sort();
      instances.hwYear = new Chart(refs.hwYear, {
        type: 'bar',
        data: {
          labels: yrs,
          datasets: [
            { label: 'Health', data: yrs.map(y => byYear[y].health), backgroundColor: '#EF4444', borderRadius: 3 },
            { label: 'WASH',   data: yrs.map(y => byYear[y].wash),   backgroundColor: '#06B6D4', borderRadius: 3 },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: { legend: { position: 'top', labels: { font: { size: 11 }, usePointStyle: true, pointStyleWidth: 8 } }, tooltip: moneyTooltip },
          scales: { x: plainAxisX, y: moneyAxisY },
        },
      });
    } else {
      const byYear = {};
      filtered.filter(o => o.date).forEach(op => {
        const y = new Date(op.date).getFullYear();
        if (y < 2018 || y > 2026) return;
        const yk = String(y);
        if (!byYear[yk]) byYear[yk] = { req: 0, funded: 0 };
        byYear[yk].req    += op.total_budget   || 0;
        byYear[yk].funded += op.amount_funded  || 0;
      });
      const yrs = Object.keys(byYear).sort();
      instances.hwYear = new Chart(refs.hwYear, {
        type: 'bar',
        data: {
          labels: yrs,
          datasets: [
            { label: 'Requested', data: yrs.map(y => byYear[y].req),    backgroundColor: '#FF6B35', borderRadius: 3 },
            { label: 'Funded',    data: yrs.map(y => byYear[y].funded), backgroundColor: '#10B981', borderRadius: 3 },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: { legend: { position: 'top', labels: { font: { size: 11 }, usePointStyle: true, pointStyleWidth: 8 } }, tooltip: moneyTooltip },
          scales: { x: plainAxisX, y: moneyAxisY },
        },
      });
    }
  }

  // Budget by Region  –  H&W breakdown (DREF) or Requested vs Funded (EA)
  if (refs.hwRegion) {
    if (hasSectorData) {
      const byRegion = {};
      withSectors.forEach(op => {
        const r = op.region || 'Unknown';
        if (!byRegion[r]) byRegion[r] = { health: 0, wash: 0 };
        byRegion[r].health += op.sectorBudgets.sector_health || 0;
        byRegion[r].wash   += op.sectorBudgets.sector_water_sanitation_and_hygiene || 0;
      });
      const rows = Object.entries(byRegion)
        .map(([r, v]) => ({ r, ...v, total: v.health + v.wash }))
        .sort((a, b) => b.total - a.total);
      instances.hwRegion = new Chart(refs.hwRegion, {
        type: 'bar',
        data: {
          labels: rows.map(r => r.r),
          datasets: [
            { label: 'Health', data: rows.map(r => r.health), backgroundColor: '#EF4444', borderRadius: 3, stack: 's' },
            { label: 'WASH',   data: rows.map(r => r.wash),   backgroundColor: '#06B6D4', borderRadius: 3, stack: 's' },
          ],
        },
        options: {
          indexAxis: 'y', responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { position: 'top', labels: { font: { size: 11 }, usePointStyle: true, pointStyleWidth: 8 } },
            tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fMoney(ctx.raw)}`, afterBody: items => { const t = items.reduce((s, i) => s + i.raw, 0); return t > 0 ? [`Total: ${fMoney(t)}`] : []; } } },
          },
          scales: { x: moneyAxisX, y: plainAxisY },
        },
      });
    } else {
      const byRegion = {};
      filtered.forEach(op => {
        const r = op.region || 'Unknown';
        if (!byRegion[r]) byRegion[r] = { req: 0, funded: 0 };
        byRegion[r].req    += op.total_budget   || 0;
        byRegion[r].funded += op.amount_funded  || 0;
      });
      const rows = Object.entries(byRegion)
        .map(([r, v]) => ({ r, ...v }))
        .sort((a, b) => b.req - a.req);
      instances.hwRegion = new Chart(refs.hwRegion, {
        type: 'bar',
        data: {
          labels: rows.map(r => r.r),
          datasets: [
            { label: 'Requested', data: rows.map(r => r.req),    backgroundColor: '#FF6B35', borderRadius: 3, stack: 's' },
            { label: 'Funded',    data: rows.map(r => r.funded), backgroundColor: '#10B981', borderRadius: 3, stack: 's' },
          ],
        },
        options: {
          indexAxis: 'y', responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { position: 'top', labels: { font: { size: 11 }, usePointStyle: true, pointStyleWidth: 8 } },
            tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fMoney(ctx.raw)}`, afterBody: items => { const t = items.reduce((s, i) => s + i.raw, 0); return t > 0 ? [`Total: ${fMoney(t)}`] : []; } } },
          },
          scales: { x: moneyAxisX, y: plainAxisY },
        },
      });
    }
  }
}

/* ── App ──────────────────────────────────────────────────────────── */

export default function App() {
  const [loading, setLoading] = useState(true);
  const [drefOps, setDrefOps] = useState([]);
  const [eaOps, setEaOps] = useState([]);
  const [filterType, setFilterType] = useState('all');
  const [filterYearFrom, setFilterYearFrom] = useState(undefined);
  const [filterYearTo, setFilterYearTo] = useState(undefined);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterRegion, setFilterRegion] = useState('all');
  const [filterDisaster, setFilterDisaster] = useState('');
  const [filterName, setFilterName] = useState('');
  const [page, setPage] = useState(1);

  const yearRef     = useRef(null);
  const regionRef   = useRef(null);
  const sectorRef   = useRef(null);
  const dtypeRef    = useRef(null);
  const hwYearRef   = useRef(null);
  const hwRegionRef = useRef(null);
  const chartInstances = useRef({});

  useEffect(() => {
    Promise.all([
      fetch('/api/dref3').then(r => r.json()),
      fetch('/api/appeals').then(r => r.json()),
    ]).then(([dref3, eas]) => {
      setDrefOps(processDref(dref3));
      setEaOps(processEA(eas));
    }).catch(err => {
      console.error('Failed to load data:', err);
    }).finally(() => {
      setLoading(false);
    });
  }, []);

  const years = useMemo(() => {
    const yrs = new Set();
    [...drefOps, ...eaOps].forEach(op => {
      if (op.date) {
        const y = new Date(op.date).getFullYear();
        if (y >= 2018 && y <= 2026) yrs.add(y);
      }
    });
    return [...yrs].sort((a, b) => b - a);
  }, [drefOps, eaOps]);

  const filtered = useMemo(() => {
    let pool = [];
    if (filterType !== 'ea') pool.push(...drefOps);
    if (filterType !== 'dref') pool.push(...eaOps);
    return pool
      .filter(op => {
        if (op.date) {
          const y = new Date(op.date).getFullYear();
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
      })
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [drefOps, eaOps, filterType, filterYearFrom, filterYearTo, filterStatus, filterRegion, filterDisaster, filterName]);

  const stats = useMemo(() => {
    const drefs   = filtered.filter(o => o._src === 'dref');
    const eas     = filtered.filter(o => o._src === 'ea');
    const totalBudget  = filtered.reduce((s, o) => s + (o.total_budget || 0), 0);
    const totalPeople  = filtered.reduce((s, o) => s + (o.people_targeted || 0), 0);
    const countries    = new Set(filtered.map(o => o.country_iso3).filter(Boolean)).size;
    const eaReq    = eas.reduce((s, o) => s + (o.total_budget || 0), 0);
    const eaFunded = eas.reduce((s, o) => s + (o.amount_funded || 0), 0);
    const coverage = eaReq > 0 ? (eaFunded / eaReq) * 100 : null;
    const totalFunded   = filtered.reduce((s, o) => s + (o.amount_funded || 0), 0);
    const withSectors   = filtered.filter(o => o.sectorBudgets);
    const sectorTotal   = withSectors.reduce((s, o) => s + (o.total_budget || 0), 0);
    const healthSum     = withSectors.reduce((s, o) => s + (o.sectorBudgets.sector_health || 0), 0);
    const washSum       = withSectors.reduce((s, o) => s + (o.sectorBudgets.sector_water_sanitation_and_hygiene || 0), 0);
    const hasSectorData = withSectors.length > 0;
    return { total: filtered.length, drefCount: drefs.length, eaCount: eas.length, totalBudget, totalFunded, totalPeople, countries, coverage, sectorTotal, healthSum, washSum, hasSectorData };
  }, [filtered]);

  useEffect(() => {
    if (loading) return;
    const instances = chartInstances.current;
    drawCharts(filtered, {
      year: yearRef.current, region: regionRef.current,
      sector: sectorRef.current, dtype: dtypeRef.current,
      hwYear: hwYearRef.current, hwRegion: hwRegionRef.current,
    }, instances);
    return () => {
      Object.values(instances).forEach(c => c?.destroy());
      chartInstances.current = {};
    };
  }, [filtered, loading]);

  const yearOptions = years.map(y => ({ value: y, label: String(y) }));
  const pageData    = filtered.slice((page - 1) * PG, page * PG);
  const budget      = scaleBudget(stats.totalBudget);
  const people      = scalePeople(stats.totalPeople);
  const pct = v => stats.sectorTotal > 0 ? `${(v / stats.sectorTotal * 100).toFixed(1)}% of sector-tracked budget` : '—';

  function reset() {
    setFilterType('all'); setFilterYearFrom(undefined); setFilterYearTo(undefined);
    setFilterStatus('all'); setFilterRegion('all'); setFilterDisaster(''); setFilterName(''); setPage(1);
  }

  return (
    <>
      {loading && (
        <div className="loading-overlay">
          <div className="spinner" />
          <span style={{ marginLeft: 12, color: '#6B7280', fontSize: 14 }}>Loading DREF &amp; Emergency Appeal data…</span>
        </div>
      )}

      <header className="header">
        <span className="header-logo">IFRC</span>
        <span className="header-sep" />
        <span className="header-title">DREF &amp; Emergency Appeal Dashboard</span>
      </header>

      <div className="wrap">

        {/* ── Filters ── */}
        <div className="filters">
          <div className="filter-row">
            <FilterSelect
              name="type"
              label="Operation Type"
              options={TYPE_OPTIONS}
              value={filterType}
              onChange={val => { setFilterType(val); setPage(1); }}
            />
            <FilterSelectYear
              name="yearFrom"
              label="Year From"
              options={yearOptions}
              value={filterYearFrom}
              onChange={val => { setFilterYearFrom(val); setPage(1); }}
            />
            <span className="year-arrow">→</span>
            <FilterSelectYear
              name="yearTo"
              label="Year To"
              options={yearOptions}
              value={filterYearTo}
              onChange={val => { setFilterYearTo(val); setPage(1); }}
            />
            <FilterSelect
              name="status"
              label="Status"
              options={STATUS_OPTIONS}
              value={filterStatus}
              onChange={val => { setFilterStatus(val); setPage(1); }}
            />
            <FilterSelect
              name="region"
              label="Region"
              options={REGION_OPTIONS}
              value={filterRegion}
              onChange={val => { setFilterRegion(val); setPage(1); }}
            />
            <FilterInput
              name="disaster"
              label="Disaster Type Search"
              value={filterDisaster}
              onChange={val => { setFilterDisaster(val); setPage(1); }}
              placeholder='e.g. "Epidemic", "Flood"…'
            />
            <FilterInput
              name="name"
              label="Operation Name / Code"
              value={filterName}
              onChange={val => { setFilterName(val); setPage(1); }}
              placeholder="Search name or code…"
            />
            <div className="filter-field">
              <label className="filter-label">&nbsp;</label>
              <button className="btn-reset" onClick={reset}>Reset</button>
            </div>
          </div>

          <div className="tags">
            <span className="tag-label">Quick filters:</span>
            {QUICK_FILTERS.map(qf => (
              <button
                key={qf.term}
                type="button"
                className={`tag ${qf.cls}${filterDisaster === qf.term ? ' active-tag' : ''}`}
                onClick={() => { setFilterDisaster(qf.term); setPage(1); }}
              >
                {qf.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── KPI Stats ── */}
        <div className="stats">
          <div className="stat">
            <KeyFigure
              value={stats.total}
              label="Total Operations"
              description={`${stats.drefCount} DREF · ${stats.eaCount} EA`}
            />
          </div>
          <div className="stat">
            <KeyFigure
              value={budget.val}
              label="Total Budget"
              suffix={budget.sfx}
              description={`across ${stats.total} operations`}
            />
          </div>
          <div className="stat">
            <KeyFigure
              value={people.val}
              label="People Targeted"
              suffix={people.sfx}
            />
          </div>
          <div className="stat">
            <KeyFigure
              value={stats.coverage != null ? +stats.coverage.toFixed(1) : undefined}
              label="EA Funding Coverage"
              suffix="%"
              description="funded / requested (EA only)"
            />
          </div>
          <div className="stat">
            <KeyFigure value={stats.countries} label="Countries Affected" description="unique countries" />
          </div>
        </div>

        {/* ── Charts row 1 ── */}
        <div className="charts-top">
          <div className="card">
            <div className="card-title">Operations by Year</div>
            <div className="card-sub">Number of DREF operations and Emergency Appeals approved per year</div>
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
            <div className="card-title">
              {stats.hasSectorData ? 'Budget by Sector' : 'Budget Overview'}
            </div>
            <div className="card-sub">
              {stats.hasSectorData
                ? 'Total approved budget per sector across filtered operations (CHF)'
                : 'Total amount requested vs funded across filtered operations (CHF)'}
            </div>
            <div className="chart-wrap chart-tall">
              <canvas ref={sectorRef} />
            </div>
          </div>
          <div className="card">
            <div className="card-title">Disaster Types</div>
            <div className="card-sub">Top categories in filtered results</div>
            <div className="chart-wrap"><canvas ref={dtypeRef} /></div>
          </div>
        </div>

        {/* ── Health & WASH / Budget Analysis ── */}
        <div className="section-hdr">
          <span className="section-hdr-title">
            {stats.hasSectorData ? 'Health & WASH Budget Analysis' : 'Budget Analysis'}
          </span>
        </div>

        <div className="hw-stats">
          {stats.hasSectorData ? (
            <>
              <div className="hw-stat hw-health">
                <div className="hw-icon">🏥</div>
                <div>
                  <div className="hw-stat-lbl">Health Budget</div>
                  <div className="hw-stat-val">{fMoney(stats.healthSum)}</div>
                  <div className="hw-stat-sub">{pct(stats.healthSum)}</div>
                </div>
              </div>
              <div className="hw-stat hw-wash">
                <div className="hw-icon">💧</div>
                <div>
                  <div className="hw-stat-lbl">WASH Budget</div>
                  <div className="hw-stat-val">{fMoney(stats.washSum)}</div>
                  <div className="hw-stat-sub">{pct(stats.washSum)}</div>
                </div>
              </div>
              <div className="hw-stat hw-combo">
                <div className="hw-icon">➕</div>
                <div>
                  <div className="hw-stat-lbl">Health + WASH Combined</div>
                  <div className="hw-stat-val">{fMoney(stats.healthSum + stats.washSum)}</div>
                  <div className="hw-stat-sub">{pct(stats.healthSum + stats.washSum)}</div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="hw-stat hw-health">
                <div className="hw-icon">💰</div>
                <div>
                  <div className="hw-stat-lbl">Total Requested</div>
                  <div className="hw-stat-val">{fMoney(stats.totalBudget)}</div>
                  <div className="hw-stat-sub">amount requested</div>
                </div>
              </div>
              <div className="hw-stat hw-wash">
                <div className="hw-icon">✅</div>
                <div>
                  <div className="hw-stat-lbl">Total Funded</div>
                  <div className="hw-stat-val">{fMoney(stats.totalFunded)}</div>
                  <div className="hw-stat-sub">amount funded</div>
                </div>
              </div>
              <div className="hw-stat hw-combo">
                <div className="hw-icon">📊</div>
                <div>
                  <div className="hw-stat-lbl">Funding Coverage</div>
                  <div className="hw-stat-val">
                    {stats.coverage != null ? `${stats.coverage.toFixed(1)}%` : '—'}
                  </div>
                  <div className="hw-stat-sub">funded vs requested</div>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="charts-top" style={{ marginBottom: '16px' }}>
          <div className="card">
            <div className="card-title">
              {stats.hasSectorData ? 'Health vs WASH Budget by Year' : 'Budget by Year'}
            </div>
            <div className="card-sub">
              {stats.hasSectorData
                ? 'Annual CHF allocation for Health and WASH sectors across filtered operations'
                : 'Annual amount requested vs funded across filtered operations (CHF)'}
            </div>
            <div className="chart-wrap"><canvas ref={hwYearRef} /></div>
          </div>
          <div className="card">
            <div className="card-title">
              {stats.hasSectorData ? 'Health vs WASH Budget by Region' : 'Budget by Region'}
            </div>
            <div className="card-sub">
              {stats.hasSectorData
                ? 'Total CHF allocated to Health and WASH per IFRC region'
                : 'Amount requested vs funded per IFRC region (CHF)'}
            </div>
            <div className="chart-wrap"><canvas ref={hwRegionRef} /></div>
          </div>
        </div>

        {/* ── Table ── */}
        <div className="tbl-card">
          <div className="tbl-head">
            <div className="tbl-head-title">Operations</div>
            <div className="tbl-count">{filtered.length.toLocaleString()} records</div>
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
                  <th>Approved</th>
                  <th>Total Budget</th>
                  <th>EA Coverage</th>
                  <th>People Targeted</th>
                </tr>
              </thead>
              <tbody>
                {pageData.map((row, idx) => (
                  <tr key={idx}>
                    <td>{row.appeal_id}</td>
                    <td><NameCell name={row.name} link={row.link} /></td>
                    <td>{row.country}</td>
                    <td>{row.region}</td>
                    <td><TypeBadge src={row._src} /></td>
                    <td><DisasterCell disaster={row.disaster} /></td>
                    <td><StatusCell status={row.status} stage={row.stage} /></td>
                    <td>{row.date || '—'}</td>
                    <td><span className="num">{fMoney(row.total_budget)}</span></td>
                    <td><CoverageCell src={row._src} total={row.total_budget} funded={row.amount_funded} /></td>
                    <td><span className="num">{fNum(row.people_targeted)}</span></td>
                  </tr>
                ))}
                {pageData.length === 0 && (
                  <tr>
                    <td colSpan={11} style={{ textAlign: 'center', color: 'var(--faint)', padding: '32px' }}>
                      No operations match the current filters
                    </td>
                  </tr>
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
            <Pager
              activePage={page}
              itemsCount={filtered.length}
              maxItemsPerPage={PG}
              onActivePageChange={setPage}
            />
          </div>
        </div>

      </div>
    </>
  );
}
