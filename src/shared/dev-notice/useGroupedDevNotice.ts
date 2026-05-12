import { useEffect, useRef } from "react";
import type { DevNoticeEntry } from "./types";

const formatValue = (value: unknown) => {
  if (typeof value === "number") {
    if (Number.isNaN(value)) return "NaN";
    if (value === Number.POSITIVE_INFINITY) return "Infinity";
    if (value === Number.NEGATIVE_INFINITY) return "-Infinity";
    return String(value);
  }
  if (typeof value === "string") return `"${value}"`;
  if (typeof value === "undefined") return "undefined";
  if (value === null) return "null";
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
};

const formatEntryValue = (value: unknown, unit?: string) => {
  const formatted = formatValue(value);
  if (!unit || typeof value !== "number" || !Number.isFinite(value)) return formatted;
  return `${formatted}${unit}`;
};

const finishSentence = (message: string) => {
  const trimmed = message.trim();
  if (!trimmed) return "";
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
};

const formatEntry = (entry: DevNoticeEntry) => {
  if (entry.message) {
    return `- ${entry.field}: ${finishSentence(entry.message)}`;
  }
  const transition =
    `${formatEntryValue(entry.provided, entry.unit)} -> ` +
    `${formatEntryValue(entry.normalized, entry.unit)}`;
  if (entry.reason) {
    return `- ${entry.field}: ${transition}. ${finishSentence(entry.reason)}`;
  }
  return `- ${entry.field}: ${transition}`;
};

const entrySignature = (entry: DevNoticeEntry) =>
  [
    entry.field,
    formatEntryValue(entry.provided, entry.unit),
    formatEntryValue(entry.normalized, entry.unit),
    entry.reason ?? "",
    entry.message ?? "",
    entry.unit ?? "",
  ].join("|");

interface UseGroupedDevNoticeProps {
  scope: string;
  summary: string;
  entries: DevNoticeEntry[];
}

export function useGroupedDevNotice({
  scope,
  summary,
  entries,
}: UseGroupedDevNoticeProps): void {
  const lastSignatureRef = useRef("");

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    if (entries.length === 0) {
      lastSignatureRef.current = "";
      return;
    }

    const signature = entries.map(entrySignature).join("\n");
    if (signature === lastSignatureRef.current) return;

    lastSignatureRef.current = signature;
    console.warn(`${scope}: ${summary}\n${entries.map(formatEntry).join("\n")}`);
  }, [entries, scope, summary]);
}
