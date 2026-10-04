import { FORMAT_ORDER, FORMATS, useChangeFormat, useFormat, type FormatId } from '../lib/formats';
import { Segmented } from './hud/Segmented';

/** Switch the app's format from inside a page; the page reloads with that format's data. */
export function FormatToggle() {
  const format = useFormat();
  const change = useChangeFormat();
  if (!change) return null;
  return (
    <Segmented<FormatId>
      value={format.id}
      onChange={change}
      options={FORMAT_ORDER.map((id) => ({ id, label: FORMATS[id].shortLabel }))}
    />
  );
}
