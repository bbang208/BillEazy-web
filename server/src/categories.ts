import { Category, ReceiptExtraction } from './schema.js';

// 가맹점명/상품명 키워드 → 계정과목 룰 사전.
// 주유(법인차량 주유)·주차·톨게이트는 모두 여비교통비(개인경비)로 분류한다.
// 주유대(개인 자차로 출장지 이동하는 마일리지 청구)는 영수증으로 판단하지 않고, 사용자가 직접 추가한다.
const CATEGORY_RULES: { category: Category; keywords: string[] }[] = [
  { category: '복리후생비', keywords: ['식당', '카페', '커피', '베이커리', '분식', '치킨', '피자', '김밥', '스타벅스', '투썸', '이디야', '음료', '편의점', 'gs25', 'cu', '세븐일레븐', '배달', '도시락'] },
  {
    category: '여비교통비',
    keywords: [
      '택시', '카카오t', 'ktx', '코레일', 'srt', '고속버스', '시외버스', '철도', '지하철', '대중교통', '항공', '트립닷컴', '항공권', '렌터카',
      // 법인차량 주유
      '주유', '주유소', '에너지', '칼텍스', 's-oil', '에쓰오일', '오일뱅크', '현대오일뱅크', 'sk에너지', 'gs칼텍스', '충전소', '휘발유', '경유',
      // 주차 / 통행료
      '주차', '주차장', '파킹', 'parking', '하이파킹', '타워주차', '톨게이트', '하이패스', '통행료',
    ],
  },
  { category: '접대비', keywords: ['한정식', '일식', '횟집', '고깃집', '주점', '호프', '와인', '룸', '접대'] },
  { category: '통신비', keywords: ['우체국', '택배', '우편', 'cj대한통운', '한진택배', '로젠', '화물', '퀵'] },
  { category: '지급수수료', keywords: ['등기', '법무사', '정부24', '대법원', '인지', '증명', '발급', '공증', '수수료'] },
  { category: '소모품비', keywords: ['다이소', '문구', '오피스', '알파', '건전지', '리모컨', '스토어', '마트', '전자', '철물', '생활용품', '비품'] },
];

function haystack(r: ReceiptExtraction): string {
  return `${r.merchant} ${r.items.join(' ')}`.toLowerCase();
}

/**
 * 영수증은 모두 개인경비로 처리한다. 룰 사전으로 계정과목/confidence 를 보정.
 * (주유대는 영수증 라우팅 대상이 아니며 사용자가 검토 화면에서 직접 추가한다.)
 */
export function applyRules(raw: ReceiptExtraction): ReceiptExtraction {
  const hay = haystack(raw);

  let ruleCat: Category | '' = '';
  const matched: string[] = [];
  for (const rule of CATEGORY_RULES) {
    const hits = rule.keywords.filter((k) => hay.includes(k));
    if (hits.length) {
      ruleCat = rule.category;
      matched.push(...hits);
      break;
    }
  }

  let category: Category | '' = raw.account_suggestion;
  let confidence = clamp01(raw.confidence);
  if (ruleCat && ruleCat === raw.account_suggestion) {
    confidence = clamp01(confidence + 0.1);
  } else if (ruleCat && !raw.account_suggestion) {
    category = ruleCat;
    confidence = Math.max(confidence, 0.7);
  } else if (ruleCat && ruleCat !== raw.account_suggestion) {
    confidence = Math.min(confidence, 0.6);
  }

  return {
    ...raw,
    routing_hint: 'personal_expense', // 영수증은 항상 개인경비
    account_suggestion: category,
    confidence,
    matched_keywords: [...new Set([...raw.matched_keywords, ...matched])],
  };
}

export function confidenceBand(c: number): 'high' | 'mid' | 'low' {
  if (c >= 0.85) return 'high';
  if (c >= 0.6) return 'mid';
  return 'low';
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
