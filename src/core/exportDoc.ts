import type { DocRecord } from './types';

// ============ 在线文档导出门面：Word（.docx）+ PDF ============
// 重型库（docx / html2canvas / jspdf）动态加载，按需分包，不拖慢首屏。

function sanitize(name: string): string {
  return (name || '文档').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 80);
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function exportDocx(doc: DocRecord): Promise<void> {
  const { buildDocxBlob } = await import('./docxBuilder');
  const blob = await buildDocxBlob(doc);
  download(blob, `${sanitize(doc.title)}_v${doc.version}.docx`);
}

export async function exportPdfFromElement(el: HTMLElement, title: string, version: number): Promise<void> {
  const { buildPdfFromElement } = await import('./pdfBuilder');
  await buildPdfFromElement(el, `${sanitize(title)}_v${version}.pdf`);
}
