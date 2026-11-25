/** Données structurées JSON-LD ; `<` est échappé pour qu'une valeur ne puisse pas fermer la balise. */
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}
