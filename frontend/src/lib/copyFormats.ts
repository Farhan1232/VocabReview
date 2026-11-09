/**
 * Plain-text clipboard formats from requirement §12, plus Polish only, definition only and
 * Polish + definition (client request, 4 Nov). Missing fields are omitted cleanly, and the
 * copied text is only the words: no titles or headings.
 */
import type { VocabItem } from '@/api/types';

/** Which fields each copied item contains. */
export type CopyFields = 'en' | 'pl' | 'def' | 'en_pl' | 'en_def' | 'pl_def' | 'en_pl_def' | 'en_ex';
/** One item per line, or tab-separated for pasting into a spreadsheet. */
export type CopyLayout = 'lines' | 'tsv';

/** Names shown in the Copy menu. */
export const COPY_FIELDS_LABEL: Record<CopyFields, string> = {
  en: 'English only',
  pl: 'Polish only',
  def: 'Definition only',
  en_pl: 'English + Polish',
  en_def: 'English + definition',
  pl_def: 'Polish + definition',
  en_pl_def: 'English + Polish + definition',
  en_ex: 'English + example',
};

function parts(item: VocabItem, fields: CopyFields): (string | null)[] {
  const polish = item.polish.length ? item.polish.join(', ') : null;
  const def = item.definition?.trim() || null;
  const example = item.example?.trim() || null;
  switch (fields) {
    case 'en':
      return [item.english];
    case 'pl':
      return [polish];
    case 'def':
      return [def];
    case 'en_pl':
      return [item.english, polish];
    case 'en_def':
      return [item.english, def];
    case 'pl_def':
      return [polish, def];
    case 'en_pl_def':
      return [item.english, polish, def];
    case 'en_ex':
      return [item.english, example];
  }
}

/** How many of these items have nothing to copy in this format, e.g. no Polish for "Polish only". */
export function countEmptyForCopy(items: VocabItem[], fields: CopyFields): number {
  return items.filter((it) => !parts(it, fields).some(Boolean)).length;
}

/**
 * Build the text to copy for these items. A word with nothing to copy is left out of a one-per-line
 * list, but keeps its empty row in a table so the rows still line up in a spreadsheet.
 */
export function formatCopy(items: VocabItem[], fields: CopyFields, layout: CopyLayout): string {
  if (layout === 'tsv')
    return items
      .map((it) =>
        parts(it, fields)
          .map((v) => (v ?? '').replace(/[\t\r\n]+/g, ' '))
          .join('\t')
          .trimEnd(),
      )
      .join('\n');
  return items
    .map((it) =>
      parts(it, fields)
        .filter((v): v is string => !!v)
        .map((v) => v.replace(/[\r\n]+/g, ' '))
        .join(' – '),
    )
    .filter(Boolean)
    .join('\n');
}

/** Copy text to the clipboard, with a fallback for browsers that block the modern API. */
export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Fallback for browsers that block the async clipboard API.
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }
}
