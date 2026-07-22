import { Category, ReceiptExtraction, RoutingHint } from './schema.js';

// 가맹점명/상품명 키워드 → 계정과목 룰 사전. Claude 추천을 교차 보정하는 용도.
const CATEGORY_RULES: { category: Category; keywords: string[] }[] = [
  { category: '복리후생비', keywords: ['식당', '카페', '커피', '베이커리', '분식', '치킨', '피자', '김밥', '스타벅스', '투썸', '이디야', '음료', '편의점', 'GS25', 'CU', '세븐일레븐', '배달', '도시락'] },
  { category: '여비교통비', keywords: ['택시', '카카오T', 'KTX', '코레일', 'SRT', '고속버스', '시외버스', '철도', '톨게이트', '하이패스', '지하철', '대중교통', '항공', '트립닷컴', '항공권', '렌터카'] },
  { category: '접대비', keywords: ['한정식', '일식', '횟집', '고깃집', '주점', '호프', '와인', '룸', '접대'] },
  { category: '통신비', keywords: ['우체국', '택배', '우편', 'CJ대한통운', '한진택배', '로젠', '화물', '퀵'] },
  { category: '지급수수료', keywords: ['등기', '법무사', '정부24', '대법원', '인지', '증명', '발급', '공증', '수수료'] },
  { category: '소모품비', keywords: ['다이소', '문구', '오피스', '알파', '건전지', '리모컨', '스토어', '마트', '전자', '철물', '생활용품', '비품'] },
];

const FUEL_KEYWORDS = ['주유소', '주유', '에너지', '칼텍스', 's-oil', '에쓰오일', 'sk엔', 'gs칼텍스', '현대오일뱅크', '오일뱅크', '충전소', '주유대'];
const PARKING_KEYWORDS = ['주차', '파킹', 'parking', '타워주차', '하이파킹', '주차장'];

function haystack(r: ReceiptExtraction): string {
  return `${r.merchant} ${r.items.join(' ')}`.toLowerCase();
}

/**
 * Claude 원시 추출 결과에 룰 사전을 적용해 라우팅/계정과목/confidence 를 보정한다.
 * - 주유소/주차장 → routing_hint = 'fuel', 계정과목 제외
 * - 룰 일치 & Claude 추천 일치 → confidence +0.1
 * - 룰 일치 & Claude 추천 없음 → 룰 값 채택, confidence ≥ 0.7
 * - 룰 일치 & Claude 추천 불일치 → confidence ≤ 0.6 (사용자 확인 유도)
 */
export function applyRules(raw: ReceiptExtraction): ReceiptExtraction {
  const hay = haystack(raw);

  const isFuel = FUEL_KEYWORDS.some((k) => hay.includes(k.toLowerCase()));
  const isParking = PARKING_KEYWORDS.some((k) => hay.includes(k.toLowerCase()));
  let routing: RoutingHint = raw.routing_hint;
  if (isFuel || isParking) routing = 'fuel';

  if (routing === 'fuel') {
    return {
      ...raw,
      routing_hint: 'fuel',
      account_suggestion: '',
      matched_keywords: [
        ...new Set([...raw.matched_keywords, ...(isFuel ? ['주유'] : []), ...(isParking ? ['주차'] : [])]),
      ],
    };
  }

  let ruleCat: Category | '' = '';
  const matched: string[] = [];
  for (const rule of CATEGORY_RULES) {
    const hits = rule.keywords.filter((k) => hay.includes(k.toLowerCase()));
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
    routing_hint: 'personal_expense',
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
