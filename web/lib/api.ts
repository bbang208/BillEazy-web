import type { Place, ReceiptExtraction } from './types';

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

/** 서버가 내려준 사용자용 문구 + 재시도 가능 여부. */
export class ExtractError extends Error {
  retryable: boolean;
  code?: string;
  constructor(message: string, retryable: boolean, code?: string) {
    super(message);
    this.name = 'ExtractError';
    this.retryable = retryable;
    this.code = code;
  }
}

export async function extractReceipt(file: File): Promise<ReceiptExtraction> {
  const { base64, mediaType } = await fileToBase64(file);
  const r = await fetch(`${BASE}/api/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: base64, mediaType }),
  });
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as { error?: string; code?: string; retryable?: boolean };
    throw new ExtractError(body.error ?? '인식에 실패했어요. 다시 시도해 주세요.', body.retryable ?? r.status >= 500, body.code);
  }
  return r.json();
}

// 서버가 Content-Disposition 으로 내려준 파일명(뉴로랩 {작성자} … YY MM DD.xlsx)을 그대로 쓴다.
function filenameFrom(header: string | null, kind: 'personal' | 'fuel'): string {
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header || '');
  if (star) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch {
      /* 잘못 인코딩된 헤더면 아래 기본값 */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header || '');
  if (plain) return plain[1];
  return kind === 'fuel' ? '주유대 청구.xlsx' : '개인경비 청구.xlsx';
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
  a.download = filenameFrom(r.headers.get('Content-Disposition'), kind);
  a.click();
  URL.revokeObjectURL(url);
}

// ── 네이버 지도 ──

/** 키워드로 장소(POI) 검색. 실패 시 빈 배열(입력 중 흔한 오류라 조용히 처리). */
export async function searchPlaces(query: string, signal?: AbortSignal): Promise<Place[]> {
  const q = query.trim();
  if (!q) return [];
  try {
    const r = await fetch(`${BASE}/api/places?query=${encodeURIComponent(q)}`, { signal });
    if (!r.ok) return [];
    const d = (await r.json()) as { places?: Place[] };
    return d.places ?? [];
  } catch {
    return []; // AbortError 포함
  }
}

export interface RouteInfo {
  distanceKm: number;
  distanceM: number;
  tollFare: number;
  fuelPrice: number;
  durationMin: number;
}

/** 출발지·목적지 좌표 → 주행 거리/톨비. 경로 실패 시 서버 문구로 throw. */
export async function routeDistance(start: Place, goal: Place): Promise<RouteInfo> {
  const s = `${start.lng},${start.lat}`;
  const g = `${goal.lng},${goal.lat}`;
  const r = await fetch(`${BASE}/api/route?start=${encodeURIComponent(s)}&goal=${encodeURIComponent(g)}`);
  if (!r.ok) {
    const b = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(b.error ?? '경로를 조회하지 못했어요.');
  }
  return r.json();
}
