import { createContext, useContext } from 'react';

export type ToolId =
  | 'pokedex'
  | 'moves'
  | 'pc'
  | 'team'
  | 'planner'
  | 'breeding'
  | 'calcdex'
  | 'practice'
  | 'replays'
  | 'draft'
  | 'smogon';

export type AreaId = 'dex' | 'box' | 'battle' | 'counters' | 'meta';

export interface AreaDef {
  id: AreaId;
  label: string;
  /** Letter on the area's hex. */
  glyph: string;
  tools: ToolId[];
}

/** One name per tool: its tab, its page title and the window title. */
export const TOOL_NAMES: Record<ToolId, string> = {
  pokedex: 'Pokédex',
  moves: 'Moves',
  pc: 'PC Box',
  team: 'Team Builder',
  planner: 'EV/IV Planner',
  breeding: 'Breeding',
  calcdex: 'Damage Calc',
  practice: 'Practice',
  replays: 'Replay Review',
  draft: 'Counter Draft',
  smogon: 'Usage Stats',
};

/** In order around the orb, starting at the top. */
export const AREAS: AreaDef[] = [
  { id: 'dex', label: 'Dex', glyph: 'D', tools: ['pokedex', 'moves'] },
  { id: 'box', label: 'Box', glyph: 'B', tools: ['pc', 'team', 'planner', 'breeding'] },
  { id: 'battle', label: 'Battle', glyph: 'X', tools: ['calcdex', 'practice', 'replays'] },
  { id: 'counters', label: 'Counters', glyph: 'C', tools: ['draft'] },
  { id: 'meta', label: 'Meta', glyph: 'M', tools: ['smogon'] },
];

export function areaOf(tool: ToolId): AreaDef {
  const area = AREAS.find((a) => a.tools.includes(tool));
  if (!area) throw new Error(`No area holds ${tool}`);
  return area;
}

export interface OpenTool {
  area: AreaDef;
  tool: ToolId;
  name: string;
  /** Switch to another tool (and its area). */
  goTo: (tool: ToolId) => void;
}

export const ToolContext = createContext<OpenTool | null>(null);

export function useOpenTool(): OpenTool | null {
  return useContext(ToolContext);
}
