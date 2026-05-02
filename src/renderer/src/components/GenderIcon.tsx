import type { PcGender } from '../lib/bridgeTypes';

const LABEL: Record<Exclude<PcGender, 'genderless'>, string> = {
  male: 'Male',
  female: 'Female',
};

export function GenderIcon({
  gender,
  className = '',
}: {
  gender: PcGender;
  className?: string;
}) {
  if (gender === 'genderless') return null;

  const label = LABEL[gender];
  const symbol = gender === 'male' ? '♂' : '♀';

  return (
    <span
      className={`gender-icon gender-icon-${gender} ${className}`.trim()}
      title={label}
      aria-label={label}
    >
      {symbol}
    </span>
  );
}
