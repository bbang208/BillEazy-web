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
  if (!adminKey()) return { enabled: false };
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
