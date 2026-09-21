import { GUITAR_PRESETS, guitarHint, stemLabel } from "../lib/band";

interface Props {
  /** Stem names in engine order. */
  names: string[];
  /** Level per stem, 0..100. */
  levels: number[];
  muted: boolean[];
  /** Index of the original guitar stem, or -1 when the song is a single mix. */
  guitar: number;
  onLevel: (stem: number, level: number) => void;
  onMute: (stem: number) => void;
}

function Slider({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <input
      id={id}
      className="fader"
      type="range"
      min={0}
      max={100}
      step={1}
      value={value}
      aria-label={label}
      aria-valuetext={`${value}%`}
      onChange={(e) => onChange(Number(e.currentTarget.value))}
    />
  );
}

export function BandMixer({
  names,
  levels,
  muted,
  guitar,
  onLevel,
  onMute,
}: Props) {
  return (
    <aside className="panel band-panel" aria-label="The band">
      <h2>The band</h2>
      {guitar >= 0 ? (
        <div className="your-part">
          <p className="part-tag">YOUR PART</p>
          <div className="stem-row">
            <label htmlFor="stem-guitar">Guitar</label>
            <output className="mono readout" htmlFor="stem-guitar">
              {levels[guitar]}%
            </output>
          </div>
          <Slider
            id="stem-guitar"
            label="Guitar level"
            value={levels[guitar]}
            onChange={(v) => onLevel(guitar, v)}
          />
          <div className="presets" role="group" aria-label="Guitar presets">
            {GUITAR_PRESETS.map((p) => (
              <button
                key={p.label}
                className="toggle preset"
                aria-pressed={levels[guitar] === p.level}
                onClick={() => onLevel(guitar, p.level)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <p className="hint guitar-hint" aria-live="polite">
            {guitarHint(levels[guitar])}
          </p>
        </div>
      ) : (
        <div className="your-part disabled" aria-disabled="true">
          <p className="part-tag">YOUR PART</p>
          <p className="hint">
            To split a recording into parts, run the optional local backend (see the README)
          </p>
        </div>
      )}
      <ul className="stems">
        {names.map((name, i) =>
          i === guitar ? null : (
            <li key={name} className="stem">
              <div className="stem-row">
                <label htmlFor={`stem-${i}`}>{stemLabel(name)}</label>
                <output className="mono readout" htmlFor={`stem-${i}`}>
                  {levels[i]}%
                </output>
                <button
                  className="toggle mute"
                  aria-pressed={muted[i]}
                  aria-label={`Mute ${name}`}
                  onClick={() => onMute(i)}
                >
                  M
                </button>
              </div>
              <Slider
                id={`stem-${i}`}
                label={`${stemLabel(name)} level`}
                value={levels[i]}
                onChange={(v) => onLevel(i, v)}
              />
            </li>
          ),
        )}
      </ul>
    </aside>
  );
}
