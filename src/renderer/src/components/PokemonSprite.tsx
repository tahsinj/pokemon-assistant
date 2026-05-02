import { useEffect, useMemo, useState } from 'react';
import { pokemonSpriteUrl, type PokemonSpriteVariant } from '../lib/pokemonSprite';

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
  const [failed, setFailed] = useState(false);
  const url = useMemo(() => pokemonSpriteUrl(dex, variant), [dex, variant]);

  useEffect(() => {
    setFailed(false);
  }, [dex, variant]);
  const glyph = (name.trim()[0] ?? '?').toUpperCase();
  const sizeClass = SIZE_CLASS[size];
  const wrapClasses = ['poke-sprite-wrap', sizeClass, wrapClassName].filter(Boolean).join(' ');

  if (!url || failed) {
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
        src={url}
        alt=""
        className={['poke-sprite', sizeClass, className].filter(Boolean).join(' ')}
        loading="lazy"
        decoding="async"
        draggable={false}
        onError={() => setFailed(true)}
      />
    </span>
  );
}
