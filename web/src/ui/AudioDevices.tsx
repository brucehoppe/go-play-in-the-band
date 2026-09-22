import { useEffect, useState } from "react";
import type { AudioChoice } from "../lib/devices";

interface Props {
  choice: AudioChoice;
  canPickOutput: boolean;
  disabled: boolean;
  onChange: (c: AudioChoice) => void;
  /** Ask for the input once so the browser will show device names. */
  onAllow: () => Promise<void>;
  /** Hear the input through the output. */
  monitoring: boolean;
  onMonitor: (on: boolean) => void;
  /** The browser's reported input-to-output delay, ms; null before the audio starts. */
  reportedLatencyMs: number | null;
  /** The measured round trip from Calibrate, ms; null when not calibrated. */
  calibratedMs: number | null;
}

/** Pick the input (a microphone or a USB audio interface and which of its inputs) and the output (e.g. a USB headphone amp). */
export function AudioDevices({ choice, canPickOutput, disabled, onChange, onAllow, monitoring, onMonitor, reportedLatencyMs, calibratedMs }: Props) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const refresh = () =>
    navigator.mediaDevices
      ?.enumerateDevices()
      .then((list) => setDevices(list.filter((d) => d.deviceId && d.deviceId !== "default")))
      .catch(() => {});
  useEffect(() => {
    void refresh();
    navigator.mediaDevices?.addEventListener("devicechange", refresh);
    return () => navigator.mediaDevices?.removeEventListener("devicechange", refresh);
  }, []);
  const inputs = devices.filter((d) => d.kind === "audioinput");
  const outputs = devices.filter((d) => d.kind === "audiooutput");
  // Names stay blank until the page has been allowed an input once.
  const named = inputs.some((d) => d.label);
  return (
    <section className="panel tools" aria-label="Audio devices">
      <h2>Audio devices</h2>
      <div className="tools-row">
        <label>
          Record from
          <select disabled={disabled} value={choice.input} onChange={(e) => onChange({ ...choice, input: e.target.value })}>
            <option value="">Default input</option>
            {inputs.map((d, i) => (
              <option key={d.deviceId} value={d.deviceId}>{d.label || `Input ${i + 1}`}</option>
            ))}
          </select>
        </label>
        <label>
          Interface input
          <select disabled={disabled} value={choice.channel} onChange={(e) => onChange({ ...choice, channel: Number(e.target.value) })}>
            <option value={-1}>Both inputs</option>
            <option value={0}>Input 1</option>
            <option value={1}>Input 2</option>
          </select>
        </label>
        {canPickOutput && (
          <label>
            Play through
            <select disabled={disabled} value={choice.output} onChange={(e) => onChange({ ...choice, output: e.target.value })}>
              <option value="">Default output</option>
              {outputs.map((d, i) => (
                <option key={d.deviceId} value={d.deviceId}>{d.label || `Output ${i + 1}`}</option>
              ))}
            </select>
          </label>
        )}
        {!named && <button disabled={disabled} onClick={() => void onAllow().then(refresh)}>Show device names</button>}
      </div>
      <div className="tools-row">
        <button className="toggle" aria-pressed={monitoring} disabled={disabled} onClick={() => onMonitor(!monitoring)} title="Hear your input through the app. Use headphones, or it will feed back.">
          Monitor {monitoring ? "on" : "off"}
        </button>
        <span className="mono hint">
          delay {reportedLatencyMs === null ? "–" : `${reportedLatencyMs} ms`}
          {calibratedMs !== null ? ` · round trip ${calibratedMs} ms` : ""}
        </span>
      </div>
      <p className="hint">
        With an audio interface, pick the input your guitar is plugged into. The interface's own direct monitoring has no delay;
        Monitor here goes through the browser and adds the delay shown. Use headphones. Calibrate again after changing devices.
      </p>
    </section>
  );
}
