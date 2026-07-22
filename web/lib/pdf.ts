'use client';

// PDF 는 브라우저에서 <img> 로 그릴 수 없고, 엑셀 별지도 png/jpeg/gif 만 임베드할 수 있다.
// 그래서 첫 페이지를 PNG 로 렌더링해 미리보기·별지 첨부에 함께 쓴다.
// (인식용으로는 원본 PDF 를 그대로 서버에 보낸다 — Claude 는 PDF 를 문서로 직접 읽는다.)

type PdfJs = typeof import('pdfjs-dist');

let pdfjsPromise: Promise<PdfJs> | null = null;

function loadPdfjs(): Promise<PdfJs> {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then((m) => {
      m.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url,
      ).toString();
      return m;
    });
  }
  return pdfjsPromise;
}

export function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

export interface PdfPreview {
  dataUrl: string; // image/png
  pageCount: number;
}

/** PDF 첫 페이지 → PNG 데이터 URL. 실패하면 예외를 던진다(호출부에서 인식은 계속 진행). */
export async function renderPdfFirstPage(file: File, targetWidth = 1000): Promise<PdfPreview> {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({ data });
  const doc = await task.promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(3, Math.max(1, targetWidth / base.width));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d context 를 만들 수 없습니다.');
    // PDF 는 배경이 투명일 수 있어 흰 배경을 깔아준다(엑셀에서 검게 보이는 것 방지)
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport } as Parameters<typeof page.render>[0]).promise;
    return { dataUrl: canvas.toDataURL('image/png'), pageCount: doc.numPages };
  } finally {
    void task.destroy(); // 워커 메모리 해제
  }
}
