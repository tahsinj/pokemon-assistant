export type RivalsTeamTag = 'general' | 'raid' | 'gym' | 'dungeon';

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
  'item' | 'ability' | 'nature' | 'level' | 'evs' | 'moves'
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
  evs: Record<string, number> | null;
  moves: string[] | null;
}

export interface SaveTeamPayload {
  id?: string;
  name: string;
  rivenTag: RivalsTeamTag | string;
  showdownExport?: string | null;
  members: TeamMemberPersist[];
}

export interface LoadedTeamRecord {
  id: string;
  name: string;
  rivenTag: string;
  showdownExport: string | null;
  updatedAt: number;
  members: TeamMemberPersist[];
}

export type ModBridgeStatus =
  | { kind: 'idle' }
  | { kind: 'listening'; url: string }
  | {
      kind: 'connected';
      peer: string;
      hello?: {
        modId: string;
        cobblemonVersion: string;
        minecraftVersion: string;
        playerUUID: string;
        protocolVersion: number;
      };
    }
  | { kind: 'error'; message: string };

export interface ModBridge {
  start: (config?: { host?: string; port?: number; path?: string }) => Promise<{ url: string } | { error: string }>;
  stop: () => Promise<void>;
  getStatus: () => Promise<ModBridgeStatus>;
  onFrame: (cb: (payload: unknown) => void) => () => void;
  onStatus: (cb: (status: ModBridgeStatus) => void) => () => void;
  onInvalidFrame: (cb: (info: { error: string }) => void) => () => void;
}

export interface CobblemonBridge {
  version: string;
  teamsList: () => Promise<{ id: string; name: string; rivenTag: string; updatedAt: number }[]>;
  teamsLoad: (id: string) => Promise<LoadedTeamRecord | null>;
  teamsSave: (payload: SaveTeamPayload) => Promise<{ id: string }>;
  teamsDelete: (id: string) => Promise<void>;
  pcBoxesList: () => Promise<PcBoxSummary[]>;
  pcBoxCreate: (name: string) => Promise<PcBoxSummary>;
  pcBoxRename: (id: string, name: string) => Promise<void>;
  pcBoxDelete: (id: string) => Promise<void>;
  pcPokemonList: (boxId: string) => Promise<PcPokemonRecord[]>;
  pcPokemonSave: (payload: SavePcPokemonPayload) => Promise<{ id: string }>;
  pcPokemonDelete: (id: string) => Promise<void>;
  pcPokemonMove: (id: string, boxId: string, slot: number) => Promise<void>;
  modBridge: ModBridge;
}
