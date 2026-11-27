// ============ 在线文档 → PDF（html2canvas 渲染 A4 → jsPDF 分页拼接）============
// 由 exportDoc.ts 动态加载（按需分包，不拖慢首屏）

export async function buildPdfFromElement(el: HTMLElement, filename: string): Promise<void> {
  const [html2canvasMod, jspdfMod] = await Promise.all([import('html2canvas'), import('jspdf')]);
  const html2canvas = html2canvasMod.default;
  const { jsPDF } = jspdfMod;

  const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const imgW = canvas.width;
  const imgH = canvas.height;
  const pageW = 210;
  const pageH = 297;
  const margin = 10;
  const drawW = pageW - margin * 2; // 190mm
  const mmPerPx = drawW / imgW;
  const sliceHpx = Math.floor((pageH - margin * 2) / mmPerPx);
  let offset = 0;
  let first = true;
  while (offset < imgH) {
    const h = Math.min(sliceHpx, imgH - offset);
    const slice = document.createElement('canvas');
    slice.width = imgW;
    slice.height = h;
    slice.getContext('2d')!.drawImage(canvas, 0, offset, imgW, h, 0, 0, imgW, h);
    if (!first) pdf.addPage();
    pdf.addImage(slice.toDataURL('image/jpeg', 0.95), 'JPEG', margin, margin, drawW, h * mmPerPx);
    offset += h;
    first = false;
  }
  pdf.save(filename);
}
