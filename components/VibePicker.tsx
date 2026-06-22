'use client';

import { useState } from 'react';
import { TEAMS, findTeam } from '@/lib/teams';

export default function VibePicker({
  onConfirm,
}: {
  onConfirm: (config: { team: string; player?: string }) => void;
}) {
  const [teamId, setTeamId] = useState<string | null>(null);
  const [player, setPlayer] = useState<string | undefined>(undefined);
  const team = teamId ? findTeam(teamId) : undefined;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl">Pick your team</h2>
      <div className="grid grid-cols-3 gap-3">
        {TEAMS.map((t) => (
          <button
            key={t.id}
            onClick={() => { setTeamId(t.id); setPlayer(undefined); }}
            className={`rounded-xl border p-4 transition ${
              teamId === t.id ? 'border-[var(--gold)] bg-white/5' : 'border-white/15'
            }`}
          >
            <div className="text-3xl">{t.emoji}</div>
            <div className="text-sm">{t.name}</div>
          </button>
        ))}
      </div>

      {team && (
        <div className="space-y-3">
          <p className="text-sm opacity-70">Draw me next to (optional):</p>
          <div className="flex flex-wrap justify-center gap-2">
            {team.players.map((p) => (
              <button
                key={p}
                onClick={() => setPlayer((cur) => (cur === p ? undefined : p))}
                className={`rounded-full border px-3 py-1 text-sm ${
                  player === p ? 'border-[var(--gold)] bg-white/5' : 'border-white/15'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <button className="btn-gold" onClick={() => onConfirm({ team: team.name, player })}>
            Start the drawing →
          </button>
        </div>
      )}
    </div>
  );
}
