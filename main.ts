// Solmar Bay — a gta6-01 entry (Node 22, standard library only): the game is this directory's
// game/ folder, plain static files a desktop browser loads offline (game/index.html and its ES
// modules, no library and no network request), and the program hands it in. It copies game/ and
// screenshots/ from beside this file to /output and writes /output/dossier.json, the summary the
// judge reads, with the vendored make.fun library. The game itself is an original open-world
// crime story: Mara Quinn drives, steals cars, outruns the Solmar Bay PD and runs five jobs for
// the Tide crew across a coastal city with traffic, pedestrians, a wanted system, combat, a HUD
// with a live minimap, a start screen and localStorage saves — all in plain Canvas 2D with
// synthesized WebAudio sound, no vendored engine, no assets fetched from anywhere.
// Put your 3 or 4 PNG or JPEG screenshots in screenshots/ (the first by name is the cover) and run it.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Validate without writing anything: `node main.ts --check-only`.

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const checkOnly = process.argv.includes('--check-only');

// Walk a directory tree: [file count, total bytes]. Used to check the game/
// caps (993 files, 48 MiB) before copying, where the message names the breach.
function walkStats(dir: string): [number, number] {
  let files = 0;
  let bytes = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      const [f, b] = walkStats(p);
      files += f;
      bytes += b;
    } else {
      files += 1;
      bytes += statSync(p).size;
    }
  }
  return [files, bytes];
}

// Fail fast, with a plain message, when the entry is broken before it is copied:
// a missing index.html would otherwise hand the grader an empty game.
if (!existsSync(join(here, 'game', 'index.html'))) {
  throw new Error('Solmar Bay: game/index.html is missing — the entry cannot be handed in.');
}
// The gate caps index.html at 1 MiB and each screenshot at 256 KiB, with 3–4
// screenshots in all: check them here, where the message names the file,
// instead of handing the grader an entry it must refuse.
const indexSize = statSync(join(here, 'game', 'index.html')).size;
if (indexSize > 1048576) {
  throw new Error(`Solmar Bay: game/index.html is ${indexSize} bytes, over the 1 MiB cap.`);
}
// The game/ folder itself is capped at 993 files and 48 MiB in all: count it
// before the copy, so a stray build artefact is caught here, not by the gate.
const [gameFiles, gameBytes] = walkStats(join(here, 'game'));
if (gameFiles > 993) {
  throw new Error(`Solmar Bay: game/ holds ${gameFiles} files, over the 993 cap.`);
}
if (gameBytes > 50331648) {
  throw new Error(`Solmar Bay: game/ is ${gameBytes} bytes, over the 48 MiB cap.`);
}
// Screenshot dimensions (long side <= 1280, short side >= 480): parse them from
// the file headers instead of trusting the filename, so a wrong-sized shot is
// caught here. PNG reads the IHDR chunk; JPEG scans markers for a SOF frame.
function imageDimensions(path: string): [number, number] {
  const buf = readFileSync(path);
  if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
  }
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i += 1; continue; }
      const marker = buf[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)];
      }
      i += 2 + len;
    }
  }
  throw new Error(`Solmar Bay: cannot read dimensions of ${path} — not a PNG or JPEG.`);
}

const shotsDir = join(here, 'screenshots');
if (!existsSync(shotsDir)) {
  throw new Error('Solmar Bay: screenshots/ is missing — the entry needs 3 or 4 screenshots.');
}
const shots = readdirSync(shotsDir).filter((f) => !f.startsWith('.') && /\.(png|jpe?g)$/i.test(f)).sort();
if (shots.length < 3 || shots.length > 4) {
  throw new Error(`Solmar Bay: screenshots/ holds ${shots.length} images, the gate needs 3 or 4.`);
}
for (const shot of shots) {
  const size = statSync(join(shotsDir, shot)).size;
  if (size > 262144) {
    throw new Error(`Solmar Bay: screenshots/${shot} is ${size} bytes, over the 256 KiB cap.`);
  }
  const [w, h] = imageDimensions(join(shotsDir, shot));
  const longSide = Math.max(w, h);
  const shortSide = Math.min(w, h);
  if (longSide > 1280 || shortSide < 480) {
    throw new Error(`Solmar Bay: screenshots/${shot} is ${w}x${h}, outside the 1280 long / 480 short side caps.`);
  }
}

if (checkOnly) {
  console.log(`Solmar Bay checks pass: game/ ${gameFiles} files, ${gameBytes} bytes; index.html ${indexSize} bytes; screenshots: ${shots.join(', ')} (cover ${shots[0]}).`);
  process.exit(0);
}

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
const dossierOptions = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};
// A dossier must be reproducible: build it twice from the same copied files and
// hand in only a byte-identical pair, so a flaky summary can never reach the judge.
// buildDossier returns a Uint8Array, so compare the BYTES, not the objects —
// two arrays are never === even when every byte matches, and comparing the
// references would refuse every entry, including a good one.
const first = buildDossier(out, dossierOptions);
const second = buildDossier(out, dossierOptions);
const same = first.length === second.length && first.every((v, i) => v === second[i]);
if (!same) {
  throw new Error('Solmar Bay: dossier is not deterministic across two builds — refusing to hand in.');
}
// The dossier's own text cap: the judge refuses text over text_max_bytes, so
// fail here with the overage instead of handing in a refused entry.
const dossierText = JSON.parse(Buffer.from(first).toString('utf8')).text ?? '';
const dossierTextBytes = Buffer.byteLength(dossierText, 'utf8');
if (dossierTextBytes > dossierOptions.text_max_bytes) {
  throw new Error(`Solmar Bay: dossier text is ${dossierTextBytes} bytes, over the ${dossierOptions.text_max_bytes} cap by ${dossierTextBytes - dossierOptions.text_max_bytes}.`);
}
writeFileSync(join(out, 'dossier.json'), first);
console.log(`Solmar Bay handed in: game/ ${gameFiles} files (${gameBytes} bytes), ${shots.length} screenshots, dossier ${first.length} bytes (text ${dossierTextBytes} of ${dossierOptions.text_max_bytes} cap, deterministic across two builds).`);
