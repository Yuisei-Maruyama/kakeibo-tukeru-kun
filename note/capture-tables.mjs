/**
 * note/note.md 内のMarkdownテーブルを自動抽出し、
 * note/img/table/ にスクリーンショットとして保存するスクリプト。
 *
 * 実行するたびに note/img/table/ の中身を全削除してから再生成する。
 *
 * Usage: node note/capture-tables.mjs
 */

import puppeteer from "puppeteer";
import { readFile, rm, mkdir } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const NOTE_PATH = join(__dirname, "note.md");
const IMG_DIR = join(__dirname, "img", "table");

// --- 1. note.md からテーブルを抽出 ---

function extractTables(markdown) {
  const lines = markdown.split("\n");
  const tables = [];
  let current = null;
  let tableIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isTableRow = /^\|.*\|$/.test(line.trim());

    if (isTableRow) {
      if (!current) {
        // テーブル開始: 直前の見出しを探す
        let heading = "";
        for (let j = i - 1; j >= 0; j--) {
          const prev = lines[j].trim();
          if (prev === "") continue;
          if (prev.startsWith("#")) {
            heading = prev.replace(/^#+\s*/, "");
            break;
          }
          break;
        }
        tableIndex++;
        current = {
          name: `${String(tableIndex).padStart(2, "0")}_table`,
          heading,
          lines: [],
        };
      }
      current.lines.push(line);
    } else {
      if (current) {
        tables.push(current);
        current = null;
      }
    }
  }
  if (current) tables.push(current);

  return tables;
}

// --- 2. Markdownテーブル → HTML変換 ---

function mdTableToHtml(mdLines) {
  const rows = mdLines
    .map((line) =>
      line
        .split("|")
        .filter((c) => c.trim() !== "")
        .map((c) => c.trim())
    )
    .filter((row) => !row.every((cell) => /^[-:]+$/.test(cell))); // セパレータ行を除外

  if (rows.length === 0) return "";

  const [headers, ...bodyRows] = rows;

  let html = "<table><thead><tr>";
  for (const h of headers) html += `<th>${formatCell(h)}</th>`;
  html += "</tr></thead><tbody>";
  for (const row of bodyRows) {
    html += "<tr>";
    for (const cell of row) html += `<td>${formatCell(cell)}</td>`;
    html += "</tr>";
  }
  html += "</tbody></table>";
  return html;
}

function formatCell(text) {
  // **bold** → <strong>
  return text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

function wrapHtml(tableHtml) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  body {
    margin: 0; padding: 16px; background: white;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 15px; color: #1a1a1a;
  }
  table { border-collapse: collapse; width: auto; }
  th, td { border: 1px solid #d0d7de; padding: 8px 16px; text-align: left; white-space: nowrap; }
  th { background: #f6f8fa; font-weight: 600; }
  tr:nth-child(even) { background: #f9fafb; }
</style>
</head><body>${tableHtml}</body></html>`;
}

// --- 3. メイン処理 ---

async function main() {
  // note.md を読み込み
  const markdown = await readFile(NOTE_PATH, "utf-8");
  const tables = extractTables(markdown);

  if (tables.length === 0) {
    console.log("テーブルが見つかりませんでした。");
    return;
  }

  console.log(`${tables.length} 個のテーブルを検出`);

  // img/table/ を全削除して再作成
  await rm(IMG_DIR, { recursive: true, force: true });
  await mkdir(IMG_DIR, { recursive: true });
  console.log("note/img/table/ をクリアしました");

  // Puppeteer でスクリーンショット生成
  const browser = await puppeteer.launch({ headless: true });

  for (const table of tables) {
    const page = await browser.newPage();
    const html = wrapHtml(mdTableToHtml(table.lines));
    await page.setContent(html, { waitUntil: "networkidle0" });

    const tableEl = await page.$("table");
    const box = await tableEl.boundingBox();
    const width = Math.ceil(box.width) + 32;
    const height = Math.ceil(box.height) + 32;

    await page.setViewport({ width, height, deviceScaleFactor: 2 });
    await page.screenshot({
      path: join(IMG_DIR, `${table.name}.png`),
      clip: { x: 0, y: 0, width, height },
    });

    console.log(`✅ ${table.name}.png (${table.heading || "見出しなし"})`);
    await page.close();
  }

  await browser.close();
  console.log(`\n完了: ${tables.length} 枚の画像を note/img/table/ に生成しました`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
