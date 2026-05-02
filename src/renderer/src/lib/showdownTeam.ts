/** Parse / export Pokémon Showdown team paste blocks. */

export type ShowdownGender = 'male' | 'female' | 'genderless';

export type ShowdownStatSpread = Partial<Record<'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe', number>>;

export interface ParsedShowdownMon {
  species: string;
  nickname?: string;
  gender?: ShowdownGender;
  item?: string;
  ability?: string;
  nature?: string;
  level?: number;
  evs: Partial<Record<'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe', number>>;
  ivs: Partial<Record<'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe', number>>;
  moves: string[];
  /** Raw first line for export round-trip hints */
  rawSpeciesLine: string;
}

const STAT_MAP: Record<string, keyof ParsedShowdownMon['evs']> = {
  HP: 'hp',
  Atk: 'atk',
  Def: 'def',
  SpA: 'spa',
  SpD: 'spd',
  Spe: 'spe',
};

function parseGenderToken(tok: string): ShowdownGender | undefined {
  const t = tok.trim().toUpperCase();
  if (t === 'M' || t === 'MALE') return 'male';
  if (t === 'F' || t === 'FEMALE') return 'female';
  if (t === 'N' || t === 'GENDERLESS') return 'genderless';
  return undefined;
}

function parseSpeciesLine(line: string): {
  species: string;
  nickname?: string;
  gender?: ShowdownGender;
  item?: string;
  raw: string;
} {
  const raw = line.trim();
  const nick = raw.match(/^(.+?)\s+\(([^)]+)\)(?:\s*@\s*(.+))?$/);
  if (nick) {
    const outer = nick[1].trim();
    const inner = nick[2].trim();
    const g = parseGenderToken(inner);
    if (g) {
      return { species: outer, gender: g, item: nick[3]?.trim(), raw };
    }
    return { species: inner, nickname: outer, item: nick[3]?.trim(), raw };
  }
  const genderParen = raw.match(/^(.+?)\s+\(([MF])\)(?:\s*@\s*(.+))?$/i);
  if (genderParen) {
    return {
      species: genderParen[1].trim(),
      gender: parseGenderToken(genderParen[2]),
      item: genderParen[3]?.trim(),
      raw,
    };
  }
  const at = raw.split('@').map((s) => s.trim());
  if (at.length >= 2) {
    return { species: at[0], item: at.slice(1).join(' @ '), raw };
  }
  return { species: raw, raw };
}

function parseSpread(line: string, prefix: 'EVs' | 'IVs'): Partial<Record<'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe', number>> {
  const out: ParsedShowdownMon['evs'] = {};
  const m = line.match(new RegExp(`^${prefix}:\\s*(.+)$`, 'i'));
  if (!m) return out;
  const parts = m[1].split('/').map((s) => s.trim());
  for (const p of parts) {
    const mm = p.match(/^(\d+)\s+(.+)$/);
    if (!mm) continue;
    const val = Number(mm[1]);
    const label = mm[2].trim();
    const key = STAT_MAP[label];
    if (key) out[key] = val;
  }
  return out;
}

function parseNature(line: string): string | undefined {
  const m = line.match(/^(\w+)\s+Nature$/i);
  return m ? m[1] : undefined;
}

export interface ParseShowdownOptions {
  /** Default 6 (Showdown team). PC import passes 30. */
  maxMons?: number;
}

function isShowdownBoxHeader(line: string): boolean {
  return /^===\s*.+\s*===$/.test(line.trim());
}

/** Split paste into per-Pokémon blocks (blank line separated). */
export function parseShowdownTeam(paste: string, options?: ParseShowdownOptions): ParsedShowdownMon[] {
  const text = paste.replace(/\r\n/g, '\n').trim();
  if (!text) return [];
  const blocks = text.split(/\n\n+/).map((b) => b.trim()).filter(Boolean);
  const mons: ParsedShowdownMon[] = [];
  const maxMons = options?.maxMons ?? 6;

  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
    if (!lines.length) continue;
    if (isShowdownBoxHeader(lines[0])) continue;
    const { species, nickname, gender, item, raw } = parseSpeciesLine(lines[0]);
    if (!species) continue;

    const mon: ParsedShowdownMon = {
      species,
      nickname,
      gender,
      item,
      rawSpeciesLine: raw,
      evs: {},
      ivs: {},
      moves: [],
    };

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (/^Ability:/i.test(line)) {
        mon.ability = line.replace(/^Ability:\s*/i, '').trim();
      } else if (/^Level:/i.test(line)) {
        const lv = Number(line.replace(/^Level:\s*/i, '').trim());
        if (Number.isFinite(lv)) mon.level = lv;
      } else if (/^EVs:/i.test(line)) {
        mon.evs = { ...mon.evs, ...parseSpread(line, 'EVs') };
      } else if (/^IVs:/i.test(line)) {
        mon.ivs = { ...mon.ivs, ...parseSpread(line, 'IVs') };
      } else if (/^Shiny:/i.test(line) || /^Tera Type:/i.test(line) || /^Happiness:/i.test(line)) {
        /* ignore */
      } else if (/ Nature$/i.test(line) && !line.startsWith('-')) {
        const n = parseNature(line);
        if (n) mon.nature = n;
      } else if (line.startsWith('-')) {
        mon.moves.push(line.replace(/^-\s*/, '').trim());
      }
    }
    mons.push(mon);
  }
  return mons.slice(0, maxMons);
}

export function exportShowdownTeamSimple(names: (string | null | undefined)[]): string {
  return names
    .filter((n): n is string => !!n && n.trim().length > 0)
    .map((n) => n.trim())
    .join('\n\n');
}

function formatStatSpread(
  prefix: 'EVs' | 'IVs',
  spread: Partial<Record<'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe', number>>,
): string | null {
  const parts: string[] = [];
  for (const [label, key] of Object.entries(STAT_MAP)) {
    const v = spread[key];
    if (v != null && v > 0) parts.push(`${v} ${label}`);
  }
  return parts.length ? `${prefix}: ${parts.join(' / ')}` : null;
}

function speciesHeadline(m: ParsedShowdownMon): string {
  let base = m.species;
  if (m.nickname) base = `${m.nickname} (${m.species})`;
  else if (m.gender === 'male') base = `${m.species} (M)`;
  else if (m.gender === 'female') base = `${m.species} (F)`;
  return m.item ? `${base} @ ${m.item}` : base;
}

export interface ExportShowdownOptions {
  /** Always emit `Level:` (needed for PC storage round-trip). Default omits 100 like Showdown's UI. */
  includeLevelAlways?: boolean;
}

export function exportShowdownFromParsed(
  mons: ParsedShowdownMon[],
  options?: ExportShowdownOptions,
): string {
  const includeLevelAlways = options?.includeLevelAlways ?? false;
  return mons
    .map((m) => {
      const lines: string[] = [];
      lines.push(speciesHeadline(m));
      if (m.ability) lines.push(`Ability: ${m.ability}`);
      if (m.level != null && (includeLevelAlways || m.level !== 100)) {
        lines.push(`Level: ${m.level}`);
      }
      const evLine = formatStatSpread('EVs', m.evs);
      if (evLine) lines.push(evLine);
      const ivLine = formatStatSpread('IVs', m.ivs);
      if (ivLine) lines.push(ivLine);
      if (m.nature) lines.push(`${m.nature} Nature`);
      for (const mv of m.moves) lines.push(`- ${mv}`);
      return lines.join('\n');
    })
    .join('\n\n');
}

/** Export PC records as Showdown paste (slot order). */
export function exportShowdownFromPc(
  mons: {
    speciesDisplay: string;
    nickname: string | null;
    level: number;
    gender: ShowdownGender;
    nature: string;
    ability: string;
    item: string | null;
    ivs: ShowdownStatSpread;
    evs: ShowdownStatSpread;
    moves: string[];
  }[],
  boxName?: string,
): string {
  const blocks = mons.map((m) =>
    exportShowdownFromParsed(
      [
        {
          species: m.speciesDisplay,
          nickname: m.nickname ?? undefined,
          gender: m.gender,
          item: m.item ?? undefined,
          ability: m.ability,
          nature: m.nature,
          level: m.level,
          evs: m.evs,
          ivs: m.ivs,
          moves: m.moves.filter((mv) => mv.trim()),
          rawSpeciesLine: m.speciesDisplay,
        },
      ],
      { includeLevelAlways: true },
    ),
  );
  const body = blocks.join('\n\n');
  if (!boxName) return body;
  return `=== ${boxName} ===\n\n${body}`;
}
