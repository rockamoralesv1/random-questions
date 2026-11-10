/** Page reference for an answer, as written in the PDF (e.g. "Fuente en el documento: págs. 3, 11"). */
export function SourceRef({ source, className = '' }: { source?: string | null; className?: string }) {
  if (!source) return null;
  return <p className={`text-xs text-gray-500 italic ${className}`}>📖 {source}</p>;
}
