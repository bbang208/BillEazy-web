// 날짜 표기 통일 유틸(web/lib/date.ts 와 동일 규칙 — 두 곳의 표기를 반드시 맞춘다).
// 저장(내부)은 ISO 'YYYY-MM-DD', 화면/엑셀 표기는 한국형 순서 'YYYY/MM/DD' 로 통일한다.
// AI 추출값·사용자 입력은 2026-06-15 / 2026.6.15 / 06/15/2026 / 26/6/15 / 2026년 6월 15일 등
// 다양한 형태로 들어오므로 순서를 판별해 정규화한다.

const KOREAN = /(\d{2,4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/;
const NUMERIC = /(\d{1,4})\s*[./\-,]\s*(\d{1,2})\s*[./\-,]\s*(\d{1,4})/;
const TIME = /(\d{1,2}):(\d{2})/;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function expandYear(y: number): number {
  return y < 100 ? 2000 + y : y;
}

function valid(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function iso(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** 어떤 표기의 날짜든 내부 표준 'YYYY-MM-DD' 로. 해석 불가면 ''. */
export function normalizeDate(input: string | null | undefined): string {
  const s = (input || '').trim();
  if (!s) return '';

  const k = KOREAN.exec(s);
  if (k) {
    const y = expandYear(Number(k[1])), m = Number(k[2]), d = Number(k[3]);
    return valid(y, m, d) ? iso(y, m, d) : '';
  }

  const n = NUMERIC.exec(s);
  if (n) {
    const a = Number(n[1]), b = Number(n[2]), c = Number(n[3]);
    // 연도가 앞: 2026-06-15 / 26.6.15
    if (n[1].length >= 3 || (n[3].length <= 2 && valid(expandYear(a), b, c))) {
      const y = expandYear(a);
      if (valid(y, b, c)) return iso(y, b, c);
    }
    // 연도가 뒤: 06/15/2026(월·일) 또는 15/06/2026(일·월)
    const y = expandYear(c);
    if (valid(y, a, b)) return iso(y, a, b); // m/d/y
    if (valid(y, b, a)) return iso(y, b, a); // d/m/y
    return '';
  }

  // 구분자 없는 8자리: 20260615
  const c8 = /(\d{8})/.exec(s.replace(/\s/g, ''));
  if (c8) {
    const y = Number(c8[1].slice(0, 4)), m = Number(c8[1].slice(4, 6)), d = Number(c8[1].slice(6, 8));
    if (valid(y, m, d)) return iso(y, m, d);
  }
  return '';
}

/** 화면·문서 표기용 'YYYY/MM/DD'. 해석 불가면 원문을 그대로 돌려준다. */
export function formatDate(input: string | null | undefined): string {
  const s = normalizeDate(input);
  return s ? s.replace(/-/g, '/') : (input || '').trim();
}

/** 'YYYY/MM/DD HH:mm' (시각이 없으면 날짜만). */
export function formatDateTime(input: string | null | undefined): string {
  const date = normalizeDate(input);
  if (!date) return (input || '').trim();
  const t = TIME.exec(String(input));
  const time = t ? ` ${pad(Number(t[1]))}:${t[2]}` : '';
  return date.replace(/-/g, '/') + time;
}

/** 내부 저장용 'YYYY-MM-DD' 또는 'YYYY-MM-DDTHH:mm(:ss)'. 해석 불가면 ''. */
export function normalizeDateTime(input: string | null | undefined): string {
  const date = normalizeDate(input);
  if (!date) return '';
  const t = /(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(String(input));
  return t ? `${date}T${pad(Number(t[1]))}:${t[2]}${t[3] ? ':' + t[3] : ''}` : date;
}

/** 오늘(로컬) 'YYYY-MM-DD'. */
export function todayISO(): string {
  const d = new Date();
  return iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/** "2026-06-01 ~ 2026-06-30" 처럼 날짜가 섞인 자유 문자열의 날짜 부분만 표기 통일. */
export function formatPeriod(input: string | null | undefined): string {
  const s = (input || '').trim();
  if (!s) return '';
  return s.replace(/\d{2,4}\s*[./\-,]\s*\d{1,2}\s*[./\-,]\s*\d{1,4}|\d{2,4}\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일/g, (m) => {
    const norm = normalizeDate(m);
    return norm ? norm.replace(/-/g, '/') : m;
  });
}
