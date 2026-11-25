/** Graphique d'usage sans dépendance : membres actifs et demandes du mois, relevés quotidiens. */
export function UsageChart({ points }: { points: { day: string; members: number; requests: number }[] }) {
  if (points.length < 2) return <p className="text-sm text-slate-600">Pas encore assez de relevés pour tracer une courbe.</p>;
  const W = 600, H = 160, P = 24;
  const max = Math.max(1, ...points.flatMap((p) => [p.members, p.requests]));
  const x = (i: number) => P + (i * (W - 2 * P)) / (points.length - 1);
  const y = (v: number) => H - P - (v * (H - 2 * P)) / max;
  const line = (f: (p: (typeof points)[number]) => number) => points.map((p, i) => `${x(i).toFixed(1)},${y(f(p)).toFixed(1)}`).join(" ");
  const last = points.at(-1)!;
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Usage sur ${points.length} jours : ${last.members} membres actifs, ${last.requests} demandes ce mois`} className="w-full">
        <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#cbd5e1" />
        <polyline points={line((p) => p.members)} fill="none" stroke="#1a3f73" strokeWidth="2" />
        <polyline points={line((p) => p.requests)} fill="none" stroke="#b8902a" strokeWidth="2" />
        <text x={P} y={12} fontSize="10" fill="#64748b">max {max}</text>
        <text x={P} y={H - 6} fontSize="10" fill="#64748b">{points[0]!.day}</text>
        <text x={W - P} y={H - 6} fontSize="10" textAnchor="end" fill="#64748b">{last.day}</text>
      </svg>
      <figcaption className="mt-1 flex gap-4 text-xs text-slate-600"><span><span className="mr-1 inline-block h-2 w-4 bg-[#1a3f73]" />Membres actifs</span><span><span className="mr-1 inline-block h-2 w-4 bg-[#b8902a]" />Demandes du mois</span></figcaption>
    </figure>
  );
}
