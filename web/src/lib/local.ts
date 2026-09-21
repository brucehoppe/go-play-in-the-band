/** True inside the local app, which marks its page. The hosted demo never has this mark. */
export const isLocalApp = (): boolean => document.querySelector('meta[name="gpitb-local"]') !== null;

/** Ask the local app to stop, and the instrument splitter with it. True when it agreed. */
export async function quitLocalApp(): Promise<boolean> {
  try {
    return (await fetch("./__quit", { method: "POST" })).ok;
  } catch {
    return false;
  }
}
