#!/usr/bin/env node
/**
 * Convert campaign/*.md into src/campaign.generated.json for bundling.
 * No dependencies; run by the build scripts before Metro.
 */
import {readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'campaign');
const outFile = join(root, 'src', 'campaign.generated.json');

function parse(markdown, fallbackNumber, fileName) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const session = {number: fallbackNumber, title: fileName, intro: [], scenes: []};
  let scene = null;
  let para = [];
  let quote = false;

  const target = () => (scene ? scene.blocks : session.intro);
  const flush = () => {
    if (para.length) {
      target().push({kind: quote ? 'quote' : 'text', text: para.join(' ').trim()});
    }
    para = [];
    quote = false;
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (/^#\s+/.test(line)) {
      flush();
      session.title = line.replace(/^#\s+/, '').trim();
      const m = /(\d+)/.exec(session.title);
      if (m) session.number = Number(m[1]);
      continue;
    }
    if (/^##\s+/.test(line)) {
      flush();
      scene = {title: line.replace(/^##\s+/, '').trim(), blocks: []};
      session.scenes.push(scene);
      continue;
    }
    if (line.trim() === '') {
      flush();
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      flush();
      target().push({kind: 'text', text: '• ' + line.replace(/^\s*[-*]\s+/, '').trim()});
      continue;
    }
    if (/^>\s?/.test(line)) {
      if (!quote) flush();
      quote = true;
      para.push(line.replace(/^>\s?/, ''));
      continue;
    }
    if (quote) flush();
    para.push(line.trim());
  }
  flush();
  return session;
}

if (!existsSync(srcDir)) mkdirSync(srcDir);
const skip = new Set(['readme.md', 'template.md', 'references.md']);
const files = readdirSync(srcDir)
  .filter(f => f.toLowerCase().endsWith('.md') && !skip.has(f.toLowerCase()) && !f.startsWith('_'))
  .sort();
const numberFromName = (f, i) => {
  const m = /^(\d+)/.exec(f);
  return m ? Number(m[1]) : i + 1;
};
const sessions = files.map((f, i) => parse(readFileSync(join(srcDir, f), 'utf8'), numberFromName(f, i), f.replace(/\.md$/i, '')));
sessions.sort((a, b) => a.number - b.number);
const out = {generatedAt: new Date().toISOString(), sessions};
writeFileSync(outFile, JSON.stringify(out, null, 2) + '\n');
console.log(`campaign: ${sessions.length} session(s), ${sessions.reduce((n, s) => n + s.scenes.length, 0)} scene(s) -> src/campaign.generated.json`);

// ---------------------------------------------------------------- characters
const charDir = join(srcDir, 'characters');
const charOut = join(root, 'src', 'characters.generated.json');
let characters = [];
if (existsSync(charDir)) {
  const cfiles = readdirSync(charDir)
    .filter(f => f.toLowerCase().endsWith('.md') && !skip.has(f.toLowerCase()) && !f.startsWith('_'))
    .sort();
  characters = cfiles.map((f, i) => parse(readFileSync(join(charDir, f), 'utf8'), i + 1, f.replace(/\.md$/i, '')));
}
writeFileSync(charOut, JSON.stringify({generatedAt: out.generatedAt, characters}, null, 2) + '\n');
console.log(`characters: ${characters.length} -> src/characters.generated.json`);

// ---------------------------------------------------------------- references
// campaign/references.md holds two pipe tables: Books and Entries.
function parseTables(markdown) {
  const tables = {};
  let section = '';
  let header = null;
  for (const raw of markdown.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trim();
    if (/^##\s+/.test(line)) {
      section = line.replace(/^##\s+/, '').trim().toLowerCase();
      header = null;
      continue;
    }
    if (!line.startsWith('|')) {
      header = null;
      continue;
    }
    const cells = line.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
    if (cells.every(c => /^:?-{2,}:?$/.test(c))) continue; // separator row
    if (!header) {
      header = cells.map(c => c.toLowerCase());
      continue;
    }
    const row = {};
    header.forEach((h, i) => (row[h] = cells[i] ?? ''));
    (tables[section] ??= []).push(row);
  }
  return tables;
}

const refFile = join(srcDir, 'references.md');
const refOut = join(root, 'src', 'references.generated.json');
let books = [];
let entries = [];
let skipped = 0;
if (existsSync(refFile)) {
  const t = parseTables(readFileSync(refFile, 'utf8'));
  books = (t.books ?? [])
    .filter(r => r.key)
    .map(r => ({key: r.key.toUpperCase(), match: r['file name contains'] || r.key, offset: Number(r.offset) || 0}));
  for (const r of t.entries ?? []) {
    const page = Number(r.page);
    if (!r.name || !r.book || !Number.isFinite(page)) {
      skipped++;
      continue;
    }
    entries.push({name: r.name, book: r.book.toUpperCase(), page, tags: r.tags || ''});
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
}
writeFileSync(refOut, JSON.stringify({generatedAt: out.generatedAt, books, entries}, null, 2) + '\n');
console.log(`references: ${books.length} book(s), ${entries.length} entries${skipped ? `, ${skipped} row(s) skipped (no numeric page)` : ''} -> src/references.generated.json`);
