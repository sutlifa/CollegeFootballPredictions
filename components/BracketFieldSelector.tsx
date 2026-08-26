"use client";

import { useState } from "react";
import { TeamLogo } from "./TeamLogo";
import type { AutoBidReason } from "@/lib/bracket";

export type FieldCandidateRow = {
  teamId: number;
  rank: number;
  team: string;
  conference: string;
  wins: number;
  losses: number;
  score: number;
  logoUrl: string | null;
  autoBidReason: AutoBidReason;
};

type Props = {
  candidates: FieldCandidateRow[];
  formAction: (formData: FormData) => void;
};

/**
 * Auto-bid teams (locked, submitted via hidden inputs -- never rendered as
 * checkboxes at all, so there's no "disabled checkbox that can't be
 * unchecked but also can't be checked-and-submitted" contradiction) plus
 * at-large candidates capped at exactly enough checkboxes to reach 12
 * total. Once that cap is hit, every other unchecked box disables itself;
 * unchecking one re-enables the rest.
 */
export function BracketFieldSelector({ candidates, formAction }: Props) {
  const autoBid = candidates.filter((c) => c.autoBidReason);
  const atLarge = candidates.filter((c) => !c.autoBidReason);
  const maxAtLarge = Math.max(0, 12 - autoBid.length);
  const [checked, setChecked] = useState<Set<number>>(new Set());

  const atCap = checked.size >= maxAtLarge;
  const canSubmit = checked.size === maxAtLarge;

  function toggle(teamId: number) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) {
        next.delete(teamId);
      } else if (next.size < maxAtLarge) {
        next.add(teamId);
      }
      return next;
    });
  }

  return (
    <form action={formAction} className="space-y-4">
      {autoBid.map((c) => (
        <input key={c.teamId} type="hidden" name="teamIds" value={c.teamId} />
      ))}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-accent/50 bg-accent/10 px-3 py-2 text-sm text-accent-strong">
        <span>
          {autoBid.length} automatic bid{autoBid.length === 1 ? "" : "s"}{" "}
          locked in below. Pick exactly {maxAtLarge} at-large team
          {maxAtLarge === 1 ? "" : "s"} to fill out the 12 --{" "}
          <span className="font-semibold">
            {checked.size}/{maxAtLarge} selected
          </span>
          .
        </span>
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40"
        >
          Confirm 12-Team Field
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-ink-muted">
            <tr>
              <th className="px-3 py-2"></th>
              <th className="px-3 py-2 text-right">Rank</th>
              <th className="px-3 py-2 text-left">Team</th>
              <th className="px-3 py-2 text-left">Conference</th>
              <th className="px-3 py-2 text-right">W</th>
              <th className="px-3 py-2 text-right">L</th>
              <th className="px-3 py-2 text-right">Rating</th>
              <th className="px-3 py-2 text-left">Auto bid</th>
            </tr>
          </thead>
          <tbody>
            {autoBid.map((row) => (
              <tr key={row.teamId} className="border-t border-line bg-win/10">
                <td className="px-3 py-2 text-center text-win" title="Locked -- automatic bid">
                  🔒
                </td>
                <td className="px-3 py-2 text-right text-ink">{row.rank}</td>
                <td className="px-3 py-2">
                  <span className="flex items-center gap-2 text-ink">
                    <TeamLogo logoUrl={row.logoUrl} name={row.team} size={20} />
                    {row.team}
                  </span>
                </td>
                <td className="px-3 py-2 text-ink-muted">{row.conference}</td>
                <td className="px-3 py-2 text-right text-ink">{row.wins}</td>
                <td className="px-3 py-2 text-right text-ink">{row.losses}</td>
                <td className="px-3 py-2 text-right font-mono text-ink">
                  {row.score.toFixed(1)}
                </td>
                <td className="px-3 py-2 text-xs font-semibold text-win">
                  {row.autoBidReason === "power-champion"
                    ? "Conference champion"
                    : "Group of Six"}
                </td>
              </tr>
            ))}
            {atLarge.map((row) => {
              const isChecked = checked.has(row.teamId);
              const disabled = !isChecked && atCap;
              return (
                <tr
                  key={row.teamId}
                  className={`border-t border-line ${isChecked ? "bg-win/10" : "bg-surface"} ${disabled ? "opacity-40" : ""}`}
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      name="teamIds"
                      value={row.teamId}
                      checked={isChecked}
                      disabled={disabled}
                      onChange={() => toggle(row.teamId)}
                    />
                  </td>
                  <td className="px-3 py-2 text-right text-ink">{row.rank}</td>
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-2 text-ink">
                      <TeamLogo logoUrl={row.logoUrl} name={row.team} size={20} />
                      {row.team}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-ink-muted">{row.conference}</td>
                  <td className="px-3 py-2 text-right text-ink">{row.wins}</td>
                  <td className="px-3 py-2 text-right text-ink">{row.losses}</td>
                  <td className="px-3 py-2 text-right font-mono text-ink">
                    {row.score.toFixed(1)}
                  </td>
                  <td className="px-3 py-2 text-xs text-ink-muted"></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <button
        type="submit"
        disabled={!canSubmit}
        className="rounded bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40"
      >
        Confirm 12-Team Field
      </button>
    </form>
  );
}
