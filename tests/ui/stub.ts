/**
 * Stand-in for the Electron preload (`window.assistant`) so the renderer runs
 * in a plain browser. Runs inside the page via addInitScript, so it must be
 * self-contained: no imports, no closures over test code.
 */
export function installAssistantStub(): void {
  const ivs = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
  const noEvs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  const mon = (
    slot: number,
    speciesId: string,
    speciesDisplay: string,
    level: number,
    nature: string,
    ability: string,
    item: string,
    moves: string[],
    evs = noEvs,
  ) => ({
    id: `pc${slot}`,
    boxId: 'box1',
    slot,
    speciesId,
    speciesDisplay,
    nickname: null,
    level,
    gender: 'male',
    nature,
    ability,
    item,
    ivs,
    evs,
    moves,
    notes: null,
    shiny: false,
    updatedAt: 1,
  });
  const pc = [
    mon(0, 'garchomp', 'Garchomp', 100, 'Jolly', 'roughskin', 'Life Orb', ['Earthquake', 'Dragon Claw', 'Swords Dance', 'Stone Edge'], { ...noEvs, atk: 252, spe: 252, spd: 4 }),
    mon(1, 'corviknight', 'Corviknight', 100, 'Impish', 'pressure', 'Leftovers', ['Brave Bird', 'Roost', 'Defog', 'U-turn']),
    mon(2, 'gengar', 'Gengar', 100, 'Timid', 'cursedbody', 'Choice Specs', ['Shadow Ball', 'Sludge Bomb', 'Focus Blast', 'Thunderbolt']),
    mon(3, 'rotomwash', 'Rotom-Wash', 100, 'Bold', 'levitate', 'Leftovers', ['Hydro Pump', 'Volt Switch', 'Will-O-Wisp', 'Pain Split']),
    mon(4, 'greattusk', 'Great Tusk', 100, 'Jolly', 'protosynthesis', 'Booster Energy', ['Headlong Rush', 'Ice Spinner', 'Rapid Spin', 'Close Combat']),
    mon(5, 'volcarona', 'Volcarona', 100, 'Timid', 'flamebody', 'Heavy-Duty Boots', ['Quiver Dance', 'Fiery Dance', 'Bug Buzz', 'Giga Drain']),
    mon(6, 'blissey', 'Blissey', 100, 'Bold', 'naturalcure', 'Leftovers', ['Seismic Toss', 'Soft-Boiled', 'Toxic', 'Stealth Rock']),
    mon(7, 'dragonite', 'Dragonite', 100, 'Adamant', 'multiscale', 'Heavy-Duty Boots', ['Dragon Dance', 'Extreme Speed', 'Earthquake', 'Fire Punch']),
  ];
  const team = {
    id: 'team1',
    name: 'Main',
    tag: 'general',
    showdownExport: null,
    updatedAt: 2,
    members: pc.slice(0, 6).map((r, slot) => ({
      slot,
      speciesId: r.speciesId,
      speciesDisplay: r.speciesDisplay,
      item: r.item,
      ability: r.ability,
      nature: r.nature,
      level: r.level,
      ivs: r.ivs,
      evs: r.evs,
      moves: r.moves,
    })),
  };
  const done = async () => undefined;
  (window as unknown as { assistant: unknown }).assistant = {
    version: 'test',
    teamsList: async () => [{ id: team.id, name: team.name, tag: team.tag, updatedAt: team.updatedAt }],
    teamsLoad: async () => team,
    teamsSave: async () => ({ id: team.id }),
    teamsDelete: done,
    pcBoxesList: async () => [{ id: 'box1', name: 'Box 1', sortOrder: 0, updatedAt: 1 }],
    pcBoxCreate: async (name: string) => ({ id: 'box2', name, sortOrder: 1, updatedAt: 1 }),
    pcBoxRename: done,
    pcBoxDelete: done,
    pcBoxReorder: done,
    pcPokemonList: async (boxId: string) => (boxId === 'box1' ? pc : []),
    pcPokemonSave: async () => ({ id: 'saved' }),
    pcPokemonDelete: done,
    pcPokemonMove: done,
    // Packs exist only when a test serves one (see counters.spec.ts).
    packsGet: async (name: string) => {
      if (!(window as unknown as { stablabTestPacks?: boolean }).stablabTestPacks) return null;
      const res = await fetch(`/__packs/${name}`);
      return res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
    },
  };
  try {
    localStorage.setItem('stablab:fx', 'lite');
  } catch {
    /* storage unavailable */
  }
}
