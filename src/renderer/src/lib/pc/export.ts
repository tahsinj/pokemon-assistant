import type { PcBoxSummary, PcPokemonRecord, PcStatSpread } from '../bridgeTypes';
import type { Pokemon } from '../types';
import { STAT_LABELS, STAT_ORDER } from './defaults';
import { exportShowdownFromPc } from '../showdownTeam';

function formatSpread(spread: PcStatSpread, kind: 'IV' | 'EV'): string {
  const parts = STAT_ORDER.map((k) => `${spread[k]} ${STAT_LABELS[k]}`);
  return `${kind}s: ${parts.join(' / ')}`;
}

function genderLabel(g: string): string {
  if (g === 'male') return 'Male';
  if (g === 'female') return 'Female';
  return 'Genderless';
}

function pokemonBlockMarkdown(mon: PcPokemonRecord, index: number, dex?: number): string {
  const title = mon.nickname?.trim()
    ? `${mon.nickname} (${mon.speciesDisplay})`
    : mon.speciesDisplay;
  const dexPart = dex != null ? ` · #${String(dex).padStart(4, '0')}` : '';
  const lines: string[] = [
    `## ${index}. ${title}`,
    '',
    `- **Species:** ${mon.speciesDisplay}${dexPart}`,
    `- **Level:** ${mon.level} · **Gender:** ${genderLabel(mon.gender)}`,
    `- **Nature:** ${mon.nature}`,
    `- **Ability:** ${mon.ability || '-'}`,
    `- **Item:** ${mon.item || '-'}`,
    '',
    formatSpread(mon.ivs, 'IV'),
    '',
    formatSpread(mon.evs, 'EV'),
    '',
    '### Moves',
  ];
  const moves = mon.moves.filter((m) => m.trim());
  if (moves.length) {
    moves.forEach((m, i) => lines.push(`${i + 1}. ${m}`));
  } else {
    lines.push('_No moves recorded_');
  }
  if (mon.notes?.trim()) {
    lines.push('', `**Notes:** ${mon.notes.trim()}`);
  }
  lines.push('', '---', '');
  return lines.join('\n');
}

function pokemonBlockTxt(mon: PcPokemonRecord, index: number, dex?: number): string {
  const title = mon.nickname?.trim()
    ? `${mon.nickname} (${mon.speciesDisplay})`
    : mon.speciesDisplay;
  const dexPart = dex != null ? `  #${String(dex).padStart(4, '0')}` : '';
  const lines: string[] = [
    `${index}. ${title}`,
    `   Species:${dexPart}  Lv.${mon.level}  ${genderLabel(mon.gender)}`,
    `   Nature: ${mon.nature}  Ability: ${mon.ability || '-'}  Item: ${mon.item || '-'}`,
    `   ${formatSpread(mon.ivs, 'IV')}`,
    `   ${formatSpread(mon.evs, 'EV')}`,
    '   Moves:',
  ];
  const moves = mon.moves.filter((m) => m.trim());
  if (moves.length) {
    moves.forEach((m) => lines.push(`     - ${m}`));
  } else {
    lines.push('     (none)');
  }
  if (mon.notes?.trim()) lines.push(`   Notes: ${mon.notes.trim()}`);
  lines.push('');
  return lines.join('\n');
}

export function exportBoxMarkdown(
  box: PcBoxSummary,
  pokemon: PcPokemonRecord[],
  pokemonById: Record<string, Pokemon>,
): string {
  const occupied = pokemon.length;
  const sorted = [...pokemon].sort((a, b) => a.slot - b.slot);
  const header = [
    `# PC Box - ${box.name}`,
    '',
    `Exported: ${new Date().toLocaleString()}`,
    `Occupied: ${occupied} / 30`,
    '',
    '---',
    '',
  ];
  if (!sorted.length) {
    return [...header, '_This box is empty._', ''].join('\n');
  }
  const blocks = sorted.map((mon, i) => {
    const dex = pokemonById[mon.speciesId]?.dex;
    return pokemonBlockMarkdown(mon, i + 1, dex);
  });
  return [...header, ...blocks].join('\n');
}

export function exportBoxTxt(
  box: PcBoxSummary,
  pokemon: PcPokemonRecord[],
  pokemonById: Record<string, Pokemon>,
): string {
  const occupied = pokemon.length;
  const sorted = [...pokemon].sort((a, b) => a.slot - b.slot);
  const header = [
    `PC BOX: ${box.name.toUpperCase()}`,
    `Exported: ${new Date().toLocaleString()}`,
    `Occupied: ${occupied} / 30`,
    '='.repeat(48),
    '',
  ];
  if (!sorted.length) {
    return [...header, '(empty box)', ''].join('\n');
  }
  const blocks = sorted.map((mon, i) => {
    const dex = pokemonById[mon.speciesId]?.dex;
    return pokemonBlockTxt(mon, i + 1, dex);
  });
  return [...header, ...blocks].join('\n');
}

export function exportAllBoxesMarkdown(
  boxes: PcBoxSummary[],
  allPokemon: Map<string, PcPokemonRecord[]>,
  pokemonById: Record<string, Pokemon>,
): string {
  const parts = [
    '# Pokémon Assistant - PC Export',
    '',
    `Exported: ${new Date().toLocaleString()}`,
    `Boxes: ${boxes.length}`,
    '',
    '---',
    '',
  ];
  for (const box of boxes) {
    const mons = allPokemon.get(box.id) ?? [];
    parts.push(exportBoxMarkdown(box, mons, pokemonById));
    parts.push('');
  }
  return parts.join('\n');
}

export function exportBoxShowdown(box: PcBoxSummary, pokemon: PcPokemonRecord[]): string {
  const sorted = [...pokemon].sort((a, b) => a.slot - b.slot);
  return exportShowdownFromPc(sorted, box.name);
}

export function downloadTextFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
