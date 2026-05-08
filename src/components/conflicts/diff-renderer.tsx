'use client';

import { diffWords, diffChars } from 'diff';
import { cn } from '@/lib/utils';

type Mode = 'words' | 'chars' | 'segments';

// Produces inline-highlighted spans. mode 'words' for titles, 'chars' for
// urls (subtle differences), 'segments' for folder paths split by '/'.
export function DiffRenderer({
  winner,
  loser,
  mode = 'words',
}: {
  winner: string;
  loser: string;
  mode?: Mode;
}) {
  if (winner === loser) {
    return <span>{winner}</span>;
  }

  if (mode === 'segments') {
    return <SegmentDiff winner={winner} loser={loser} />;
  }

  const parts =
    mode === 'words' ? diffWords(loser, winner) : diffChars(loser, winner);

  return (
    <span>
      {parts.map((part, i) => {
        if (part.added) {
          return (
            <span
              key={i}
              className="rounded bg-emerald-500/20 px-0.5 text-emerald-700 dark:text-emerald-300"
            >
              {part.value}
            </span>
          );
        }
        if (part.removed) {
          return (
            <span
              key={i}
              className="rounded bg-red-500/15 px-0.5 text-red-700 line-through dark:text-red-300"
            >
              {part.value}
            </span>
          );
        }
        return <span key={i}>{part.value}</span>;
      })}
    </span>
  );
}

// Folder paths get split by "/" so segment-level diffs stay readable for
// deeply nested paths (e.g. /lesezeichenleiste/recherche/2026/q2 vs ...).
function SegmentDiff({ winner, loser }: { winner: string; loser: string }) {
  const winSegs = winner.split('/').filter(Boolean);
  const losSegs = loser.split('/').filter(Boolean);
  const max = Math.max(winSegs.length, losSegs.length);
  const out: React.ReactNode[] = [];
  for (let i = 0; i < max; i++) {
    const w = winSegs[i];
    const l = losSegs[i];
    if (w === l) {
      out.push(
        <span key={i}>
          /<span>{w}</span>
        </span>,
      );
    } else if (w && !l) {
      out.push(
        <span key={i} className="rounded bg-emerald-500/20 px-0.5 text-emerald-700 dark:text-emerald-300">
          /{w}
        </span>,
      );
    } else if (!w && l) {
      out.push(
        <span key={i} className="rounded bg-red-500/15 px-0.5 text-red-700 line-through dark:text-red-300">
          /{l}
        </span>,
      );
    } else {
      out.push(
        <span key={i} className={cn('rounded px-0.5', 'bg-amber-500/15 text-amber-700 dark:text-amber-300')}>
          /{w}
        </span>,
      );
    }
  }
  return <span>{out}</span>;
}
