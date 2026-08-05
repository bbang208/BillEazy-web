import Anthropic from '@anthropic-ai/sdk';
import { RECEIPTS_JSON_SCHEMA, ReceiptExtraction } from './schema.js';
import { applyRules } from './categories.js';
import { normalizeDateTime } from './date.js';
import { recordLocalUsage } from './usage.js';

// ANTHROPIC_API_KEY 를 환경변수에서 자동으로 읽음.
// 529(overloaded)·429·5xx 는 SDK 가 지수 백오프로 자동 재시도한다(기본 2회 → 3회).
// 더 긴 간격의 재시도는 웹 쪽에서 한 번 더 감싼다. 합쳐서 최대 8회, 약 20초.
const client = new Anthropic({ maxRetries: 3 });

export interface ExtractFailure {
  status: number; // 클라이언트에 내려줄 HTTP 상태
  code: string;
  message: string; // 사용자에게 그대로 보여줄 한국어 문구
  retryable: boolean;
  detail?: string; // 서버 로그용 원문
}

/** Anthropic/네트워크 오류를 사용자 문구로 번역한다. 원문 JSON 을 UI 로 흘리지 않기 위함. */
export function describeError(e: unknown): ExtractFailure {
  const err = e as { status?: number; message?: string; error?: { error?: { type?: string; message?: string } } };
  const detail = err?.message ?? String(e);
  const status = typeof err?.status === 'number' ? err.status : 0;
  const type = err?.error?.error?.type ?? '';
  const body = err?.error?.error?.message ?? '';

  if (status === 529 || type === 'overloaded_error') {
    return { status: 503, code: 'overloaded', retryable: true, detail, message: 'AI 서버가 잠시 붐벼요. 몇 초 뒤 다시 시도해 주세요.' };
  }
  if (status === 429 || type === 'rate_limit_error') {
    return { status: 429, code: 'rate_limit', retryable: true, detail, message: '요청이 한꺼번에 몰렸어요. 잠시 후 다시 시도해 주세요.' };
  }
  if (/credit balance|insufficient/i.test(body)) {
    return { status: 402, code: 'no_credit', retryable: false, detail, message: 'Claude API 크레딧이 부족해요. 콘솔에서 충전 후 다시 시도해 주세요.' };
  }
  if (status === 401 || status === 403) {
    return { status: 502, code: 'auth', retryable: false, detail, message: 'AI 서버 인증에 실패했어요. 관리자에게 문의해 주세요.' };
  }
  if (status === 413 || status === 400) {
    return { status: 400, code: 'bad_file', retryable: false, detail, message: '이 파일은 AI가 읽을 수 없어요. 용량을 줄이거나 사진으로 다시 올려주세요.' };
  }
  // 응답이 max_tokens 로 잘린 경우: 다시 보내도 같은 결과라 재시도 대상에서 뺀다.
  if ((e as { code?: string })?.code === 'too_many_receipts') {
    return { status: 413, code: 'too_many_receipts', retryable: false, detail, message: '한 파일에 영수증이 너무 많아 다 읽지 못했어요. 파일을 나눠서 올려주세요.' };
  }
  if (status >= 500 || status === 408 || !status) {
    return { status: 503, code: 'upstream', retryable: true, detail, message: '일시적인 오류로 못 읽었어요. 다시 시도해 주세요.' };
  }
  return { status: 500, code: 'unknown', retryable: true, detail, message: '인식에 실패했어요. 다시 시도해 주세요.' };
}

const MODEL = 'claude-sonnet-5';

export type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
export const PDF_MEDIA_TYPE = 'application/pdf';
export type InputMediaType = ImageMediaType | typeof PDF_MEDIA_TYPE;

const IMAGE_TYPES: ImageMediaType[] = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export function normalizeMediaType(mt: string | undefined): InputMediaType | null {
  const t = (mt || '').toLowerCase().split(';')[0].trim();
  if (t === PDF_MEDIA_TYPE) return PDF_MEDIA_TYPE;
  if (t === 'image/jpg') return 'image/jpeg';
  return (IMAGE_TYPES as string[]).includes(t) ? (t as ImageMediaType) : null;
}

// 파일 하나에서 뽑을 수 있는 최대 건수. 이상 응답으로 토큰이 폭주하는 걸 막는 상한.
const MAX_RECEIPTS = 30;

const PROMPT = `이 파일은 한국 카드매출전표(영수증)입니다. 이미지 또는 PDF(전자세금계산서·이메일 영수증 등)로 들어옵니다.
PDF 라면 페이지에 적힌 텍스트를 그대로 읽으세요.

파일 안에 있는 **결제 건 전부**를 찾아 receipts 배열에 하나씩 담으세요.
- 여러 쪽 PDF 면 모든 쪽을 끝까지 읽고, 쪽마다 있는 영수증을 각각 한 건으로 넣으세요.
- 한 쪽(또는 사진 한 장)에 영수증이 여러 장 붙어 있어도 각각 한 건입니다.
- 반대로, 영수증 한 장 안의 여러 품목(상품 줄)은 한 건입니다. 품목별로 쪼개지 마세요.
  같은 승인번호·같은 합계로 묶이는 것은 한 건입니다.
- 같은 결제의 사본·재출력본(카드전표 + 간이영수증 등)이 중복으로 들어 있으면 한 건만 넣으세요.
- 배송지·안내문·약관처럼 결제 내역이 아닌 쪽은 건너뛰세요.
- 결제 건이 하나뿐이면 원소 1개짜리 배열, 영수증이 전혀 없으면 빈 배열로 답하세요.
- 최대 ${MAX_RECEIPTS}건까지만 넣으세요.

각 건의 필드를 정확히 읽어 JSON 스키마에 맞춰 답하세요.
- page: 그 영수증이 있던 쪽 번호(1부터). 이미지·1쪽짜리 PDF 는 1.
- merchant: 가맹점/판매자 상호
- biz_no: 사업자등록번호(없으면 "")
- datetime: 거래일시. 반드시 연-월-일 순서로 YYYY-MM-DD 또는 ISO8601(YYYY-MM-DDTHH:mm:ss). 없으면 "".
  영수증에 26.06.15 · 06/15/2026 처럼 적혀 있어도 연도 4자리·연-월-일 순서로 바꿔 적으세요.
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
 * 영수증 이미지 또는 PDF(base64) → 결제 건 목록으로 구조화 추출 + 계정과목 룰 보정.
 * 파일 하나에 여러 건이 있으면(여러 쪽 PDF·한 장에 여러 영수증) 건마다 하나씩 돌려준다.
 * PDF 는 image 블록이 아니라 document 블록으로 보내야 한다(베타 헤더 불필요).
 * API 키는 이 서버에서만 사용된다.
 */
export async function extractReceipts(
  base64: string,
  mediaType: InputMediaType = 'image/jpeg',
): Promise<ReceiptExtraction[]> {
  const fileBlock =
    mediaType === PDF_MEDIA_TYPE
      ? { type: 'document' as const, source: { type: 'base64' as const, media_type: PDF_MEDIA_TYPE, data: base64 } }
      : { type: 'image' as const, source: { type: 'base64' as const, media_type: mediaType, data: base64 } };

  const resp = await client.messages.create({
    model: MODEL,
    // 여러 건이 나올 수 있어 넉넉히. 모자라면 JSON 이 잘려 파싱에 실패한다.
    max_tokens: 16000,
    // 추출 태스크는 결정적으로: 사고 비활성.
    // effort 는 medium — 여러 쪽을 끝까지 읽고 건을 나눠야 해서 low 로는 놓치는 쪽이 생긴다.
    thinking: { type: 'disabled' },
    output_config: {
      format: { type: 'json_schema', schema: RECEIPTS_JSON_SCHEMA },
      effort: 'medium',
    },
    messages: [
      {
        role: 'user',
        content: [fileBlock, { type: 'text', text: PROMPT }],
      },
    ],
    // output_config / thinking 필드는 SDK 버전에 따라 타입이 없을 수 있어 캐스팅.
  } as unknown as Anthropic.MessageCreateParamsNonStreaming);

  recordLocalUsage(resp.usage); // 헤더의 사용 금액 추정용 (Admin 키 없을 때)

  const textBlock = resp.content.find((b) => b.type === 'text') as { text?: string } | undefined;
  let parsed: { receipts?: ReceiptExtraction[] };
  try {
    parsed = JSON.parse(textBlock?.text ?? '{}') as { receipts?: ReceiptExtraction[] };
  } catch {
    // 영수증이 너무 많아 응답이 잘린 경우. 다시 보내도 같으니 재시도가 아니라 안내로 처리한다.
    if (resp.stop_reason === 'max_tokens') {
      throw Object.assign(new Error('모델 응답이 max_tokens 로 잘렸습니다'), { code: 'too_many_receipts' });
    }
    throw new Error(`모델 응답 JSON 파싱 실패 (stop_reason=${resp.stop_reason})`);
  }

  const list = Array.isArray(parsed.receipts) ? parsed.receipts.slice(0, MAX_RECEIPTS) : [];
  return list.map((raw) => {
    // 모델이 26.06.15 · 06/15/2026 같은 표기를 돌려줘도 내부 표준(ISO)으로 맞춘다.
    raw.datetime = normalizeDateTime(raw.datetime);
    // 쪽 번호는 미리보기 렌더링에 쓰이므로 1 이상 정수로 보정한다.
    raw.page = Math.max(1, Math.round(Number(raw.page) || 1));
    return applyRules(raw);
  });
}
