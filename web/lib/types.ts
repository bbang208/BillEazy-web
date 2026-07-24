// 네이버 지도로 선택한 장소(출발지/목적지). 좌표는 WGS84 경도/위도.
export interface Place {
  name: string;
  roadAddress: string;
  address: string;
  lng: number;
  lat: number;
}

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

// 업로드 허용 형식 — Claude 가 직접 읽을 수 있는 것만. (HEIC 등은 변환 필요)
export const ACCEPTED_MIME = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
export const ACCEPT_ATTR = 'image/jpeg,image/png,image/webp,image/gif,application/pdf,.pdf';
export const ACCEPT_LABEL = 'JPG · PNG · WEBP · PDF';
export const MAX_FILE_BYTES = 24 * 1024 * 1024; // Claude 요청 32MB 제한(base64 팽창분 감안)

/** 업로드할 수 없는 파일이면 사용자에게 보여줄 이유, 괜찮으면 null. */
export function rejectReason(file: File): string | null {
  const type = (file.type || '').toLowerCase();
  const isPdfName = /\.pdf$/i.test(file.name);
  if (!ACCEPTED_MIME.includes(type) && !isPdfName) {
    const ext = file.name.split('.').pop()?.toUpperCase() || '알 수 없는 형식';
    return `${ext} 는 지원하지 않아요. ${ACCEPT_LABEL} 로 올려주세요.`;
  }
  if (file.size > MAX_FILE_BYTES) {
    return `파일이 너무 커요(${Math.round(file.size / 1024 / 1024)}MB). 24MB 이하로 올려주세요.`;
  }
  return null;
}

export type Step = 'upload' | 'processing' | 'review' | 'preview' | 'done';
export type RoutingHint = 'personal_expense' | 'fuel';

// 항목이 들어가는 문서(탭). routing_hint 의 UI 표현.
export type Bucket = 'personal' | 'fuel';
export const BUCKETS: Bucket[] = ['personal', 'fuel'];
export const BUCKET_LABEL: Record<Bucket, string> = { personal: '개인경비', fuel: '주유대' };
export const BUCKET_COLOR: Record<Bucket, string> = { personal: '#868E96', fuel: '#4DABF7' };
export const otherBucket = (b: Bucket): Bucket => (b === 'personal' ? 'fuel' : 'personal');

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
  previewUrl?: string; // 화면·별지에 쓸 이미지 (PDF 는 첫 페이지를 PNG 로 렌더링한 것)
  fileUrl?: string; // 원본 파일 blob URL (PDF 원본 열기용)
  fileType: string; // MIME
  pageCount: number; // PDF 페이지 수 (이미지는 0)
  status: 'processing' | 'done' | 'error';
  errorMsg?: string;
  retryable?: boolean; // 일시적 오류라 다시 시도해볼 만한지
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
  // 네이버 지도로 선택한 출발지·목적지(좌표 포함). destination 문자열은 dest.name 과 동기화.
  origin?: Place;
  dest?: Place;
  routeSig?: string; // 마지막으로 거리를 계산한 origin|dest 좌표 키(중복 호출 방지)
  distanceAuto?: boolean; // 거리를 경로에서 자동으로 채웠는지
  confirmed: boolean;
  // 분류(개인경비/주유대)를 누가 정했는지. 'user' = 사용자가 수동으로 바꾼 항목.
  routedBy: 'ai' | 'user';
  // 주유대로 옮기면서 인식 금액을 주차료에 자동으로 채웠는지 (되돌릴 때 다시 비우기 위함)
  parkingAuto: boolean;
}

export const bucketOf = (r: Row): Bucket => (r.routing_hint === 'fuel' ? 'fuel' : 'personal');
export const isPdfRow = (r: Row): boolean => r.fileType === 'application/pdf';

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
