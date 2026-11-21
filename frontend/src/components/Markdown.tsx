import { Fragment, type ReactNode } from 'react';

const SAFE_LINK = /^(https?:\/\/|mailto:)/i;
const INLINE = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;

function inline(text: string): ReactNode[] {
  return text.split(INLINE).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code key={index} className="rounded bg-fg/10 px-1 text-[0.9em]">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    if (link) {
      const [, label, href] = link;
      if (href && SAFE_LINK.test(href)) {
        return (
          <a key={index} href={href} rel="noopener noreferrer" className="text-accent underline">
            {label}
          </a>
        );
      }
      return <Fragment key={index}>{label}</Fragment>;
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}

type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'rule' }
  | { kind: 'paragraph'; lines: string[] };

function parse(source: string): Block[] {
  const blocks: Block[] = [];
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length > 0) blocks.push({ kind: 'paragraph', lines: paragraph });
    paragraph = [];
  };
  const flushList = () => {
    if (list) blocks.push({ kind: 'list', ...list });
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (line.trim() === '') {
      flushParagraph();
      flushList();
    } else if (/^---+$/.test(line.trim())) {
      flushParagraph();
      flushList();
      blocks.push({ kind: 'rule' });
    } else if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ kind: 'heading', level: heading[1]!.length, text: heading[2]! });
    } else if (bullet || numbered) {
      flushParagraph();
      const ordered = Boolean(numbered);
      if (list && list.ordered !== ordered) flushList();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]!);
    } else {
      flushList();
      paragraph.push(line.trim());
    }
  }
  flushParagraph();
  flushList();
  return blocks;
}

const headingClass: Record<number, string> = {
  1: 'mt-2 text-3xl font-bold',
  2: 'mt-8 text-xl font-semibold',
  3: 'mt-6 text-lg font-semibold',
  4: 'mt-4 font-semibold',
};

export function Markdown({ source }: { source: string }) {
  return (
    <div className="space-y-3 text-sm leading-relaxed">
      {parse(source).map((block, index) => {
        switch (block.kind) {
          case 'heading': {
            const Tag = `h${Math.min(block.level + 0, 4)}` as 'h1' | 'h2' | 'h3' | 'h4';
            return (
              <Tag key={index} className={headingClass[block.level]}>
                {inline(block.text)}
              </Tag>
            );
          }
          case 'list': {
            const Tag = block.ordered ? 'ol' : 'ul';
            return (
              <Tag
                key={index}
                className={`${block.ordered ? 'list-decimal' : 'list-disc'} space-y-1 pl-6`}
              >
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>{inline(item)}</li>
                ))}
              </Tag>
            );
          }
          case 'rule':
            return <hr key={index} className="border-fg/20" />;
          default:
            return (
              <p key={index}>
                {block.lines.map((line, lineIndex) => (
                  <Fragment key={lineIndex}>
                    {lineIndex > 0 && <br />}
                    {inline(line)}
                  </Fragment>
                ))}
              </p>
            );
        }
      })}
    </div>
  );
}
