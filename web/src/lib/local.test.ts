import { afterEach, describe, expect, it, vi } from "vitest";
import { quitLocalApp } from "./local";

afterEach(() => vi.unstubAllGlobals());

describe("quitLocalApp", () => {
  it("asks with a POST, which a link or image on another website cannot send", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetch);
    expect(await quitLocalApp()).toBe(true);
    expect(fetch).toHaveBeenCalledWith("./__quit", { method: "POST" });
  });
  it("says no when the app refused or could not be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    expect(await quitLocalApp()).toBe(false);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await quitLocalApp()).toBe(false);
  });
});
