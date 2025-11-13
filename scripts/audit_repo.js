const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

function listTree(root) {
  const out = [];
  function walk(dir, rel = '') {
    for (const name of fs.readdirSync(dir)) {
      if (['node_modules', '.git', 'uploads'].includes(name)) continue;
      const p = path.join(dir, name);
      const r = path.join(rel, name);
      const s = fs.statSync(p);
      out.push(`${s.isDirectory() ? 'D' : 'F'} ${r}`);
      if (s.isDirectory()) walk(p, r);
    }
  }
  walk(root, '');
  return out.join('\n');
}

function scanRoutes(dir = 'routes') {
  if (!fs.existsSync(dir)) return '';
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
  const lines = [];
  for (const f of files) {
    const txt = fs.readFileSync(path.join(dir, f), 'utf8');
    const matches = [...txt.matchAll(/router\.(get|post|put|delete)\(\s*['"`]([^'"`]+)['"`]/g)];
    if (matches.length) {
      lines.push(`### ${f}`);
      for (const m of matches) lines.push(`- ${m[1].toUpperCase()} ${m[2]}`);
      lines.push('');
    }
  }
  return lines.join('\n');
}

function readPkg() {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  return [
    '## package.json (scripts)',
    '```json',
    JSON.stringify(pkg.scripts, null, 2),
    '```',
    ''
  ].join('\n');
}

function dbReport(dbPath = 'nirnoy.db') {
  if (!fs.existsSync(dbPath)) return 'DB not found.\n';
  const db = new sqlite3.Database(dbPath);
  return new Promise((resolve) => {
    const out = [];
    db.all(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`, [], (e, tables) => {
      if (e) { resolve('DB error: ' + e.message); return; }
      out.push('## DB Tables\n', tables.map(t => `- ${t.name}`).join('\n') + '\n');
      let pending = tables.length;
      if (pending === 0) { resolve(out.join('\n')); return; }
      tables.forEach(t => {
        db.all(`PRAGMA table_info(${t.name})`, [], (e2, cols) => {
          out.push(`### ${t.name}\n` + (e2 ? e2.message : cols.map(c => `- ${c.name} (${c.type})`).join('\n')) + '\n');
          db.get(`SELECT COUNT(*) n FROM ${t.name}`, [], (_e3, r) => {
            out.push(`Rows: ${r?.n ?? '?'}\n`);
            if (--pending === 0) { resolve(out.join('\n')); }
          });
        });
      });
    });
  });
}

(async () => {
  const header = '# Nirnoy 2.0 — Code & DB Audit\n\n';
  const tree = '## Project Tree (excluding node_modules/.git/uploads)\n```\n' + listTree('.') + '\n```\n\n';
  const routes = '## Routes Detected\n' + scanRoutes() + '\n';
  const pkg = readPkg();
  const db = await dbReport();
  const body = header + tree + routes + pkg + db;
  fs.writeFileSync('AUDIT.md', body);
  console.log('Wrote AUDIT.md');
  process.exit(0);
})();
