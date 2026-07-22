import Anthropic from '@anthropic-ai/sdk';
import { RECEIPT_JSON_SCHEMA, ReceiptExtraction } from './schema.js';
import { applyRules } from './categories.js';

// ANTHROPIC_API_KEY 를 환경변수에서 자동으로 읽음.
const client = new Anthropic();

const MODEL = 'claude-sonnet-5';

export type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

const PROMPT = `이 이미지는 한국 카드매출전표(영수증)입니다. 필드를 정확히 읽어 JSON 스키마에 맞춰 답하세요.
- merchant: 가맹점/판매자 상호
- biz_no: 사업자등록번호(없으면 "")
- datetime: 거래일시 (YYYY-MM-DD 또는 ISO8601, 없으면 "")
- total: 합계금액(부가세 포함) 숫자. supply_amount/vat 도 보이면 채우고 없으면 0.
- items: 상품명 배열
- routing_hint: 항상 "personal_expense" (영수증은 모두 개인경비. 주유대는 사용자가 직접 추가하므로 여기서 판단하지 않음)
- account_suggestion: 6개 계정과목 중 가장 적절한 것.
    복리후생비=식대·음료 / 여비교통비=교통·톨·주차·주유(법인차량 주유) / 접대비=거래처 접대 /
    통신비=우편·택배·화물 / 지급수수료=등기·행정·수수료 / 소모품비=소모품 구입.
- confidence: 계정과목 확신도 0~1
- matched_keywords: 판단 근거가 된 키워드
- 읽을 수 없는 텍스트 필드는 "", 숫자는 0.`;

/**
 * 영수증 이미지(base64) → 구조화 추출 + 계정과목 룰 보정.
 * API 키는 이 서버에서만 사용된다.
 */
export async function extractReceipt(
  base64: string,
  mediaType: ImageMediaType = 'image/jpeg',
): Promise<ReceiptExtraction> {
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    // 추출 태스크는 결정적으로: 사고 비활성 + 낮은 effort
    thinking: { type: 'disabled' },
    output_config: {
      format: { type: 'json_schema', schema: RECEIPT_JSON_SCHEMA },
      effort: 'low',
    },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: PROMPT },
        ],
      },
    ],
    // output_config / thinking 필드는 SDK 버전에 따라 타입이 없을 수 있어 캐스팅.
  } as unknown as Anthropic.MessageCreateParamsNonStreaming);

  const textBlock = resp.content.find((b) => b.type === 'text') as { text?: string } | undefined;
  const raw = JSON.parse(textBlock?.text ?? '{}') as ReceiptExtraction;
  return applyRules(raw);
}
