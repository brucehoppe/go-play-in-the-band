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
  /** Split the full mix right here. Absent when there is nothing to split. */
  onQuickSplit?: () => void;
  onStemSplit?: () => void;
  busy?: boolean;
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
  onMute, onQuickSplit, onStemSplit, busy }: Props) {
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
        <div className="your-part split-card">
          <p className="part-tag">YOUR PART</p>
          {onQuickSplit ? (
            <>
              <p className="hint">This is one full mix. Split it so you can turn parts down.</p>
              <div className="presets">
                <button disabled={busy} onClick={onQuickSplit} title="Drums-like, low bass and everything else. Works right here, in a few seconds.">
                  Quick split
                </button>
                <button disabled={busy} onClick={onStemSplit} title="Guitar, bass, drums, keys, voice. Uses Demucs in the local backend; takes minutes.">
                  Instruments
                </button>
              </div>
            </>
          ) : (
            <p className="hint">Turn parts down with the faders below, then play your own.</p>
          )}
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
