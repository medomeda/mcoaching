"use client";
import { useMemo, useState } from "react";
import { Input, Select } from "@/components/ui/form";
import { appNow } from "@/lib/clock";
import { fromLocalInput } from "@/lib/format";

export interface Period {
  from: string;
  to: string;
  label: string;
}

/** Sélecteur de période (filtres temporels du tableau de bord et des rapports). */
export function usePeriod(initial = "30") {
  const [preset, setPreset] = useState(initial);
  const [custom, setCustom] = useState({ from: "", to: "" });
  const period = useMemo<Period>(() => {
    const now = appNow();
    if (preset === "custom" && custom.from && custom.to) {
      return { from: fromLocalInput(`${custom.from}T00:00`)!, to: fromLocalInput(`${custom.to}T23:59`)!, label: "Période personnalisée" };
    }
    const days = Number(preset === "custom" ? 30 : preset);
    // Arrondi à la minute : la clé de cache reste stable entre deux rendus.
    const to = Math.ceil(now / 60_000) * 60_000;
    return { from: new Date(to - days * 86_400_000).toISOString(), to: new Date(to).toISOString(), label: `${days} derniers jours` };
  }, [preset, custom]);
  const picker = (
    <div className="flex flex-wrap items-center gap-2">
      <Select aria-label="Période" value={preset} onChange={(e) => setPreset(e.target.value)} className="w-48">
        <option value="7">7 derniers jours</option>
        <option value="30">30 derniers jours</option>
        <option value="90">90 derniers jours</option>
        <option value="365">12 derniers mois</option>
        <option value="custom">Personnalisée…</option>
      </Select>
      {preset === "custom" && (
        <>
          <Input type="date" aria-label="Du" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} className="w-40" />
          <Input type="date" aria-label="Au" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} className="w-40" />
        </>
      )}
    </div>
  );
  return { period, picker };
}
