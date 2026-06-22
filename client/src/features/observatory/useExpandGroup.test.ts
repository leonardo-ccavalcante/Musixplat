import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { type ExpandCmd, useExpandGroup } from "./useExpandGroup";

const KEYS = ["a", "b", "c"];
type Props = { cmd: ExpandCmd | null; keys: string[] };

describe("useExpandGroup", () => {
  it("starts with everything collapsed", () => {
    const { result } = renderHook(() => useExpandGroup(null, KEYS));
    expect(KEYS.every((k) => !result.current.isOpen(k))).toBe(true);
  });

  it("an expand command opens every current key; collapse closes them", () => {
    const { result, rerender } = renderHook(({ cmd, keys }: Props) => useExpandGroup(cmd, keys), {
      initialProps: { cmd: null as ExpandCmd | null, keys: KEYS },
    });

    rerender({ cmd: { open: true, n: 1 }, keys: KEYS });
    expect(KEYS.every((k) => result.current.isOpen(k))).toBe(true);

    rerender({ cmd: { open: false, n: 2 }, keys: KEYS });
    expect(KEYS.every((k) => !result.current.isOpen(k))).toBe(true);
  });

  it("individual toggles persist between broadcasts", () => {
    const { result } = renderHook(() => useExpandGroup(null, KEYS));
    act(() => result.current.setOpen("b", true));
    expect(result.current.isOpen("b")).toBe(true);
    expect(result.current.isOpen("a")).toBe(false);
    act(() => result.current.setOpen("b", false));
    expect(result.current.isOpen("b")).toBe(false);
  });

  it("re-firing the same action (new n) re-applies it", () => {
    const { result, rerender } = renderHook(({ cmd, keys }: Props) => useExpandGroup(cmd, keys), {
      initialProps: { cmd: { open: true, n: 1 } as ExpandCmd | null, keys: KEYS },
    });
    expect(result.current.isOpen("a")).toBe(true);
    act(() => result.current.setOpen("a", false));
    expect(result.current.isOpen("a")).toBe(false);
    rerender({ cmd: { open: true, n: 2 }, keys: KEYS });
    expect(result.current.isOpen("a")).toBe(true);
  });

  it("an expand clicked before rows load is applied when they arrive (same command ref)", () => {
    const expand: ExpandCmd = { open: true, n: 1 };
    const { result, rerender } = renderHook(({ cmd, keys }: Props) => useExpandGroup(cmd, keys), {
      initialProps: { cmd: expand, keys: [] as string[] },
    });
    // command processed against an empty key list — nothing to open yet
    expect(result.current.isOpen("a")).toBe(false);
    // rows arrive (keys identity changes); same command must now open them
    rerender({ cmd: expand, keys: KEYS });
    expect(KEYS.every((k) => result.current.isOpen(k))).toBe(true);
  });

  it("under collapse, a later key change keeps manual toggles and leaves new rows closed", () => {
    const collapse: ExpandCmd = { open: false, n: 1 };
    const { result, rerender } = renderHook(({ cmd, keys }: Props) => useExpandGroup(cmd, keys), {
      initialProps: { cmd: collapse, keys: KEYS },
    });
    act(() => result.current.setOpen("b", true));
    rerender({ cmd: collapse, keys: [...KEYS, "d"] });
    expect(result.current.isOpen("b")).toBe(true);
    expect(result.current.isOpen("d")).toBe(false);
  });
});
