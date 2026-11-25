/** Capture de l'application dans un cadre de navigateur (images réelles du produit, données fictives). */
export function ProductShot({ src, alt, priority = false, className = "" }: { src: string; alt: string; priority?: boolean; className?: string }) {
  return (
    <figure className={`overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-brand-900/10 ${className}`}>
      <div className="flex items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-3 py-2" aria-hidden>
        <span className="size-2.5 rounded-full bg-slate-300" /><span className="size-2.5 rounded-full bg-slate-300" /><span className="size-2.5 rounded-full bg-slate-300" />
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} width={1200} height={750} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} decoding="async" className="block h-auto w-full" />
    </figure>
  );
}
