export type Category = '복리후생비' | '여비교통비' | '접대비' | '통신비' | '지급수수료' | '소모품비';

export const CATEGORIES: Category[] = ['복리후생비', '여비교통비', '접대비', '통신비', '지급수수료', '소모품비'];

export const CATEGORY_DESC: Record<Category, string> = {
  복리후생비: '식대·음료대',
  여비교통비: '교통비·톨비',
  접대비: '거래처 접대 등',
  통신비: '우편·택배·화물',
  지급수수료: '등기·행정·수수료',
  소모품비: '소모품 구입대',
};

export const CAT_COLOR: Record<Category, string> = {
  복리후생비: '#12B886',
  여비교통비: '#4DABF7',
  접대비: '#F76707',
  통신비: '#7048E8',
  지급수수료: '#F783AC',
  소모품비: '#868E96',
};

export const FUEL_RATE_PER_KM = 310;

export type Step = 'upload' | 'processing' | 'review' | 'preview' | 'done';
export type RoutingHint = 'personal_expense' | 'fuel';

export interface ReceiptExtraction {
  merchant: string;
  biz_no: string;
  datetime: string;
  card_type: string;
  card_no_masked: string;
  approval_no: string;
  items: string[];
  supply_amount: number;
  vat: number;
  total: number;
  payment_method: 'card' | 'cash' | 'unknown';
  routing_hint: RoutingHint;
  account_suggestion: Category | '';
  confidence: number;
  matched_keywords: string[];
}

// 검토·수정 화면에서 다루는 편집 가능한 항목 (추출값 + 사용자 입력)
export interface Row extends ReceiptExtraction {
  id: string;
  fileName: string;
  previewUrl?: string;
  status: 'processing' | 'done' | 'error';
  errorMsg?: string;
  // 개인경비 사용자 입력
  note: string; // 적요
  category: Category | '';
  remark: string; // 비고
  // 주유대 사용자 입력
  purpose: string;
  destination: string;
  distanceKm: number | null;
  toll: number;
  parking: number;
  etc: number;
  confirmed: boolean;
}

export interface Meta {
  dept: string;
  name: string;
  period: string;
}

export function confidenceBand(c: number): 'high' | 'mid' | 'low' {
  if (c >= 0.85) return 'high';
  if (c >= 0.6) return 'mid';
  return 'low';
}

export const CONF_LABEL: Record<'high' | 'mid' | 'low', string> = { high: '높음', mid: '보통', low: '낮음' };
export const CONF_COLOR: Record<'high' | 'mid' | 'low', string> = { high: '#12B886', mid: '#F59F00', low: '#FA5252' };

export function fuelAmount(r: Row): number {
  return Math.round((r.distanceKm ?? 0) * FUEL_RATE_PER_KM);
}
export function fuelSubtotal(r: Row): number {
  return fuelAmount(r) + (r.toll || 0) + (r.parking || 0) + (r.etc || 0);
}

export const won = (n: number) => '₩' + (n || 0).toLocaleString('ko-KR');
export const STEPS: { key: Step; label: string }[] = [
  { key: 'upload', label: '업로드' },
  { key: 'processing', label: '인식' },
  { key: 'review', label: '검토·수정' },
  { key: 'preview', label: '미리보기' },
  { key: 'done', label: '완료' },
];
