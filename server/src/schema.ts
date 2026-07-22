// 계정과목 6종 (고정 enum — 자유입력 금지, SUMIF 집계 무결성 보장)
export const CATEGORIES = [
  '복리후생비',
  '여비교통비',
  '접대비',
  '통신비',
  '지급수수료',
  '소모품비',
] as const;
export type Category = (typeof CATEGORIES)[number];

// 계정과목별 설명 (UI 툴팁 / 프롬프트 참고용)
export const CATEGORY_DESC: Record<Category, string> = {
  복리후생비: '식대, 음료대',
  여비교통비: '교통비, 톨비',
  접대비: '거래처 접대 등',
  통신비: '우편요금, 택배비, 화물운반비',
  지급수수료: '등기발급수수료 및 행정업무 제반비용 등',
  소모품비: '소모품 구입대',
};

export type RoutingHint = 'personal_expense' | 'fuel';

// Claude 가 반환하는 영수증 추출 결과
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

// Claude structured output (output_config.format) 용 JSON 스키마.
// 구조화 출력 제약: 모든 property 를 required 로, additionalProperties:false.
// 모르는 텍스트는 "", 숫자는 0 으로 채우도록 프롬프트로 유도.
export const RECEIPT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    merchant: { type: 'string', description: '가맹점/판매자 상호' },
    biz_no: { type: 'string', description: '사업자등록번호, 없으면 ""' },
    datetime: { type: 'string', description: '거래일시 YYYY-MM-DD 또는 ISO8601, 없으면 ""' },
    card_type: { type: 'string', description: '카드 종류/발급사, 없으면 ""' },
    card_no_masked: { type: 'string', description: '마스킹된 카드번호, 없으면 ""' },
    approval_no: { type: 'string', description: '승인번호, 없으면 ""' },
    items: { type: 'array', items: { type: 'string' }, description: '상품명 목록' },
    supply_amount: { type: 'number', description: '과세(공급)금액, 모르면 0' },
    vat: { type: 'number', description: '부가세, 모르면 0' },
    total: { type: 'number', description: '합계금액(부가세 포함), 모르면 0' },
    payment_method: { type: 'string', enum: ['card', 'cash', 'unknown'] },
    routing_hint: {
      type: 'string',
      enum: ['personal_expense', 'fuel'],
      description: '주유소/주차장 영수증이면 fuel, 그 외 personal_expense',
    },
    account_suggestion: {
      type: 'string',
      enum: [...CATEGORIES, ''],
      description: '6개 계정과목 중 가장 적절한 것. fuel 이면 "".',
    },
    confidence: { type: 'number', description: '계정과목 확신도 0~1' },
    matched_keywords: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'merchant', 'biz_no', 'datetime', 'card_type', 'card_no_masked', 'approval_no',
    'items', 'supply_amount', 'vat', 'total', 'payment_method',
    'routing_hint', 'account_suggestion', 'confidence', 'matched_keywords',
  ],
} as const;

// 주유대 마일리지 단가 (원/km)
export const FUEL_RATE_PER_KM = 310;
