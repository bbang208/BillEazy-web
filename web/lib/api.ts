import type { ReceiptExtraction } from './types';

// server(Railway) 호출. API 키는 server 에만 있으므로 프론트는 직접 호출한다.
const BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:8080';

export async function health() {
  const r = await fetch(`${BASE}/health`);
  return r.json();
}

export function fileToBase64(file: File): Promise<{ base64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      const base64 = result.split(',')[1] ?? '';
      resolve({ base64, mediaType: file.type || 'image/jpeg' });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function extractReceipt(file: File): Promise<ReceiptExtraction> {
  const { base64, mediaType } = await fileToBase64(file);
  const r = await fetch(`${BASE}/api/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: base64, mediaType }),
  });
  if (!r.ok) {
    const msg = (await r.json().catch(() => ({}))).error ?? '인식 실패';
    throw new Error(msg);
  }
  return r.json();
}

// 종류별로 회사 원본 양식(.xlsx)을 채워 내려받는다. (개인경비/주유대는 원래 별도 문서)
export async function exportDoc(kind: 'personal' | 'fuel', data: unknown): Promise<void> {
  const r = await fetch(`${BASE}/api/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, data }),
  });
  if (!r.ok) throw new Error('엑셀 생성 실패');
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = kind === 'fuel' ? '주유대청구양식.xlsx' : '개인경비청구서.xlsx';
  a.click();
  URL.revokeObjectURL(url);
}
