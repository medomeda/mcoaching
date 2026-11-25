import { legalInfo, shown } from "@/content/legal";
import { Prose } from "@/components/ui";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata("/confidentialite");

export default function PrivacyPage() {
  const l = legalInfo();
  return (
    <Prose>
      <h1>Politique de confidentialité</h1>
      <h2>Données collectées sur ce site</h2>
      <p>Lorsque vous demandez un essai, nous recueillons votre nom, votre adresse e-mail, votre téléphone (facultatif), votre activité et votre message, uniquement pour vous répondre. Vous y consentez en cochant la case prévue.</p>
      <h2>Données des espaces clients</h2>
      <p>Les échanges et documents des espaces clients sont stockés dans l’espace propre à chaque client. Nous n’y accédons pas ; notre supervision se limite à des compteurs d’usage (nombre de comptes actifs, de demandes) et à l’état technique du service.</p>
      <h2>Durée de conservation</h2>
      <p>Les demandes d’essai sont conservées le temps nécessaire à leur traitement commercial, puis supprimées sur demande.</p>
      <h2>Vos droits</h2>
      <p>Vous pouvez demander l’accès, la rectification ou la suppression de vos données en écrivant à : {shown(l.email)}.</p>
    </Prose>
  );
}
