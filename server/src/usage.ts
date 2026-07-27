// Anthropic Usage & Cost Admin API 로 이번 달 Claude API 사용 금액을 조회한다.
// 일반 API 키가 아닌 Admin API 키(sk-ant-admin01-…)가 필요하며(콘솔 조직 설정 필요),
// 키가 없으면 { enabled: false } 로 응답해 화면에서 표시를 숨긴다.
// 데이터는 콘솔 Cost 페이지와 동일 소스로, 반영까지 ~5분 지연될 수 있다.

const COST_URL = 'https://api.anthropic.com/v1/organizations/cost_report';

export const adminKey = () => (process.env.ANTHROPIC_ADMIN_KEY ?? '').trim();

export interface UsageInfo {
  enabled: boolean;
  month?: string; // 'YYYY-MM' (UTC 기준 월)
  costUsd?: number;
  approx?: boolean; // true 면 서버 자체 집계 추정치(이 앱 경유분만, 재시작 시 리셋)
}

// ── 서버 자체 집계(근사치) ──
// Admin 키가 없을 때의 대안: 이 서버가 보낸 Claude 호출의 usage 를 월별로 누적해 비용을 추정한다.
// 메모리 저장이라 서버 재시작(재배포) 시 리셋되고, 이 앱 밖에서 쓴 사용량은 포함하지 않는다.

interface TokenTally { input: number; output: number; cacheWrite: number; cacheRead: number }
const localTally: Record<string, TokenTally> = {};

const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

export function recordLocalUsage(u?: {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}) {
  if (!u) return;
  const t = (localTally[monthKey(new Date())] ??= { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 });
  t.input += u.input_tokens ?? 0;
  t.output += u.output_tokens ?? 0;
  t.cacheWrite += u.cache_creation_input_tokens ?? 0;
  t.cacheRead += u.cache_read_input_tokens ?? 0;
}

// Sonnet 5 요금(USD / 1M tokens). 2026-08-31 까지는 도입가 $2/$10, 이후 $3/$15.
// 캐시 쓰기는 입력의 1.25배, 캐시 읽기는 0.1배.
function rates(now: Date) {
  const intro = now.getTime() < Date.UTC(2026, 8, 1);
  const input = intro ? 2 : 3;
  const output = intro ? 10 : 15;
  return { input, output, cacheWrite: input * 1.25, cacheRead: input * 0.1 };
}

function localEstimate(): UsageInfo {
  const now = new Date();
  const t = localTally[monthKey(now)] ?? { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
  const r = rates(now);
  const usd = (t.input * r.input + t.output * r.output + t.cacheWrite * r.cacheWrite + t.cacheRead * r.cacheRead) / 1e6;
  return { enabled: true, approx: true, month: monthKey(now), costUsd: Math.round(usd * 10000) / 10000 };
}

// 권장 폴링 주기(분당 1회)보다 훨씬 여유 있게 10분 캐시
const CACHE_MS = 10 * 60 * 1000;
let cache: { at: number; data: UsageInfo } | null = null;

interface CostResponse {
  data?: { results?: { amount?: string }[] }[];
  has_more?: boolean;
  next_page?: string;
}

export async function monthlyCost(): Promise<UsageInfo> {
  if (!adminKey()) return localEstimate(); // Admin 키가 없으면 서버 자체 집계 추정치로
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.data;

  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  let cents = 0;
  let page: string | undefined;
  // 비용은 최소 단위(센트) 십진 문자열로 오며, 일 단위 버킷을 이번 달 범위로 합산한다.
  do {
    const params = new URLSearchParams({
      starting_at: start.toISOString(),
      ending_at: now.toISOString(),
      limit: '31',
    });
    if (page) params.set('page', page);
    const r = await fetch(`${COST_URL}?${params}`, {
      headers: { 'x-api-key': adminKey(), 'anthropic-version': '2023-06-01' },
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      console.error('[usage]', r.status, detail.slice(0, 300));
      throw new Error('Claude 사용량을 조회하지 못했어요. (Admin API 키·조직 설정 확인)');
    }
    const body = (await r.json()) as CostResponse;
    for (const bucket of body.data ?? []) {
      for (const item of bucket.results ?? []) {
        const n = Number.parseFloat(item.amount ?? '0');
        if (Number.isFinite(n)) cents += n;
      }
    }
    page = body.has_more ? body.next_page : undefined;
  } while (page);

  const data: UsageInfo = {
    enabled: true,
    month: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}`,
    costUsd: Math.round(cents) / 100,
  };
  cache = { at: Date.now(), data };
  return data;
}
