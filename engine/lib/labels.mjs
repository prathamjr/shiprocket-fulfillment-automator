// The ONLY place that downloads shipping labels.
//
// Shiprocket's label endpoint silently drops labels on big batches: one day
// 143 orders were booked and only 17 labels came back, with "label_created:
// true" and no error. So labels are requested 20 at a time, every PDF's pages
// are counted against what was asked for, short batches are retried, and the
// run reports "verified X/Y". A mismatch is never reported as success.
import fs from "node:fs";
import path from "node:path";
import { PDFDocument } from "pdf-lib";

const BATCH = 20;
const MAX_TRIES = 3;

export function countPdfPages(buf) {
  const m = buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g);
  return m ? m.length : 0;
}

export async function downloadVerifiedLabels({ api, srBaseUrl, targetDir, fileBaseName, shipmentIds }) {
  fs.mkdirSync(targetDir, { recursive: true });
  const file = path.join(targetDir, `${fileBaseName}.pdf`);

  async function fetchBatch(chunk) {
    const data = await api("POST", `${srBaseUrl}/v1/external/courier/generate/label`, { shipment_id: chunk });
    if (!data.label_created || !data.label_url) throw new Error(`Label generation failed: ${JSON.stringify(data.response ?? data).slice(0, 300)}`);
    const pdf = await fetch(data.label_url);
    if (!pdf.ok) throw new Error(`Label download failed: HTTP ${pdf.status}`);
    return Buffer.from(await pdf.arrayBuffer());
  }

  const merged = await PDFDocument.create();
  const short = [];
  for (let i = 0; i < shipmentIds.length; i += BATCH) {
    const chunk = shipmentIds.slice(i, i + BATCH);
    let buf, pages = 0;
    for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
      buf = await fetchBatch(chunk);
      pages = countPdfPages(buf);
      if (pages === chunk.length) break;
      if (attempt < MAX_TRIES) await new Promise((r) => setTimeout(r, attempt * 2000));
    }
    if (pages !== chunk.length) short.push({ from: i, asked: chunk.length, got: pages });
    const src = await PDFDocument.load(buf);
    for (const p of await merged.copyPages(src, src.getPageIndices())) merged.addPage(p);
  }
  fs.writeFileSync(file, await merged.save());

  const finalPages = merged.getPageCount();
  if (finalPages !== shipmentIds.length || short.length) {
    throw Object.assign(
      new Error(`Label count mismatch for ${fileBaseName}: asked ${shipmentIds.length}, got ${finalPages}. File saved, CHECK IT before printing.`),
      { file, pages: finalPages, expected: shipmentIds.length },
    );
  }
  return { file, pages: finalPages, expected: shipmentIds.length };
}
