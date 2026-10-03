import { createContext, useContext } from 'react';

export type FormatId = 'gen9ou' | 'gen9nationaldex';

export interface FormatProfile {
  id: FormatId;
  /** Full name, e.g. "National Dex OU". */
  label: string;
  /** Fits a pill or a button. */
  shortLabel: string;
  gen: 9;
  /** Format id understood by Showdown's simulator and validator. */
  showdownFormat: string;
  /** Battles in both formats are level 100. */
  level: number;
  /** Learnsets include moves only older generations teach. */
  allowsLegacyMoves: boolean;
  /** Moves and items Showdown marks as from a past generation (Z-Crystals, Mega Stones, ...). */
  allowsPastMechanics: boolean;
}

export const FORMATS: Record<FormatId, FormatProfile> = {
  gen9ou: {
    id: 'gen9ou',
    label: 'Gen 9 OU',
    shortLabel: 'Gen 9 OU',
    gen: 9,
    showdownFormat: 'gen9ou',
    level: 100,
    allowsLegacyMoves: false,
    allowsPastMechanics: false,
  },
  gen9nationaldex: {
    id: 'gen9nationaldex',
    label: 'National Dex OU',
    shortLabel: 'NatDex OU',
    gen: 9,
    showdownFormat: 'gen9nationaldex',
    level: 100,
    allowsLegacyMoves: true,
    allowsPastMechanics: true,
  },
};

export const FORMAT_ORDER: FormatId[] = ['gen9ou', 'gen9nationaldex'];
export const DEFAULT_FORMAT: FormatId = 'gen9nationaldex';

export function isFormatId(value: unknown): value is FormatId {
  return typeof value === 'string' && value in FORMATS;
}

export const FormatContext = createContext<FormatProfile>(FORMATS[DEFAULT_FORMAT]);

export function useFormat(): FormatProfile {
  return useContext(FormatContext);
}
