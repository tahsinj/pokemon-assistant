import { useMemo } from 'react';
import { spriteChain, useSpriteFallback, type SpriteKind } from '../lib/sprites';

/** Public variant names map onto the internal sprite kinds. */
export type PokemonSpriteVariant = 'default' | 'artwork' | 'shiny';
const VARIANT_KIND: Record<PokemonSpriteVariant, SpriteKind> = {
  default: 'pixel',
  artwork: 'artwork',
  shiny: 'shiny',
};

export type PokemonSpriteSize = 'xs' | 'sm' | 'md' | 'lg';

const SIZE_CLASS: Record<PokemonSpriteSize, string> = {
  xs: 'poke-sprite--xs',
  sm: 'poke-sprite--sm',
  md: 'poke-sprite--md',
  lg: 'poke-sprite--lg',
};

export function PokemonSprite({
  dex,
  name,
  size = 'sm',
  variant = 'default',
  className = '',
  wrapClassName = '',
  title,
}: {
  dex: number;
  name: string;
  size?: PokemonSpriteSize;
  variant?: PokemonSpriteVariant;
  className?: string;
  wrapClassName?: string;
  title?: string;
}) {
  // spriteChain already encodes the variant fallbacks (e.g. a missing shiny
  // drops to the local default, then remote) and ends with the glyph below.
  const chain = useMemo(() => spriteChain(dex, VARIANT_KIND[variant], name), [dex, variant, name]);
  const { src, exhausted, onError } = useSpriteFallback(chain);
  const glyph = (name.trim()[0] ?? '?').toUpperCase();
  const sizeClass = SIZE_CLASS[size];
  const wrapClasses = ['poke-sprite-wrap', sizeClass, wrapClassName].filter(Boolean).join(' ');

  if (!src || exhausted) {
    return (
      <span
        className={`${wrapClasses} poke-sprite-fallback`}
        title={title ?? name}
        aria-hidden={!name}
      >
        <span className="poke-sprite-glyph">{glyph}</span>
      </span>
    );
  }

  return (
    <span className={wrapClasses} title={title ?? name}>
      <img
        src={src}
        alt=""
        className={['poke-sprite', sizeClass, className].filter(Boolean).join(' ')}
        loading="lazy"
        decoding="async"
        draggable={false}
        onError={onError}
      />
    </span>
  );
}
