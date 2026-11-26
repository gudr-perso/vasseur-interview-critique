import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Mise en forme des éléments produits par le Markdown, avec les seules couleurs et polices du thème.
const CLASSES = [
  'text-[0.86rem] leading-[1.7] text-ink break-words',
  '[&_h1]:font-display [&_h1]:font-bold [&_h1]:text-[1.25rem] [&_h1]:mt-5 [&_h1]:mb-2',
  '[&_h2]:font-display [&_h2]:font-bold [&_h2]:text-[1.08rem] [&_h2]:mt-5 [&_h2]:mb-2',
  '[&_h3]:font-bold [&_h3]:mt-4 [&_h3]:mb-1 [&_h4]:font-bold [&_h4]:mt-3',
  '[&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-3',
  '[&_a]:text-red [&_a]:underline [&_code]:font-mono [&_code]:text-[0.8rem]',
  '[&_pre]:bg-paper2 [&_pre]:p-3 [&_pre]:mb-3 [&_pre]:overflow-x-auto',
  '[&_blockquote]:border-l-[3px] [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted [&_blockquote]:mb-3',
  '[&_table]:block [&_table]:overflow-x-auto [&_table]:mb-3',
  '[&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1',
  '[&_hr]:my-4 [&_hr]:border-border [&>*:first-child]:mt-0',
].join(' ')

/**
 * Aucune image n'est chargée : une analyse influencée par un entretien pourrait faire charger une image distante
 * dont l'adresse porterait des extraits du corpus. L'image est remplacée par son texte alternatif.
 */
const COMPOSANTS: Components = {
  img: ({ alt }) => (alt ? <span>{alt}</span> : null),
}

export function ApercuMarkdown({ texte }: { texte: string }) {
  if (!texte.trim()) return <p className="text-[0.84rem] text-muted italic">Rien à afficher pour l'instant.</p>
  return (
    <div className={CLASSES}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPOSANTS}>{texte}</ReactMarkdown>
    </div>
  )
}
