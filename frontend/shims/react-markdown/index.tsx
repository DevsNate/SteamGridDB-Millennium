// Maps react-markdown to a small renderer for the Markdown SteamGridDB allows
// in asset notes: paragraphs, emphasis, strikethrough, code, lists, quotes,
// rules and links (including bare URLs, as GFM does). It builds React
// elements only, never HTML strings. Tables and other rare syntax stay text.
import { createElement, Fragment } from 'react';
import type { ComponentType, ReactNode } from 'react';

type MarkdownNode = string | { tag: string; props?: Record<string, string>; children: MarkdownNode[] };

export type ReactMarkdownProps = { node?: unknown; children?: ReactNode };

export type Options = {
  children?: string;
  remarkPlugins?: unknown[];
  disallowedElements?: string[];
  unwrapDisallowed?: boolean;
  components?: Record<string, ComponentType<any>>;
};

// Same rule as react-markdown's default URL transform.
const safeHref = (href: string) => /^(https?:|mailto:)/i.test(href) ? href : undefined;

const inlineRules: Array<[RegExp, (match: RegExpExecArray) => MarkdownNode]> = [
  [/\\([\\`*_{}[\]()#+\-.!~>|])/y, (m) => m[1]],
  [/(`+)([\s\S]*?[^`])\1(?!`)/y, (m) => ({ tag: 'code', children: [m[2].trim()] })],
  [/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/y, (m) => ({ tag: 'img', props: { alt: m[1], src: m[2] }, children: [m[1]] })],
  [/\[((?:[^[\]]|\[[^\]]*\])*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/y, (m) => link(m[2], parseInline(m[1]))],
  [/<(https?:\/\/[^>\s]+)>/y, (m) => link(m[1], [m[1]])],
  [/https?:\/\/[^\s<]*[^\s<.,:;"')\]!?*_~]/y, (m) => link(m[0], [m[0]])],
  [/(\*\*|__)(?=\S)([\s\S]*?\S)\1/y, (m) => ({ tag: 'strong', children: parseInline(m[2]) })],
  [/~~(?=\S)([\s\S]*?\S)~~/y, (m) => ({ tag: 'del', children: parseInline(m[1]) })],
  [/(\*|_)(?=\S)([\s\S]*?\S)\1(?![A-Za-z0-9])/y, (m) => ({ tag: 'em', children: parseInline(m[2]) })],
];

const link = (href: string, children: MarkdownNode[]): MarkdownNode => {
  const safe = safeHref(href);
  return safe ? { tag: 'a', props: { href: safe }, children } : { tag: 'span', children };
};

function parseInline(text: string): MarkdownNode[] {
  const nodes: MarkdownNode[] = [];
  let plain = '';
  let index = 0;
  outer: while (index < text.length) {
    // Underscore emphasis and bare URLs never start inside a word.
    const midWord = index > 0 && /[A-Za-z0-9]/.test(text[index - 1]);
    for (const [rule, build] of inlineRules) {
      if (midWord && (rule.source.startsWith('https') || (rule.source.startsWith('(\\*|_)') && text[index] === '_'))) continue;
      rule.lastIndex = index;
      const match = rule.exec(text);
      if (!match) continue;
      if (plain) nodes.push(plain);
      plain = '';
      // Read the end first: build() parses nested text with these same regexes.
      index = rule.lastIndex;
      nodes.push(build(match));
      continue outer;
    }
    plain += text[index++];
  }
  if (plain) nodes.push(plain);
  return nodes;
}

const listItem = /^( *)([-*+]|\d{1,9}[.)]) +(.*)$/;
const startsBlock = (line: string) => /^ {0,3}(#{1,6} |> ?|```|([-*_] *){3,}$)/.test(line) || listItem.test(line);

function parseBlocks(lines: string[]): MarkdownNode[] {
  const blocks: MarkdownNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index++; continue; }

    if (/^ {0,3}```/.test(line)) {
      const code: string[] = [];
      while (++index < lines.length && !/^ {0,3}```/.test(lines[index])) code.push(lines[index]);
      index++;
      blocks.push({ tag: 'pre', children: [{ tag: 'code', children: [code.join('\n')] }] });
      continue;
    }
    const heading = line.match(/^ {0,3}(#{1,6}) +(.*?)(?: +#+)? *$/);
    if (heading) {
      blocks.push({ tag: `h${heading[1].length}`, children: parseInline(heading[2]) });
      index++;
      continue;
    }
    if (/^ {0,3}([-*_] *){3,}$/.test(line)) {
      blocks.push({ tag: 'hr', children: [] });
      index++;
      continue;
    }
    if (/^ {0,3}> ?/.test(line)) {
      const quoted: string[] = [];
      while (index < lines.length && /^ {0,3}> ?/.test(lines[index])) quoted.push(lines[index++].replace(/^ {0,3}> ?/, ''));
      blocks.push({ tag: 'blockquote', children: parseBlocks(quoted) });
      continue;
    }
    const first = line.match(listItem);
    if (first) {
      const indent = first[1].length;
      const ordered = /\d/.test(first[2]);
      const items: string[][] = [];
      while (index < lines.length) {
        const item = lines[index].match(listItem);
        if (item && item[1].length === indent && /\d/.test(item[2]) === ordered) {
          items.push([item[3]]);
        } else if (lines[index].trim() && (/^\s/.test(lines[index]) || !startsBlock(lines[index]))) {
          // A deeper item or a continuation line belongs to the current item.
          items[items.length - 1].push(lines[index].slice(Math.min(indent + 2, lines[index].search(/\S/))));
        } else break;
        index++;
      }
      blocks.push({
        tag: ordered ? 'ol' : 'ul',
        children: items.map((item) => {
          const content = parseBlocks(item);
          // Tight list items render their text without a paragraph, like react-markdown.
          const [head, ...rest] = content;
          const unwrapped = typeof head === 'object' && head.tag === 'p' ? [...head.children, ...rest] : content;
          return { tag: 'li', children: unwrapped };
        }),
      });
      continue;
    }
    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() && (paragraph.length === 0 || !startsBlock(lines[index]))) paragraph.push(lines[index++].trim());
    blocks.push({ tag: 'p', children: parseInline(paragraph.join('\n')) });
  }
  return blocks;
}

const render = (nodes: MarkdownNode[], options: Options): ReactNode[] => nodes.map((node, key) => {
  if (typeof node === 'string') return node;
  const children = render(node.children, options);
  if (options.disallowedElements?.includes(node.tag)) {
    return options.unwrapDisallowed ? createElement(Fragment, { key }, ...children) : null;
  }
  const component = options.components?.[node.tag] ?? node.tag;
  const props = typeof component === 'string' ? { key, ...node.props } : { key, node, ...node.props };
  return node.tag === 'hr' || node.tag === 'img' ? createElement(component, props) : createElement(component, props, ...children);
});

export default function ReactMarkdown(options: Options) {
  const source = typeof options.children === 'string' ? options.children : '';
  return createElement(Fragment, null, ...render(parseBlocks(source.replace(/\r\n?/g, '\n').split('\n')), options));
}
