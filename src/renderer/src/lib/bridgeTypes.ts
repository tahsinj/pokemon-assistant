export type TeamTag = 'general' | 'raid' | 'gym' | 'dungeon';

export type PcGender = 'male' | 'female' | 'genderless';

export interface PcStatSpread {
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
}

export interface PcBoxSummary {
  id: string;
  name: string;
  sortOrder: number;
  updatedAt: number;
}

export interface PcPokemonRecord {
  id: string;
  boxId: string;
  slot: number;
  speciesId: string;
  speciesDisplay: string;
  nickname: string | null;
  level: number;
  gender: PcGender;
  nature: string;
  ability: string;
  item: string | null;
  ivs: PcStatSpread;
  evs: PcStatSpread;
  moves: string[];
  notes: string | null;
  shiny: boolean;
  updatedAt: number;
}

export interface SavePcPokemonPayload {
  id?: string;
  boxId: string;
  slot: number;
  speciesId: string;
  speciesDisplay: string;
  nickname?: string | null;
  level: number;
  gender: PcGender;
  nature: string;
  ability: string;
  item?: string | null;
  ivs: PcStatSpread;
  evs: PcStatSpread;
  moves: string[];
  notes?: string | null;
  shiny?: boolean;
}

/** The optional set details a team slot can carry beyond its species. */
export type MemberDetail = Pick<
  TeamMemberPersist,
  'item' | 'ability' | 'nature' | 'level' | 'ivs' | 'evs' | 'moves'
>;

export interface TeamMemberPersist {
  slot: number;
  speciesId: string | null;
  speciesDisplay: string;
  item: string | null;
  ability: string | null;
  nature: string | null;
  /** Real level when the slot came from a PC mon; null for a Showdown-style build. */
  level: number | null;
  ivs: Record<string, number> | null;
  evs: Record<string, number> | null;
  moves: string[] | null;
}

export interface SaveTeamPayload {
  id?: string;
  name: string;
  tag: TeamTag | string;
  showdownExport?: string | null;
  members: TeamMemberPersist[];
}

export interface LoadedTeamRecord {
  id: string;
  name: string;
  tag: string;
  showdownExport: string | null;
  updatedAt: number;
  members: TeamMemberPersist[];
}

export interface AssistantApi {
  version: string;
  teamsList: () => Promise<{ id: string; name: string; tag: string; updatedAt: number }[]>;
  teamsLoad: (id: string) => Promise<LoadedTeamRecord | null>;
  teamsSave: (payload: SaveTeamPayload) => Promise<{ id: string }>;
  teamsDelete: (id: string) => Promise<void>;
  pcBoxesList: () => Promise<PcBoxSummary[]>;
  pcBoxCreate: (name: string) => Promise<PcBoxSummary>;
  pcBoxRename: (id: string, name: string) => Promise<void>;
  pcBoxDelete: (id: string) => Promise<void>;
  pcBoxReorder: (ids: string[]) => Promise<void>;
  pcPokemonList: (boxId: string) => Promise<PcPokemonRecord[]>;
  pcPokemonSave: (payload: SavePcPokemonPayload) => Promise<{ id: string }>;
  pcPokemonDelete: (id: string) => Promise<void>;
  pcPokemonMove: (id: string, boxId: string, slot: number) => Promise<void>;
  /** Data packs; missing in older builds and in plain browsers. */
  packsGet?: (name: string) => Promise<Uint8Array | null>;
  packsStatus?: () => Promise<PackStatus>;
  packsRefresh?: () => Promise<PackStatus>;
}

export interface PackStatus {
  checkedAt: number;
  packs: { name: string; version: string; have: boolean }[];
}
