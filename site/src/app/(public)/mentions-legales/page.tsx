import { legalInfo, shown } from "@/content/legal";
import { Prose } from "@/components/ui";
import { pageMetadata } from "@/lib/seo";

// Rendu à la demande : SITE_URL et LEGAL_* sont lues à l'exécution (voir dynamic-pages.test.ts).
export const dynamic = "force-dynamic";

export const metadata = pageMetadata("/mentions-legales");

export default function LegalNoticePage() {
  const l = legalInfo();
  return (
    <Prose>
      <h1>Mentions légales</h1>
      <h2>Éditeur du site</h2>
      <ul>
        <li>Raison sociale : {shown(l.company)}</li>
        <li>Adresse : {shown(l.address)}</li>
        <li>E-mail : {shown(l.email)}</li>
        <li>Téléphone : {shown(l.phone)}</li>
      </ul>
      <h2>Hébergement</h2>
      <p>Le site et les espaces clients sont hébergés sur des serveurs dédiés opérés par l’éditeur.</p>
      <h2>Propriété intellectuelle</h2>
      <p>La marque Mentora, le logiciel, les textes et les éléments graphiques du site sont protégés. Toute reproduction sans autorisation écrite est interdite.</p>
    </Prose>
  );
}
