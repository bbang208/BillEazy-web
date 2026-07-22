import type { ReceiptExtraction } from './schema.js';

// 크레딧 없이 UI 전체 플로우를 테스트하기 위한 샘플 영수증들.
// 다양한 계정과목 + 주유대 라우팅 + 낮은 confidence(확인 필요) 케이스 포함. 라운드로빈으로 반환.
const SAMPLES: ReceiptExtraction[] = [
  {
    merchant: '지에이치스토어', biz_no: '354-40-00029', datetime: '2026-06-29T13:27:15',
    card_type: '현대카드', card_no_masked: '****221*', approval_no: '00124265',
    items: ['이노스(INNOS) TV리모컨+알카라인건전지'], supply_amount: 13636, vat: 1364, total: 15000,
    payment_method: 'card', routing_hint: 'personal_expense', account_suggestion: '소모품비',
    confidence: 0.92, matched_keywords: ['건전지', '리모컨', '스토어'],
  },
  {
    merchant: '트립닷컴(구 NICE정보통신)', biz_no: '220-81-15770', datetime: '2026-06-16T05:32:29',
    card_type: '현대카드', card_no_masked: '****221*', approval_no: '00334563',
    items: ['출장 항공권'], supply_amount: 0, vat: 0, total: 42900,
    payment_method: 'card', routing_hint: 'personal_expense', account_suggestion: '여비교통비',
    confidence: 0.72, matched_keywords: ['항공'],
  },
  {
    merchant: '스타벅스 선릉역점', biz_no: '123-81-00456', datetime: '2026-06-20T09:14:02',
    card_type: '신한카드', card_no_masked: '****1234', approval_no: '30021456',
    items: ['아메리카노 외 2건'], supply_amount: 5909, vat: 591, total: 6500,
    payment_method: 'card', routing_hint: 'personal_expense', account_suggestion: '복리후생비',
    confidence: 0.9, matched_keywords: ['스타벅스', '커피'],
  },
  {
    merchant: '하이파킹 역삼점', biz_no: '211-88-77123', datetime: '2026-06-15T18:03:00',
    card_type: '신한카드', card_no_masked: '****1234', approval_no: '55120983',
    items: ['주차요금'], supply_amount: 0, vat: 0, total: 4000,
    payment_method: 'card', routing_hint: 'fuel', account_suggestion: '',
    confidence: 0.95, matched_keywords: ['주차'],
  },
  {
    merchant: '우체국 강남지점', biz_no: '104-83-00021', datetime: '2026-06-05T11:22:41',
    card_type: '신한카드', card_no_masked: '****1234', approval_no: '77340221',
    items: ['등기우편 발송'], supply_amount: 3000, vat: 300, total: 3300,
    payment_method: 'card', routing_hint: 'personal_expense', account_suggestion: '통신비',
    confidence: 0.86, matched_keywords: ['우체국', '우편'],
  },
  {
    // 낮은 confidence — 검토 화면에서 "확인 필요"로 하이라이트되는 케이스
    merchant: '알파문구 서초점', biz_no: '119-90-33210', datetime: '2026-06-11T15:40:12',
    card_type: '국민카드', card_no_masked: '****5678', approval_no: '11902345',
    items: ['A4용지, 볼펜 세트'], supply_amount: 11636, vat: 1164, total: 12800,
    payment_method: 'card', routing_hint: 'personal_expense', account_suggestion: '',
    confidence: 0.45, matched_keywords: [],
  },
];

let idx = 0;

/** 실제 API 대신 샘플을 반환(라운드로빈 + 인식 지연 시뮬레이션). */
export async function mockExtract(): Promise<ReceiptExtraction> {
  await new Promise((r) => setTimeout(r, 500 + Math.random() * 500));
  const sample = SAMPLES[idx % SAMPLES.length];
  idx += 1;
  return { ...sample };
}
