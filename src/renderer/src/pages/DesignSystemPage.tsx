/**
 * Internal design sticker sheet (not linked in the app nav).
 * Import into a throwaway route or Storybook when you need to tweak tokens.
 */

import { useMemo, useState } from 'react';
import { CHART, TYPES, type Type } from '../lib/typechart';

export function DesignSystemPage() {
  return (
    <main className="sheet">
        <Header />
        <ColorPaletteSection />
        <TypographySection />
        <ButtonsSection />
        <SidebarSection />
        <StatCardSection />
        <BoxStorageSection />
        <GenreFlavorSection />
        <TypeChartSection />
        <TrainerCardSection />
        <ImageIntegrationSection />

        <footer className="sheet-foot">
          <div>Pokémon Assistant · Design System v0.2 · Dark mode · Genre flavor</div>
          <div className="mono">tokens.css · components.css · 60+ vars · 9 components</div>
        </footer>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function Header() {
  return (
    <header className="sheet-header">
      <div className="sheet-eyebrow">v0.1 · Sticker Sheet · Dark Mode</div>
      <h1 className="sheet-title">
        Pokémon Assistant<span className="sheet-title-accent">.design</span>
      </h1>
      <p className="sheet-sub">
        A modular dark-mode component sheet for the desktop companion app. Tokens are CSS custom
        properties (drop-in replacement for your existing <code>--bg / --fg / --accent</code> set).
        Components below assume <code>tokens.css</code> is loaded globally.
      </p>
      <div className="sheet-meta">
        <span className="meta-pill"><span className="dot dot-ok" />Tokens · 47</span>
        <span className="meta-pill"><span className="dot dot-accent" />Components · 5</span>
        <span className="meta-pill"><span className="dot dot-warn" />Type colors · 18</span>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// 01 - Color Palette
// ---------------------------------------------------------------------------

interface Swatch {
  name: string;
  hex: string;
  role: string;
  light?: boolean;
}

const SURFACES: Swatch[] = [
  { name: '--bg-0', hex: '#070b14', role: 'App void' },
  { name: '--bg',   hex: '#0f172a', role: 'Main panel' },
  { name: '--bg-1', hex: '#161f37', role: 'Card' },
  { name: '--bg-2', hex: '#1d2843', role: 'Elevated' },
  { name: '--bg-3', hex: '#26324f', role: 'Hover / active' },
  { name: '--bg-4', hex: '#2f3c5c', role: 'Inset / well' },
];

const FOREGROUND: Swatch[] = [
  { name: '--fg',       hex: '#f1f5fb', role: 'Primary text', light: true },
  { name: '--fg-1',     hex: '#c8d1e2', role: 'Body',         light: true },
  { name: '--fg-2',     hex: '#8893ad', role: 'Muted' },
  { name: '--fg-3',     hex: '#5c688a', role: 'Disabled' },
  { name: '--border',   hex: '#2a3554', role: 'Hairline 1px' },
  { name: '--border-2', hex: '#3a4870', role: 'Hairline strong' },
];

const ACCENTS: Swatch[] = [
  { name: '--accent',     hex: '#38bdf8', role: 'Primary · cyan' },
  { name: '--accent-2',   hex: '#0ea5e9', role: 'Hover' },
  { name: '--accent-alt', hex: '#f472b6', role: 'Secondary · pink' },
  { name: '--ok',         hex: '#22c55e', role: 'Success · KO' },
  { name: '--warn',       hex: '#eab308', role: 'Warn · chance' },
  { name: '--danger',     hex: '#ef4444', role: 'Danger · weak' },
];

function SwatchTile({ s }: { s: Swatch }) {
  return (
    <div className={`swatch ${s.light ? 'swatch-light' : ''}`} style={{ background: s.hex }}>
      <div className="swatch-meta">
        <span className="swatch-name">{s.name}</span>
        <span className="swatch-hex">{s.hex}</span>
      </div>
      <div className="swatch-role">{s.role}</div>
    </div>
  );
}

function ColorPaletteSection() {
  return (
    <section className="sheet-section" id="colors">
      <div className="sheet-section-head">
        <div className="section-num">01</div>
        <div>
          <h2 className="section-title">Color Palette</h2>
          <p className="section-desc">
            All colors are CSS custom properties on <code>:root</code>. Use semantic tokens (
            <code>--fg</code>, <code>--accent</code>) in components - never raw hex. A{' '}
            <code>:root[data-theme="light"]</code> overlay can flip these without touching
            component CSS.
          </p>
        </div>
      </div>

      <h3 className="group-label">Surfaces · vertical depth</h3>
      <div className="swatch-grid">
        {SURFACES.map((s) => <SwatchTile key={s.name} s={s} />)}
      </div>

      <h3 className="group-label">Foreground · text and borders</h3>
      <div className="swatch-grid">
        {FOREGROUND.map((s) => <SwatchTile key={s.name} s={s} />)}
      </div>

      <h3 className="group-label">Brand · accents & status</h3>
      <div className="swatch-grid">
        {ACCENTS.map((s) => <SwatchTile key={s.name} s={s} />)}
      </div>

      <h3 className="group-label">Type colors · 18 attacking &amp; defending</h3>
      <div className="type-grid">
        {TYPES.map((t) => (
          <span key={t} className="type-chip" data-type={t}>
            {t[0].toUpperCase() + t.slice(1)}
          </span>
        ))}
      </div>
      <div className="type-usage">
        <span className="type-badge" data-type="dragon">Dragon</span>
        <span className="type-badge" data-type="ground">Ground</span>
        <span className="type-badge" data-type="fire">Fire</span>
        <span className="type-mult"><span className="type-badge" data-type="ice">Ice</span> <span className="mult danger">×4</span></span>
        <span className="type-mult"><span className="type-badge" data-type="water">Water</span> <span className="mult danger">×2</span></span>
        <span className="type-mult"><span className="type-badge" data-type="grass">Grass</span> <span className="mult ok">×½</span></span>
        <span className="type-mult"><span className="type-badge" data-type="electric">Electric</span> <span className="mult immune">×0</span></span>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 02 - Typography
// ---------------------------------------------------------------------------

function TypographySection() {
  return (
    <section className="sheet-section" id="type">
      <div className="sheet-section-head">
        <div className="section-num">02</div>
        <div>
          <h2 className="section-title">Typography</h2>
          <p className="section-desc">
            <strong>Space Grotesk</strong> for UI display, <strong>Manrope</strong> for body,{' '}
            <strong>JetBrains Mono</strong> for stat numerals, dex IDs, damage rolls, and the event log.
            Tabular figures everywhere numbers line up.
          </p>
        </div>
      </div>
      <div className="type-stack">
        <TypeRow sample="Damage 234–275 · guaranteed OHKO"
                 style={{ font: '600 32px/1.1 var(--font-display)' }}
                 spec={<><code>--font-display</code> · 32 / 600</>} />
        <TypeRow sample="Section title · Recommendations"
                 style={{ font: '600 22px/1.2 var(--font-display)' }}
                 spec={<><code>--font-display</code> · 22 / 600</>} />
        <TypeRow sample="Component label · Predicted sets"
                 style={{ font: '500 15px/1.4 var(--font-display)' }}
                 spec={<><code>--font-display</code> · 15 / 500</>} />
        <TypeRow sample="Body. The Bayesian predictor narrows the opponent's set after every observed event. Confidence climbs as evidence accumulates."
                 style={{ font: '400 14px/1.5 var(--font-body)' }}
                 spec={<><code>--font-body</code> · 14 / 400</>} />
        <TypeRow sample="Caps mono label · ATK · DEF · SPE"
                 style={{ font: '500 11px/1 var(--font-mono)', letterSpacing: '.08em', textTransform: 'uppercase' }}
                 spec={<><code>--font-mono</code> · 11 / 500 · upper</>} />
        <TypeRow sample="#0006  HP 287/287  L50  IV 31/31/31"
                 style={{ font: '500 13px/1.4 var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}
                 spec={<><code>--font-mono</code> · 13 · tabular</>} />
      </div>
    </section>
  );
}

function TypeRow({ sample, style, spec }: { sample: string; style: React.CSSProperties; spec: React.ReactNode }) {
  return (
    <div className="type-row">
      <div className="type-sample" style={style}>{sample}</div>
      <div className="type-spec">{spec}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 03 - Buttons
// ---------------------------------------------------------------------------

function ButtonsSection() {
  return (
    <section className="sheet-section" id="buttons">
      <div className="sheet-section-head">
        <div className="section-num">03</div>
        <div>
          <h2 className="section-title">Buttons</h2>
          <p className="section-desc">
            Primary actions earn a glow; secondaries are outlined hairlines; ghosts are text-only.
            Every variant has hover, focus, disabled, and loading states. Sized small / medium
            (default) / large.
          </p>
        </div>
      </div>

      <div className="component-grid">
        <ComponentCell label="Primary · default" code=".btn.btn-primary">
          <button type="button" className="btn btn-primary">Start battle</button>
          <button type="button" className="btn btn-primary" data-state="hover">Start battle</button>
          <button type="button" className="btn btn-primary" disabled>Start battle</button>
          <button type="button" className="btn btn-primary btn-loading">
            <span className="spinner" />Calculating
          </button>
        </ComponentCell>

        <ComponentCell label="Secondary · outlined" code=".btn.btn-secondary">
          <button type="button" className="btn btn-secondary">Reveal slot</button>
          <button type="button" className="btn btn-secondary" data-state="hover">Reveal slot</button>
          <button type="button" className="btn btn-secondary" disabled>Reveal slot</button>
        </ComponentCell>

        <ComponentCell label="Ghost · text only" code=".btn.btn-ghost">
          <button type="button" className="btn btn-ghost">Cancel</button>
          <button type="button" className="btn btn-ghost" data-state="hover">Cancel</button>
          <button type="button" className="btn btn-ghost" disabled>Cancel</button>
        </ComponentCell>

        <ComponentCell label="Danger" code=".btn.btn-danger">
          <button type="button" className="btn btn-danger">End battle</button>
          <button type="button" className="btn btn-danger" data-state="hover">End battle</button>
        </ComponentCell>

        <ComponentCell label="Sizes" code=".btn-sm · .btn-lg" baseline>
          <button type="button" className="btn btn-primary btn-sm">Small</button>
          <button type="button" className="btn btn-primary">Medium</button>
          <button type="button" className="btn btn-primary btn-lg">Large</button>
        </ComponentCell>

        <ComponentCell label="With leading glyph" code=".btn-glyph">
          <button type="button" className="btn btn-primary"><span className="btn-glyph">+</span>Add to team</button>
          <button type="button" className="btn btn-secondary"><span className="btn-glyph">↻</span>Reset turn</button>
          <button type="button" className="btn btn-ghost"><span className="btn-glyph">⌘</span>Paste Showdown</button>
        </ComponentCell>

        <ComponentCell label="Icon · square" code=".btn-icon">
          <button type="button" className="btn btn-icon" aria-label="Search">⌕</button>
          <button type="button" className="btn btn-icon btn-icon-primary" aria-label="Confirm">✓</button>
          <button type="button" className="btn btn-icon btn-icon-danger" aria-label="Delete">×</button>
        </ComponentCell>

        <ComponentCell label="Segmented · radio" code=".segmented > .seg">
          <Segmented options={['Depth 1', 'Depth 2', 'Depth 3']} initial={0} />
          <Segmented options={['All', 'Caught', 'Box only']} initial={0} />
        </ComponentCell>
      </div>
    </section>
  );
}

function ComponentCell({
  label,
  code,
  baseline,
  children,
}: {
  label: string;
  code: string;
  baseline?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="component-cell">
      <div className="cell-label">{label}</div>
      <div className={`cell-body ${baseline ? 'cell-body-baseline' : ''}`}>{children}</div>
      <code className="cell-code">{code}</code>
    </div>
  );
}

function Segmented({
  options,
  initial = 0,
  size,
}: {
  options: string[];
  initial?: number;
  size?: 'sm';
}) {
  const [active, setActive] = useState(initial);
  return (
    <div className={`segmented ${size === 'sm' ? 'segmented-sm' : ''}`}>
      {options.map((opt, i) => (
        <button
          key={opt}
          type="button"
          className={`seg ${i === active ? 'seg-active' : ''}`}
          onClick={() => setActive(i)}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 04 - Sidebar
// ---------------------------------------------------------------------------

interface SidebarItem {
  glyph: string;
  label: string;
  count?: string;
  badge?: string;
}

const SIDEBAR_ITEMS: SidebarItem[] = [
  { glyph: '⌕', label: 'Pokédex',          count: '1 026' },
  { glyph: '⌬', label: 'Team Builder',     count: '3' },
  { glyph: '⚔', label: 'Battle Assistant' },
  { glyph: '◉', label: 'Battle Session',   badge: 'LIVE' },
  { glyph: '⇄', label: 'Counter Picker' },
  { glyph: '▦', label: 'EV/IV Planner' },
  { glyph: '⌖', label: 'Spawn Locations' },
  { glyph: '◐', label: 'Breeding' },
];

function SidebarSection() {
  const [active, setActive] = useState(2);
  return (
    <section className="sheet-section" id="sidebar">
      <div className="sheet-section-head">
        <div className="section-num">04</div>
        <div>
          <h2 className="section-title">Sidebar Navigation</h2>
          <p className="section-desc">
            Fixed 224px left rail. Brand block top, "Tools" group with 8 tabs, status footer with
            Minecraft connection indicator and data source line. Active tab gets an
            accent left-bar + faint glow.
          </p>
        </div>
      </div>

      <div className="sidebar-demo">
        <aside className="sidebar">
          <div className="sb-brand">
            <div className="sb-mark" aria-hidden="true">
              <svg viewBox="0 0 40 40">
                <defs>
                  <linearGradient id="hexGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#ffd97a" />
                    <stop offset="100%" stopColor="#e9a425" />
                  </linearGradient>
                </defs>
                <polygon points="20,3 34,11 34,29 20,37 6,29 6,11" fill="url(#hexGrad)" stroke="#1a1003" strokeWidth="1" />
                <polygon points="20,3 34,11 34,29 20,37 6,29 6,11" fill="none" stroke="rgba(255,255,255,.4)" strokeWidth=".5" />
                <text x="20" y="25" textAnchor="middle" fontFamily="Space Grotesk, sans-serif" fontWeight="800" fontSize="16" fill="#1a1003">
                  C
                </text>
              </svg>
            </div>
            <div>
              <div className="sb-brand-name">POKÉMON</div>
              <div className="sb-brand-sub">Assistant · v0.4.1</div>
            </div>
          </div>

          <div className="sb-group">
            <div className="sb-group-label">Tools</div>
            {SIDEBAR_ITEMS.map((it, i) => (
              <a
                key={it.label}
                className={`sb-item ${i === active ? 'sb-item-active' : ''}`}
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setActive(i);
                }}
              >
                <span className="sb-glyph">{it.glyph}</span>
                {it.label}
                {it.count && <span className="sb-count">{it.count}</span>}
                {it.badge && <span className="sb-badge">{it.badge}</span>}
              </a>
            ))}
          </div>

          <div className="sb-foot">
            <div className="sb-status">
              <span className="sb-status-dot sb-status-ok" />
              <div>
                <div className="sb-status-line">Connected to Minecraft</div>
                <div className="sb-status-sub">localhost:25575 · 12ms</div>
              </div>
            </div>
            <div className="sb-source">Data · pokemon.json · 2.1MB</div>
          </div>
        </aside>

        <div className="sidebar-callouts">
          {[
            { n: 1, t: 'Brand block',  s: 'Glyph + wordmark + version' },
            { n: 2, t: 'Tools group',  s: 'Counts and live-state badges' },
            { n: 3, t: 'Active state', s: '2px accent rail + bg-2 fill' },
            { n: 4, t: 'Status footer', s: 'Mod connection indicator' },
          ].map((c) => (
            <div key={c.n} className="callout">
              <span className="callout-num">{c.n}</span>
              <div>
                <strong>{c.t}</strong>
                <br />
                <span className="callout-sub">{c.s}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 05 - Stat Card (three densities)
// ---------------------------------------------------------------------------

function StatCardSection() {
  return (
    <section className="sheet-section" id="statcard">
      <div className="sheet-section-head">
        <div className="section-num">05</div>
        <div>
          <h2 className="section-title">Stat Card · Pokémon SlotCard</h2>
          <p className="section-desc">
            The unified species block - used in Pokédex detail, Team Builder slots, and Battle
            Session SlotCards. Three densities: <em>compact</em> (team strip), <em>default</em>{' '}
            (slot card with predicted sets), <em>expanded</em> (detail with stat hexagon, EV/IV
            overlays, nature-modified stats, and move category indicators).
          </p>
        </div>
      </div>

      <div className="statcard-grid">
        <StatCardExpanded />
        <StatCardDefault />
        <StatCardCompactStrip />
      </div>
    </section>
  );
}

function StatCardExpanded() {
  return (
    <article className="statcard statcard-expanded statcard-active" data-types="dragon ground">
      <div className="statcard-bg" aria-hidden="true" />
      <header className="statcard-head">
        <div className="statcard-portrait">
          <div className="portrait-fallback">
            <svg viewBox="0 0 64 64" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.4" opacity=".6">
              <circle cx="32" cy="28" r="14" />
              <path d="M18 50 Q32 38 46 50" />
              <circle cx="27" cy="26" r="2" fill="currentColor" />
              <circle cx="37" cy="26" r="2" fill="currentColor" />
            </svg>
          </div>
          <span className="portrait-dex">#0006</span>
        </div>
        <div className="statcard-id">
          <div className="statcard-name">
            Foliawn<span className="statcard-gender female">♀</span>
          </div>
          <div className="statcard-meta">
            <span className="type-badge" data-type="dragon">Dragon</span>
            <span className="type-badge" data-type="ground">Ground</span>
            <span className="mono-divider">·</span>
            <span className="lv"><span className="lv-prefix">Lv.</span><span className="lv-num">50</span></span>
            <span className="mono-meta">
              Adamant <span className="stat-nature up">▲</span>Atk <span className="stat-nature down">▼</span>SpA
            </span>
            <span className="tera-pill" data-type="fire">TERA · Fire</span>
          </div>
        </div>
        <div className="statcard-actions">
          <button type="button" className="btn btn-icon" aria-label="Lock set">⌗</button>
          <button type="button" className="btn btn-icon" aria-label="Edit">✎</button>
        </div>
      </header>

      <div className="hp-block">
        <div className="hp-label">
          HP <span className="mono">287 / 287</span><span className="hp-pct">100%</span>
        </div>
        <div className="hp-bar"><div className="hp-fill hp-fill-ok" style={{ width: '100%' }} /></div>
      </div>

      <div className="statcard-body">
        <div>
          <div className="block-label">
            Base stats <span className="bst">BST 600</span>
          </div>
          <StatHex />
          <div className="stat-legend">
            <span className="legend-chip"><span className="legend-dot" style={{ background: 'var(--ev-fill)' }} />EV invested</span>
            <span className="legend-chip"><span className="legend-dot" style={{ background: 'var(--iv-perfect)' }} />IV 31</span>
          </div>
        </div>

        <div>
          <div className="block-label">Investment</div>
          <div className="stat-bars">
            <StatBar label="HP"  value={108} fillPct={60} evPct={24} ivTickPct={60} stat="hp" />
            <StatBar label="ATK" value={130} fillPct={72} evPct={50} ivTickPct={72} stat="atk" nature="up" />
            <StatBar label="DEF" value={95}  fillPct={52} evPct={6}  ivTickPct={52} stat="def" />
            <StatBar label="SPA" value={80}  fillPct={44} evPct={0}                 stat="spa" nature="down" />
            <StatBar label="SPD" value={85}  fillPct={47} evPct={0}  ivTickPct={47} stat="spd" />
            <StatBar label="SPE" value={102} fillPct={57} evPct={50} ivTickPct={57} stat="spe" />
          </div>

          <div className="ev-total">
            <span className="block-label block-label-tight">EVs · spent</span>
            <div className="ev-bar"><div className="ev-bar-fill" style={{ width: '100%' }} /></div>
            <span className="ev-count mono">508 / 510</span>
          </div>

          <div className="block-label" style={{ marginTop: 14 }}>Ability · Item</div>
          <div className="kv-row"><span className="kv-k">Ability</span><span className="kv-v">Sand Veil</span></div>
          <div className="kv-row"><span className="kv-k">Hidden</span><span className="kv-v kv-hidden">Rough Skin</span></div>
          <div className="kv-row"><span className="kv-k">Item</span><span className="kv-v">Choice Band</span></div>

          <div className="block-label" style={{ marginTop: 14 }}>Boosts · Volatiles · Status</div>
          <div className="boost-row">
            <span className="boost boost-up">+2 Atk</span>
            <span className="boost boost-down">−1 Def</span>
            <span className="volatile">Substitute</span>
            <span className="status-badge status-brn">BRN</span>
          </div>
        </div>
      </div>

      <footer className="statcard-foot">
        <div className="moves-grid">
          <MoveCell name="Earthquake"   type="ground" power="100" acc="100" category="phys" />
          <MoveCell name="Outrage"      type="dragon" power="120" acc="100" category="phys" />
          <MoveCell name="Fire Fang"    type="fire"   power="65"  acc="95"  category="phys" />
          <MoveCell name="Swords Dance" type="normal" power="-"   acc="-"   category="status" />
        </div>
      </footer>
    </article>
  );
}

function MoveCell({
  name,
  type,
  power,
  acc,
  category,
}: {
  name: string;
  type: string;
  power: string;
  acc: string;
  category: 'phys' | 'spec' | 'status';
}) {
  const catLetter = category === 'phys' ? 'P' : category === 'spec' ? 'S' : '−';
  return (
    <div className="move-cell" data-type={type}>
      <span className={`move-cat move-cat-${category}`}>{catLetter}</span>
      <span className="move-name">{name}</span>
      <span className="move-type">{type[0].toUpperCase() + type.slice(1)}</span>
      <span className="move-meta mono">{power} · {acc}</span>
    </div>
  );
}

function StatBar({
  label,
  value,
  fillPct,
  evPct,
  ivTickPct,
  stat,
  nature,
}: {
  label: string;
  value: number;
  fillPct: number;
  evPct: number;
  ivTickPct?: number;
  stat: 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe';
  nature?: 'up' | 'down';
}) {
  const nameClass = nature === 'up' ? 'boosted' : nature === 'down' ? 'lowered' : '';
  return (
    <div className="statcard-stat-row">
      <span className={`stat-name ${nameClass}`}>
        {label}
        {nature === 'up'   && <span className="stat-nature up">▲</span>}
        {nature === 'down' && <span className="stat-nature down">▼</span>}
      </span>
      <span className="stat-val mono">{value}</span>
      <div className="stat-track">
        <div className="stat-fill-iv" />
        <div className="stat-fill-ev" style={{ width: `${evPct}%` }} />
        <div className="stat-fill" data-stat={stat} style={{ width: `${fillPct}%` }} />
        {ivTickPct != null && <div className="stat-iv-tick" style={{ left: `${ivTickPct}%` }} />}
      </div>
    </div>
  );
}

function StatHex() {
  return (
    <div className="stat-hex">
      <svg viewBox="0 0 240 240">
        <g className="hex-grid">
          <polygon points="120,40 189,80 189,160 120,200 51,160 51,80" />
          <polygon points="120,60 172,90 172,150 120,180 68,150 68,90" />
          <polygon points="120,80 154,100 154,140 120,160 86,140 86,100" />
          <polygon points="120,100 137,110 137,130 120,140 103,130 103,110" />
        </g>
        <g className="hex-axis">
          <line x1="120" y1="120" x2="120" y2="40" />
          <line x1="120" y1="120" x2="189" y2="80" />
          <line x1="120" y1="120" x2="189" y2="160" />
          <line x1="120" y1="120" x2="120" y2="200" />
          <line x1="120" y1="120" x2="51"  y2="160" />
          <line x1="120" y1="120" x2="51"  y2="80" />
        </g>
        {/* HP 108, Atk 130, Def 95, SpA 80, SpD 85, Spe 102 (clockwise from top) */}
        <polygon className="hex-shape" points="120,72 173,93 159,143 120,182 75,138 71,93" />
        <circle className="hex-point" cx="120" cy="72"  r="3" />
        <circle className="hex-point" cx="173" cy="93"  r="3" />
        <circle className="hex-point" cx="159" cy="143" r="3" />
        <circle className="hex-point" cx="120" cy="182" r="3" />
        <circle className="hex-point" cx="75"  cy="138" r="3" />
        <circle className="hex-point" cx="71"  cy="93"  r="3" />
        <text className="hex-label" x="120" y="30"  textAnchor="middle">HP</text>
        <text className="hex-value" x="120" y="18"  textAnchor="middle">108</text>
        <text className="hex-label" x="200" y="74"  textAnchor="start">ATK</text>
        <text className="hex-value" x="200" y="62"  textAnchor="start">130</text>
        <text className="hex-label" x="200" y="170" textAnchor="start">SPD</text>
        <text className="hex-value" x="200" y="182" textAnchor="start">85</text>
        <text className="hex-label" x="120" y="220" textAnchor="middle">SPE</text>
        <text className="hex-value" x="120" y="232" textAnchor="middle">102</text>
        <text className="hex-label" x="40"  y="170" textAnchor="end">SPA</text>
        <text className="hex-value" x="40"  y="182" textAnchor="end">80</text>
        <text className="hex-label" x="40"  y="74"  textAnchor="end">DEF</text>
        <text className="hex-value" x="40"  y="62"  textAnchor="end">95</text>
      </svg>
    </div>
  );
}

function StatCardDefault() {
  return (
    <article className="statcard statcard-default" data-types="water">
      <header className="statcard-head">
        <div className="statcard-portrait portrait-sm">
          <div className="portrait-fallback">
            <svg viewBox="0 0 64 64" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.6" opacity=".6">
              <path d="M14 36 Q32 18 50 36 Q40 48 32 48 Q24 48 14 36Z" />
              <circle cx="38" cy="32" r="2" fill="currentColor" />
            </svg>
          </div>
          <span className="portrait-dex portrait-dex-sm">#0134</span>
        </div>
        <div className="statcard-id">
          <div className="statcard-name statcard-name-sm">
            Tatsugiri <span className="statcard-tag">opponent</span>
          </div>
          <div className="statcard-meta statcard-meta-sm">
            <span className="type-badge" data-type="dragon">Dragon</span>
            <span className="type-badge" data-type="water">Water</span>
            <span className="lv"><span className="lv-prefix">Lv.</span><span className="lv-num">50</span></span>
          </div>
        </div>
      </header>

      <div className="hp-block hp-block-sm">
        <div className="hp-label">
          HP <span className="mono">- / -</span><span className="hp-pct hp-pct-warn">~62%</span>
        </div>
        <div className="hp-bar"><div className="hp-fill hp-fill-warn" style={{ width: '62%' }} /></div>
      </div>

      <div className="predicted">
        <div className="block-label block-label-tight">Predicted sets · 3</div>
        <PredRow top pct="70%" title="Choice Specs · Modest" evidence="Draco Meteor kept · damage 287 fits Specs range" />
        <PredRow pct="20%" title="Choice Scarf · Modest" evidence="Outsped us at L50" />
        <PredRow pct="10%" title="Life Orb · Modest"     evidence="Residual damage not observed" />
      </div>

      <footer className="statcard-foot statcard-foot-tight">
        <div className="revealed-moves">
          <span className="block-label block-label-tight">Revealed</span>
          <span className="move-pill" data-type="dragon">Draco Meteor</span>
          <span className="move-pill" data-type="water">Muddy Water</span>
          <span className="move-pill move-pill-unknown">- -</span>
          <span className="move-pill move-pill-unknown">- -</span>
        </div>
      </footer>
    </article>
  );
}

function PredRow({
  top,
  pct,
  title,
  evidence,
}: {
  top?: boolean;
  pct: string;
  title: string;
  evidence: string;
}) {
  return (
    <div className={`pred-row ${top ? 'pred-row-top' : ''}`}>
      <span className="pred-pct">{pct}</span>
      <div className="pred-body">
        <div className="pred-title">{title}</div>
        <div className="pred-evidence">{evidence}</div>
      </div>
      <button type="button" className="pred-lock" aria-label="Lock set">⌗</button>
    </div>
  );
}

interface CompactSlot {
  name: string;
  types: string;
  hpPct: number;
  hpTone?: 'warn' | 'danger';
  active?: boolean;
  fainted?: boolean;
}

const COMPACT_SLOTS: CompactSlot[] = [
  { name: 'Foliawn',   types: 'dragon ground', hpPct: 100, active: true },
  { name: 'Emberling', types: 'fire',          hpPct: 78 },
  { name: 'Aquacub',   types: 'water ice',     hpPct: 38, hpTone: 'warn' },
  { name: 'Vinemaw',   types: 'grass poison',  hpPct: 0,  hpTone: 'danger', fainted: true },
  { name: 'Voltpup',   types: 'electric',      hpPct: 92 },
];

function StatCardCompactStrip() {
  return (
    <div className="compact-strip">
      <div className="block-label block-label-tight">Compact · team strip</div>
      <div className="strip">
        {COMPACT_SLOTS.map((s) => (
          <article
            key={s.name}
            className={`statcard statcard-compact ${s.active ? 'statcard-active' : ''} ${s.fainted ? 'statcard-fainted' : ''}`}
            data-types={s.types}
          >
            <div className="cmp-portrait" />
            <div className="cmp-id">
              <div className="cmp-name">{s.name}</div>
              <div className="cmp-types">
                {s.types.split(' ').map((t) => (
                  <span key={t} className="dot-type" data-type={t} />
                ))}
              </div>
            </div>
            <div className="cmp-hp">
              <div
                className={`cmp-hp-fill ${s.hpTone === 'warn' ? 'cmp-hp-warn' : s.hpTone === 'danger' ? 'cmp-hp-danger' : ''}`}
                style={{ width: `${s.hpPct}%` }}
              />
            </div>
          </article>
        ))}
        <article className="statcard statcard-compact statcard-empty">
          <div className="cmp-empty">+</div>
        </article>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 06 - PC Storage Box
// ---------------------------------------------------------------------------

interface BoxCellData {
  name: string;
  types: string;
  glyph: string;
  level: number | string;
  shiny?: boolean;
  selected?: boolean;
  seen?: boolean;
  starred?: boolean;
}

const BOX_CELLS: BoxCellData[] = [
  { name: 'Vinemaw',     types: 'grass',           glyph: '◆', level: 42 },
  { name: 'Emberling',   types: 'fire',            glyph: '▲', level: 38 },
  { name: 'Foliawn',     types: 'dragon ground',   glyph: '✦', level: 50, selected: true, starred: true },
  { name: 'Aquacub',     types: 'water',           glyph: '●', level: 29 },
  { name: 'Voltpup',     types: 'electric',        glyph: '⚡', level: 46, shiny: true },
  { name: 'Mindbloom',   types: 'psychic',         glyph: '◉', level: 35 },
  { name: 'Cragwhelp',   types: 'rock ground',     glyph: '◢', level: 22 },
  { name: 'Mothlit',     types: 'bug flying',      glyph: '✶', level: 18 },
  { name: 'Wispling',    types: 'ghost',           glyph: '☾', level: 40 },
  { name: 'Frostfin',    types: 'ice water',       glyph: '❄', level: 33 },
  { name: 'Knuckleoak',  types: 'fighting',        glyph: '⊕', level: 51 },
  { name: 'Sludgepup',   types: 'poison',          glyph: '☣', level: 24 },
  { name: 'Lumibell',    types: 'fairy',           glyph: '✿', level: 36 },
  { name: 'Boltbolt',    types: 'steel',           glyph: '◈', level: 48 },
  { name: 'Nightmaw',    types: 'dark',            glyph: '▼', level: 44 },
  { name: 'Tumbletuft',  types: 'normal',          glyph: '◌', level: 12 },
  { name: 'Skylark',     types: 'flying normal',   glyph: '⌃', level: 27 },
  { name: 'Petalwisp',   types: 'grass fairy',     glyph: '❀', level: 31 },
  { name: 'Pyrokin',     types: 'fire fighting',   glyph: '▲', level: 55 },
  { name: 'Saurikin',    types: 'dragon',          glyph: '◤', level: 60, shiny: true },
  { name: 'Tidemind',    types: 'water psychic',   glyph: '∞', level: 41 },
  { name: 'Spinefly',    types: 'bug',             glyph: '⊕', level: 20 },
  { name: 'Ironcrag',    types: 'ground steel',    glyph: '◣', level: 52 },
  { name: 'Pebbleroar',  types: 'rock',            glyph: '◆', level: 34 },
  { name: 'Glacekit',    types: 'ice',             glyph: '❅', level: 26 },
  { name: 'Shadekin',    types: 'ghost dark',      glyph: '⌬', level: 47 },
  { name: 'Voltcrest',   types: 'electric flying', glyph: '⚡', level: '- · seen', seen: true },
  { name: 'Dreambell',   types: 'fairy psychic',   glyph: '✧', level: 39 },
];

function BoxStorageSection() {
  const [selectedIdx, setSelectedIdx] = useState(2);
  const [activeTab, setActiveTab] = useState(0);

  const BOX_TABS = useMemo(
    () => [
      { name: 'Box 01', count: '28/30' },
      { name: 'Box 02', count: '14/30' },
      { name: 'Box 03', count: '30/30' },
      { name: 'Box 04', count: '0/30' },
    ],
    [],
  );

  return (
    <section className="sheet-section" id="box">
      <div className="sheet-section-head">
        <div className="section-num">06</div>
        <div>
          <h2 className="section-title">PC Storage Box · Grid View</h2>
          <p className="section-desc">
            A 6×5 grid (30 cells) per box, paged via box tabs at the top. Each cell is a
            self-contained mini stat card. Empty cells show a hairline placeholder. Click selects;
            right-click context menu (move, release, mark). The selected cell shows full detail in
            a side rail.
          </p>
        </div>
      </div>

      <div className="box-shell">
        <header className="box-head">
          <div className="box-tabs">
            {BOX_TABS.map((t, i) => (
              <button
                key={t.name}
                type="button"
                className={`box-tab ${i === activeTab ? 'box-tab-active' : ''}`}
                onClick={() => setActiveTab(i)}
              >
                {t.name} <span className="box-count mono">{t.count}</span>
              </button>
            ))}
            <button type="button" className="box-tab box-tab-add" aria-label="New box">+</button>
          </div>
          <div className="box-tools">
            <div className="search">
              <span className="search-glyph">⌕</span>
              <input type="text" placeholder="Filter species, type, ability…" />
            </div>
            <Segmented options={['All', 'Shiny', 'Marked']} initial={0} size="sm" />
            <button type="button" className="btn btn-secondary btn-sm">Sort · Dex</button>
          </div>
        </header>

        <div className="box-body">
          <div className="box-grid">
            {BOX_CELLS.map((c, i) => (
              <div
                key={c.name}
                className={[
                  'box-cell',
                  i === selectedIdx ? 'box-cell-selected' : '',
                  c.shiny ? 'box-cell-shiny' : '',
                ].filter(Boolean).join(' ')}
                data-types={c.types}
                onClick={() => setSelectedIdx(i)}
              >
                <span className={`cell-pip ${c.seen ? 'cell-pip-seen' : 'cell-pip-caught'}`} />
                <div className="cell-portrait"><span className="cell-glyph">{c.glyph}</span></div>
                <div className="cell-name">{c.name}</div>
                <div className="cell-meta mono">{typeof c.level === 'number' ? `Lv.${c.level}` : c.level}</div>
                {c.starred && <span className="cell-mark">★</span>}
                {c.shiny && <span className="cell-mark cell-mark-shiny">✦</span>}
              </div>
            ))}
            <div className="box-cell box-cell-empty" />
            <div className="box-cell box-cell-empty" />
          </div>

          <aside className="box-detail">
            <div className="block-label">Selected · cell {String(selectedIdx + 1).padStart(2, '0')}</div>
            <div className="detail-portrait">
              <svg viewBox="0 0 64 64" width="56" height="56" fill="none" stroke="currentColor" strokeWidth="1.4" opacity=".7">
                <circle cx="32" cy="28" r="14" />
                <path d="M18 50 Q32 38 46 50" />
                <circle cx="27" cy="26" r="2" fill="currentColor" />
                <circle cx="37" cy="26" r="2" fill="currentColor" />
              </svg>
              <div className="detail-dex">#0006 · {BOX_CELLS[selectedIdx]?.name ?? '-'}</div>
            </div>
            <div className="detail-row">
              <span className="type-badge" data-type="dragon">Dragon</span>
              <span className="type-badge" data-type="ground">Ground</span>
            </div>
            <div className="kv-row"><span className="kv-k">Level</span><span className="kv-v mono">50</span></div>
            <div className="kv-row"><span className="kv-k">Nature</span><span className="kv-v">Adamant</span></div>
            <div className="kv-row"><span className="kv-k">Ability</span><span className="kv-v">Sand Veil</span></div>
            <div className="kv-row"><span className="kv-k">Item</span><span className="kv-v">Choice Band</span></div>
            <div className="kv-row"><span className="kv-k">IVs</span><span className="kv-v mono">31/31/31/x/31/31</span></div>
            <div className="kv-row"><span className="kv-k">Caught</span><span className="kv-v">Badlands · Day</span></div>
            <div className="detail-actions">
              <button type="button" className="btn btn-primary btn-sm">Add to team</button>
              <button type="button" className="btn btn-secondary btn-sm">Move</button>
              <button type="button" className="btn btn-ghost btn-sm">Release</button>
            </div>
          </aside>
        </div>

        <footer className="box-foot">
          <div className="box-stats">
            <span><span className="mono">28</span> / 30 occupied</span>
            <span className="mono-divider">·</span>
            <span><span className="mono">2</span> shiny</span>
            <span className="mono-divider">·</span>
            <span><span className="mono">14</span> unique species</span>
          </div>
          <div className="box-stats-right">
            <kbd>←</kbd><kbd>→</kbd> page · <kbd>Enter</kbd> select · <kbd>Del</kbd> release
          </div>
        </footer>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 07 - Genre Flavor
// ---------------------------------------------------------------------------

const THEMES = [
  { id: 'kanto',  bg: '#1c0f0f', accent: '#dc2626', name: 'KANTO',  desc: 'Crimson on slate-black' },
  { id: 'johto',  bg: '#1a1408', accent: '#f5b942', name: 'JOHTO',  desc: 'Amber-gold (current default)' },
  { id: 'hoenn',  bg: '#0a1d24', accent: '#06b6d4', name: 'HOENN',  desc: 'Cyan on deep teal' },
  { id: 'sinnoh', bg: '#13132a', accent: '#a78bfa', name: 'SINNOH', desc: 'Violet on midnight' },
  { id: 'unova',  bg: '#1a0f1a', accent: '#ec4899', name: 'UNOVA',  desc: 'Hot pink on plum' },
  { id: 'galar',  bg: '#0a1424', accent: '#3b82f6', name: 'GALAR',  desc: 'Electric blue on navy' },
  { id: 'paldea', bg: '#1c0a14', accent: '#e11d48', name: 'PALDEA', desc: 'Scarlet · violet split' },
];

function GenreFlavorSection() {
  return (
    <section className="sheet-section" id="flavor">
      <div className="sheet-section-head">
        <div className="section-num">07</div>
        <div>
          <h2 className="section-title">Genre Flavor · Fonts &amp; Themes</h2>
          <p className="section-desc">
            Pokémon's official fonts (Pokemon Solid, Power Green) are proprietary. These are free
            Google Fonts that evoke the same retro/gaming feel - use them <strong>sparingly</strong>{' '}
            for accents only (Lv., status, damage rolls) so the body of the app stays readable.
            Toggle via the Tweaks panel <code>Font flavor</code>.
          </p>
        </div>
      </div>

      <h3 className="group-label">Font alternatives</h3>
      <div className="font-flavors">
        <FontFlavorCell label="Press Start 2P · accents" code="--font-pixel"
          family="var(--font-pixel)"
          lines={[
            { text: 'LV. 50',  style: { fontSize: 11, color: 'var(--accent)' } },
            { text: 'BRN',     style: { fontSize: 9,  color: 'var(--hp-low)', marginTop: 8 } },
            { text: 'HP 287',  style: { fontSize: 14, color: 'var(--fg)',     marginTop: 10 } },
          ]} />
        <FontFlavorCell label="VT323 · damage rolls" code="--font-terminal"
          family="var(--font-terminal)"
          lines={[
            { text: '234–275',          style: { fontSize: 22, color: 'var(--fg)',  lineHeight: 1.1 } },
            { text: 'GUARANTEED OHKO',  style: { fontSize: 18, color: 'var(--ok)',  marginTop: 4 } },
            { text: '159.1 – 187.0%',   style: { fontSize: 14, color: 'var(--fg-2)', marginTop: 4 } },
          ]} />
        <FontFlavorCell label="Silkscreen · block headers" code="--font-block"
          family="var(--font-block)"
          lines={[
            { text: 'RECOMMENDATIONS', style: { fontSize: 14, color: 'var(--accent)', fontWeight: 700, letterSpacing: '.05em' } },
            { text: '#1  EARTHQUAKE',  style: { fontSize: 10, color: 'var(--fg-2)',   marginTop: 8 } },
          ]} />
        <FontFlavorCell label="Space Grotesk · default UI" code="--font-display"
          family="var(--font-display)"
          lines={[
            { text: 'Lv. 50', style: { fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--accent)' } },
            { text: 'Foliawn', style: { fontSize: 22, color: 'var(--fg)', marginTop: 8, fontWeight: 600 } },
            { text: 'Recommended for body UI', style: { fontSize: 12, color: 'var(--fg-2)', marginTop: 4 } },
          ]} />
      </div>

      <h3 className="group-label">Theme palettes · generation-inspired</h3>
      <div className="theme-gallery">
        {THEMES.map((t) => (
          <div key={t.id} className="theme-swatch" data-theme={t.id}>
            <div className="theme-bg" style={{ background: t.bg }} />
            <div className="theme-accent" style={{ background: t.accent, color: t.accent }} />
            <div className="theme-name">{t.name}</div>
            <div className="theme-desc">{t.desc}</div>
          </div>
        ))}
      </div>
      <p className="flavor-note">
        Inspired by game generations; use whichever fits your app's identity. All swappable from
        the Tweaks panel.
      </p>
    </section>
  );
}

function FontFlavorCell({
  label,
  code,
  family,
  lines,
}: {
  label: string;
  code: string;
  family: string;
  lines: { text: string; style: React.CSSProperties }[];
}) {
  return (
    <div className="font-flavor-cell">
      <div className="cell-label">{label}</div>
      <div className="font-sample" style={{ fontFamily: family }}>
        {lines.map((l, i) => <div key={i} style={l.style}>{l.text}</div>)}
      </div>
      <code className="cell-code">{code}</code>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 08 - Type Effectiveness Chart
// ---------------------------------------------------------------------------

function TypeChartSection() {
  return (
    <section className="sheet-section" id="typechart">
      <div className="sheet-section-head">
        <div className="section-num">08</div>
        <div>
          <h2 className="section-title">Type Effectiveness Chart</h2>
          <p className="section-desc">
            The iconic 18×18 grid: attacking type (row) vs defending type (column). Cells show
            multipliers: <span className="cell-key key-2x">×2</span> super-effective,{' '}
            <span className="cell-key key-half">×½</span> not very,{' '}
            <span className="cell-key key-0">×0</span> immune, blank for ×1. Used as a reference
            panel in the Pokédex and Battle Assistant.
          </p>
        </div>
      </div>
      <TypeChartGrid />
    </section>
  );
}

function TypeChartGrid() {
  return (
    <div className="typechart">
      <div className="tc-corner" />
      {TYPES.map((t) => (
        <div key={`col-${t}`} className="tc-head tc-head-col" data-type={t} title={`def: ${t}`}>
          <span className="tc-head-letter">{t[0].toUpperCase()}</span>
        </div>
      ))}
      {TYPES.map((atk) => (
        <TypeChartRow key={atk} atk={atk} />
      ))}
    </div>
  );
}

function TypeChartRow({ atk }: { atk: Type }) {
  return (
    <>
      <div className="tc-head tc-head-row" data-type={atk} title={`atk: ${atk}`}>
        <span className="tc-head-letter">{atk[0].toUpperCase()}</span>
      </div>
      {TYPES.map((def) => {
        const mult = CHART[atk]?.[def] ?? 1;
        const klass = mult === 0 ? 'tc-zero' : mult === 0.5 ? 'tc-half' : mult === 2 ? 'tc-two' : '';
        const label = mult === 0 ? '0' : mult === 0.5 ? '½' : mult === 2 ? '2' : '';
        const human = mult === 0 ? '×0' : mult === 0.5 ? '×½' : mult === 2 ? '×2' : '×1';
        return (
          <div key={`${atk}-${def}`} className={`tc-cell ${klass}`} title={`${atk} → ${def}: ${human}`}>
            {label}
          </div>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// 09 - Trainer Card
// ---------------------------------------------------------------------------

function TrainerCardSection() {
  return (
    <section className="sheet-section" id="trainer">
      <div className="sheet-section-head">
        <div className="section-num">09</div>
        <div>
          <h2 className="section-title">Trainer Card</h2>
          <p className="section-desc">
            Player profile surfaced in the sidebar foot, settings page, and team-export header.
            Carries the trainer name, ID, badges/achievements, total playtime, and a "loadout"
            mini-strip showing the active team.
          </p>
        </div>
      </div>

      <div className="trainer-grid">
        <article className="trainer-card">
          <div className="trainer-bg" aria-hidden="true" />
          <header className="trainer-head">
            <div className="trainer-portrait">Trainer portrait · 88×88</div>
            <div className="trainer-id">
              <div className="trainer-name">RED</div>
              <div className="trainer-meta">
                <span className="lv"><span className="lv-prefix">ID No.</span><span className="lv-num">00614</span></span>
                <span className="mono-divider">·</span>
                <span className="mono-meta">Champion</span>
              </div>
              <div className="trainer-badges">
                {Array.from({ length: 7 }).map((_, i) => (
                  <span key={i} className="badge-pip badge-earned" title="Earned badge" />
                ))}
                <span className="badge-pip badge-empty" title="Volcano Badge" />
              </div>
            </div>
          </header>

          <div className="trainer-stats">
            <TrainerStat label="Playtime" value={<>214h 06m</>} />
            <TrainerStat label="Dex"      value={<>412 <span className="t-stat-sub">/ 1026</span></>} />
            <TrainerStat label="Shinies"  value={<><span style={{ color: 'var(--shiny)' }}>✦</span> 23</>} />
            <TrainerStat label="Wins"     value={<>142<span className="t-stat-sub"> / 8L</span></>} />
          </div>

          <footer className="trainer-foot">
            <div className="block-label block-label-tight">Active loadout</div>
            <div className="trainer-loadout">
              <div className="loadout-cell" data-types="dragon ground" title="Foliawn"><span>F</span></div>
              <div className="loadout-cell" data-types="fire"          title="Emberling"><span>E</span></div>
              <div className="loadout-cell" data-types="water ice"     title="Aquacub"><span>A</span></div>
              <div className="loadout-cell loadout-cell-fainted" data-types="grass poison" title="Vinemaw"><span>V</span></div>
              <div className="loadout-cell" data-types="electric"      title="Voltpup"><span>V</span></div>
              <div className="loadout-cell loadout-cell-empty"><span>+</span></div>
            </div>
          </footer>
        </article>
      </div>
    </section>
  );
}

function TrainerStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="t-stat">
      <div className="t-stat-label">{label}</div>
      <div className="t-stat-value mono">{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 10 - Image Integration
// ---------------------------------------------------------------------------

interface ImageSlot {
  label: string;
  placeholder: string;
  w: number;
  h: number;
  shape: 'rounded' | 'rounded-lg' | 'rounded-sm' | 'circle';
  code: string;
}

const IMAGE_SLOTS: ImageSlot[] = [
  { label: 'Box cell · 80×80',             placeholder: '80×80 PNG · transparent', w: 80,  h: 80,  shape: 'rounded-lg', code: 'use in .box-cell .cell-portrait' },
  { label: 'Default stat card · 56×56',    placeholder: '56×56 PNG',               w: 56,  h: 56,  shape: 'rounded',    code: 'use in .portrait-sm' },
  { label: 'Expanded card · 96×96',        placeholder: '96×96 PNG',               w: 96,  h: 96,  shape: 'rounded',    code: 'use in .statcard-portrait' },
  { label: 'Compact team strip · 36×36',   placeholder: '36×36',                   w: 36,  h: 36,  shape: 'rounded-sm', code: 'use in .cmp-portrait' },
  { label: 'Detail rail · 160×112',        placeholder: 'Detail render · landscape', w: 160, h: 112, shape: 'rounded',  code: 'use in .detail-portrait' },
  { label: 'Trainer portrait · 88×88',     placeholder: 'Trainer · circle',        w: 88,  h: 88,  shape: 'circle',     code: 'use in .trainer-card' },
];

function ImageIntegrationSection() {
  return (
    <section className="sheet-section" id="images">
      <div className="sheet-section-head">
        <div className="section-num">10</div>
        <div>
          <h2 className="section-title">Image Integration · Cobblemon Renders</h2>
          <p className="section-desc">
            Use <strong>Cobblemon's own creature renders</strong> shipped with the mod - they're
            the cleanest legitimate source for a Cobblemon companion app. Drop a PNG into each
            slot below. Stat cards and box cells reserve fixed dimensions so the layout doesn't
            reflow when assets load.
          </p>
        </div>
      </div>

      <div className="image-grid">
        {IMAGE_SLOTS.map((s) => (
          <div key={s.label} className="image-cell">
            <div className="cell-label">{s.label}</div>
            <div
              className={`img-slot img-slot-${s.shape}`}
              style={{ width: s.w, height: s.h }}
            >
              {s.placeholder}
            </div>
            <code className="cell-code">{s.code}</code>
          </div>
        ))}
      </div>

      <div className="image-note">
        <strong>Asset sources, ranked by IP safety for a Cobblemon companion:</strong>
        <ol>
          <li><strong>Cobblemon's bundled renders</strong> - the mod ships PNGs of every species. Cleanest path. Read the mod's <code>resources/</code> tree.</li>
          <li><strong>Generated 3D model previews</strong> - render Cobblemon's own GLTF models at runtime to a canvas.</li>
          <li><strong>PokéAPI sprites</strong> - widely used in fan apps under understood fair use; technically Game Freak / Nintendo's. Your call.</li>
          <li><strong>Avoid</strong> - official Pokémon promo art, TCG card crops, anything from pokemon.com.</li>
        </ol>
      </div>
    </section>
  );
}
