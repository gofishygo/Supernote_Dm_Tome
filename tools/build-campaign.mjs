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
const files = readdirSync(srcDir).filter(f => f.toLowerCase().endsWith('.md') && f.toLowerCase() !== 'readme.md').sort();
const sessions = files.map((f, i) => parse(readFileSync(join(srcDir, f), 'utf8'), i + 1, f.replace(/\.md$/i, '')));
sessions.sort((a, b) => a.number - b.number);
const out = {generatedAt: new Date().toISOString(), sessions};
writeFileSync(outFile, JSON.stringify(out, null, 2) + '\n');
console.log(`campaign: ${sessions.length} session(s), ${sessions.reduce((n, s) => n + s.scenes.length, 0)} scene(s) -> src/campaign.generated.json`);
