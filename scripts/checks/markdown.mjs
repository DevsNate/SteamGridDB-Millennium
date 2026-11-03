// Checks the react-markdown shim against the Markdown SteamGridDB asset notes use.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const Fragment = Symbol('Fragment');
const createElement = (type, props, ...children) => ({ type, props: props ?? {}, children });
const exported = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../../frontend/shims/react-markdown/index.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText, { exports: exported, require: () => ({ createElement, Fragment }) });
const ReactMarkdown = exported.default;

// Renders the element tree to compact HTML-like text for readable asserts.
const html = (node) => {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  const inner = node.children.map(html).join('');
  if (node.type === Fragment) return inner;
  const name = typeof node.type === 'string' ? node.type : node.type.name;
  const attrs = Object.entries(node.props).filter(([key]) => key !== 'key' && key !== 'node').map(([key, value]) => ` ${key}="${value}"`).join('');
  return `<${name}${attrs}>${inner}</${name}>`;
};
const md = (source, options = {}) => html(ReactMarkdown({ ...options, children: source }));

assert.equal(md('Hello **bold** and *em* and ~~gone~~ and `code`'),
  '<p>Hello <strong>bold</strong> and <em>em</em> and <del>gone</del> and <code>code</code></p>');
assert.equal(md('snake_case_name stays text'), '<p>snake_case_name stays text</p>');
assert.equal(md('See https://www.steamgriddb.com/grid/1.'), '<p>See <a href="https://www.steamgriddb.com/grid/1">https://www.steamgriddb.com/grid/1</a>.</p>');
assert.equal(md('[site](https://example.com) and [bad](javascript:alert(1))'),
  '<p><a href="https://example.com">site</a> and <span>bad</span>)</p>');
assert.equal(md('a\\*b'), '<p>a*b</p>');
assert.equal(md('# Title\n\n---\n\n> quoted'), '<h1>Title</h1><hr></hr><blockquote><p>quoted</p></blockquote>');
assert.equal(md('- one\n- two\n  - nested\n\n1. first'),
  '<ul><li>one</li><li>two<ul><li>nested</li></ul></li></ul><ol><li>first</li></ol>');
assert.equal(md('```\n<b>raw</b>\n```'), '<pre><code><b>raw</b></code></pre>');
assert.equal(md('line one\nline two'), '<p>line one\nline two</p>');
assert.equal(md('Win\r\nCRLF'), '<p>Win\nCRLF</p>');
assert.equal(md('# Big\n\n*x*', { disallowedElements: ['h1'], unwrapDisallowed: true }), 'Big<p><em>x</em></p>');
assert.equal(md('# Big', { disallowedElements: ['h1'] }), '');
const Link = function Link() {};
assert.equal(md('[a](https://a.example)', { components: { a: Link } }), '<p><Link href="https://a.example">a</Link></p>');
assert.equal(md(undefined), '');
// Text is never parsed as HTML.
assert.equal(md('<img src=x onerror=alert(1)>'), '<p><img src=x onerror=alert(1)></p>');
assert.equal(typeof ReactMarkdown({ children: '<script>' }).children[0].children[0], 'string');
console.log('Markdown checks passed: inline styles, links and URL safety, blocks, lists, options, no HTML parsing.');
