import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../../', import.meta.url));
const starlight = fileURLToPath(new URL('../../node_modules/@steambrew/starlight/bin/starlight.js', import.meta.url));
const bundle = process.argv[2]
  ? readFileSync(process.argv[2], 'utf8')
  : execFileSync(process.execPath, [starlight, '-i', 'dist/steamgriddb.star', '-q', 'frontend:bundle.js'], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
const source = ts.createSourceFile('bundle.js', bundle, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const unresolved = [];

function inspect(node) {
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'require') {
    const position = source.getLineAndCharacterOfPosition(node.getStart(source));
    unresolved.push(`require at ${position.line + 1}:${position.character + 1}`);
  }
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node) && node.moduleSpecifier) {
    unresolved.push('external module declaration');
  }
  ts.forEachChild(node, inspect);
}

inspect(source);
assert.equal(source.parseDiagnostics.length, 0, 'Packed frontend must parse as JavaScript');
assert.deepEqual(unresolved, [], 'Packed frontend must not depend on a browser module loader');
assert.match(bundle, /window\.MILLENNIUM_API/, 'Packed frontend must use the host SDK global');
console.log('Packed frontend check passed: host SDK global, no external module loader.');
