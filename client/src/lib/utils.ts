import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

// Display a number with at most 2 decimals, trailing zeros dropped (0.4302->"0.43", 44->"44",
// 3404.8->"3404.8"). For human-readable rendering only — never mutates the stored full-precision value.
export function fmtNum(n: number): string {
  return Number(n.toFixed(2)).toString();
}
