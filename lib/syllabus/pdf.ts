/** Read a syllabus PDF in the browser (nothing is uploaded) and rebuild its lines of text. */
export async function pdfToText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const lines: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    // Group text pieces that share a baseline into one line, left to right.
    const rows = new Map<number, { x: number; s: string }[]>();
    for (const it of content.items) {
      if (!("str" in it) || !it.str.trim()) continue;
      const y = Math.round(it.transform[5] / 3) * 3;
      const r = rows.get(y) ?? [];
      r.push({ x: it.transform[4], s: it.str });
      rows.set(y, r);
    }
    [...rows.entries()]
      .sort((a, b) => b[0] - a[0])
      .forEach(([, r]) => lines.push(r.sort((a, b) => a.x - b.x).map((p) => p.s).join(" ").replace(/\s{2,}/g, " ").trim()));
  }
  return lines.join("\n");
}
