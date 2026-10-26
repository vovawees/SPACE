/* После сборки: рядом с каждым текстовым файлом в dist кладём .br и .gz,
   сервер отдаёт их без сжатия на лету. */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const dist = path.resolve("dist");
const TEXT = /\.(js|mjs|css|html|svg|json|txt|xml|wasm|webmanifest)$/;
let count = 0;
let before = 0;
let after = 0;

function walk(dir: string) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (TEXT.test(entry.name)) {
      const data = fs.readFileSync(p);
      if (data.length < 1024) continue;
      const br = zlib.brotliCompressSync(data, {
        params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: data.length },
      });
      fs.writeFileSync(p + ".br", br);
      fs.writeFileSync(p + ".gz", zlib.gzipSync(data, { level: 9 }));
      count++;
      before += data.length;
      after += br.length;
    }
  }
}

if (!fs.existsSync(dist)) {
  console.error("Нет папки dist — сначала vite build");
  process.exit(1);
}
walk(dist);
console.log(`precompress: ${count} файлов, ${(before / 1024).toFixed(0)} КБ → ${(after / 1024).toFixed(0)} КБ (brotli)`);
