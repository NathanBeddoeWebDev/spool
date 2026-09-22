import { Marked, type Token, type Tokens } from 'marked';
import { truncateGraphemes } from './text.ts';

const SAFE_PROTOCOLS = /^(https?:|mailto:|at:|#|\/)/i;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/**
 * Markdown renderer for untrusted records: raw HTML is shown as text and
 * only http(s)/mailto/at links survive. No DOM sanitiser needed server-side.
 */
const safe = new Marked({ gfm: true, breaks: false });
safe.use({
  renderer: {
    html({ text }) {
      return escapeHtml(text);
    },
    link({ href, title, tokens }) {
      const inner = this.parser.parseInline(tokens);
      if (!SAFE_PROTOCOLS.test(href.trim())) return inner;
      const t = title ? ` title="${escapeHtml(title)}"` : '';
      const external = /^https?:/i.test(href) ? ' rel="noopener nofollow ugc" target="_blank"' : '';
      return `<a href="${escapeHtml(href)}"${t}${external}>${inner}</a>`;
    },
    image({ href, text }) {
      if (!/^https:/i.test(href.trim())) return escapeHtml(text);
      return `<img src="${escapeHtml(href)}" alt="${escapeHtml(text)}" loading="lazy" />`;
    },
  },
});

export function renderMarkdown(markdown: string): string {
  return safe.parse(markdown, { async: false });
}

const lexer = new Marked({ gfm: true });

function inlineText(tokens: Token[] | undefined): string {
  if (!tokens) return '';
  return tokens
    .map((t) => {
      switch (t.type) {
        case 'br':
          return '\n';
        case 'image':
          return (t as Tokens.Image).text;
        case 'html':
        case 'tag':
          return '';
        case 'codespan':
          return (t as Tokens.Codespan).text;
        default: {
          const nested = (t as { tokens?: Token[] }).tokens;
          return nested ? inlineText(nested) : ((t as { text?: string }).text ?? '');
        }
      }
    })
    .join('');
}

function blockText(tokens: Token[]): string[] {
  const out: string[] = [];
  for (const t of tokens) {
    switch (t.type) {
      case 'space':
      case 'hr':
      case 'def':
        break;
      case 'code':
        out.push((t as Tokens.Code).text);
        break;
      case 'heading':
      case 'paragraph':
        out.push(inlineText((t as Tokens.Paragraph).tokens));
        break;
      case 'blockquote':
        out.push(...blockText((t as Tokens.Blockquote).tokens));
        break;
      case 'list':
        out.push((t as Tokens.List).items.map((item) => blockText(item.tokens).join('\n')).join('\n'));
        break;
      case 'table': {
        const table = t as Tokens.Table;
        const rows = [table.header, ...table.rows];
        out.push(rows.map((row) => row.map((cell) => inlineText(cell.tokens)).join('\t')).join('\n'));
        break;
      }
      case 'html':
        break;
      default: {
        const nested = (t as { tokens?: Token[] }).tokens;
        out.push(nested ? inlineText(nested) : ((t as { text?: string }).text ?? ''));
      }
    }
  }
  return out.map((s) => s.trim()).filter(Boolean);
}

/** Plain text for `textContent`: markdown syntax removed, paragraphs kept. */
export function markdownToText(markdown: string): string {
  return blockText(lexer.lexer(markdown)).join('\n\n');
}

/** First paragraph(s) of plain text, trimmed to `max` graphemes. */
export function excerpt(plain: string, max = 200): string {
  const first = plain.split(/\n{2,}/).find((p) => p.trim().length > 0) ?? '';
  return truncateGraphemes(first.replace(/\s+/g, ' ').trim(), max);
}

/**
 * If the body opens with a level-1 heading, use it as the title and drop it
 * from the body. Writers type "# Title" out of habit; we shouldn't show it twice.
 */
export function extractTitle(markdown: string): { title: string | null; body: string } {
  const match = /^\s*#\s+(.+?)\s*#*\s*(?:\n|$)/.exec(markdown);
  if (!match) return { title: null, body: markdown };
  return { title: match[1]!.trim(), body: markdown.slice(match[0].length).replace(/^\s+/, '') };
}
