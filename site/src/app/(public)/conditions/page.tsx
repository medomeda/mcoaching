import { Prose } from "@/components/ui";
import { pageMetadata } from "@/lib/seo";

// Rendu à la demande : SITE_URL et LEGAL_* sont lues à l'exécution (voir dynamic-pages.test.ts).
export const dynamic = "force-dynamic";

export const metadata = pageMetadata("/conditions");

export default function TermsPage() {
  return (
    <Prose>
      <h1>Conditions d’utilisation</h1>
      <h2>Objet</h2>
      <p>Mentora est un service en ligne d’organisation de l’accompagnement individuel (demandes, échanges, délais, suivi). Ces conditions encadrent son utilisation par les clients et leurs membres.</p>
      <h2>Essai et abonnement</h2>
      <p>Un essai gratuit peut être accordé, pour la durée indiquée sur la page des tarifs. À son terme, la poursuite du service suppose le choix d’une formule et son paiement selon les modalités convenues.</p>
      <h2>Responsabilités du client</h2>
      <p>Le client reste responsable des contenus échangés dans son espace et de l’usage qu’en font ses membres. Il s’engage à ne pas utiliser le service à des fins illicites.</p>
      <h2>Données</h2>
      <p>Les données de chaque client sont conservées dans un espace distinct. À la résiliation, le client peut en demander la récupération avant leur suppression.</p>
      <h2>Suspension et résiliation</h2>
      <p>Le service peut être suspendu en cas d’impayé ou de manquement ; les données ne sont pas supprimées par la suspension. Le client peut résilier à tout moment.</p>
    </Prose>
  );
}
