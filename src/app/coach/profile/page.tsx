"use client";
import { BadgeCheck, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardBody, CardHeader } from "@/components/ui/display";
import { Field, Input, Textarea } from "@/components/ui/form";
import { ProfilePage } from "@/components/shared/profile-page";
import { api } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";

function CoachProfileCard() {
  const q = useApi(["coach-space"], () => api.coaches.myCoachSpace());
  const [bio, setBio] = useState("");
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [tag, setTag] = useState("");
  useEffect(() => {
    if (q.data?.profile) {
      setBio(q.data.profile.bio);
      setSpecialties(q.data.profile.specialties);
    }
  }, [q.data]);
  const save = useAction(() => api.coaches.updateMyCoachProfile({ bio, specialties }), { success: "Profil de coach enregistré." });
  const addTag = () => {
    const t = tag.trim();
    if (t.length >= 2 && !specialties.includes(t) && specialties.length < 10) setSpecialties([...specialties, t]);
    setTag("");
  };
  return (
    <Card>
      <CardHeader title="Profil de coach" icon={<BadgeCheck className="h-4 w-4" />} description="Visible par vos apprenants." />
      <CardBody className="space-y-4">
        <Field label="Présentation" hint={`${bio.length}/1000`}>
          {(p) => <Textarea {...p} rows={4} value={bio} onChange={(e) => setBio(e.target.value)} maxLength={1000} />}
        </Field>
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700">Spécialités</p>
          <div className="flex flex-wrap gap-1.5">
            {specialties.map((s) => (
              <Badge key={s} tone="brand">
                {s}
                <button onClick={() => setSpecialties(specialties.filter((x) => x !== s))} aria-label={`Retirer ${s}`}>
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input value={tag} onChange={(e) => setTag(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())} placeholder="Ex. : Obligations" aria-label="Nouvelle spécialité" maxLength={60} />
            <Button variant="outline" onClick={addTag}>
              Ajouter
            </Button>
          </div>
        </div>
        <Button onClick={() => void save.run()} loading={save.pending}>
          Enregistrer
        </Button>
      </CardBody>
    </Card>
  );
}

export default function CoachProfile() {
  return <ProfilePage extra={<CoachProfileCard />} />;
}
