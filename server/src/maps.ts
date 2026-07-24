// 네이버 지도: 장소(POI) 검색 + 자동차 경로 거리 조회.
// - 장소 검색: 네이버 개발자센터 지역 검색 API(openapi.naver.com) → 키워드로 상호/장소 검색.
//   인증: X-Naver-Client-Id / X-Naver-Client-Secret (NCP Maps 키와 별개).
// - 경로/거리: NCP Maps Directions 5(maps.apigw.ntruss.com) → 좌표 2점의 주행 거리·톨비.
//   인증: x-ncp-apigw-api-key-id / x-ncp-apigw-api-key (VPC 환경).
// 두 키 모두 이 서버(Railway)에만 두고, 브라우저에는 노출하지 않는다.

const SEARCH_URL = 'https://openapi.naver.com/v1/search/local.json';
const DIRECTIONS_URL = 'https://maps.apigw.ntruss.com/map-direction/v1/driving';
const GEOCODE_URL = 'https://maps.apigw.ntruss.com/map-geocode/v2/geocode';

export interface Place {
  name: string; // 상호/장소명
  roadAddress: string; // 도로명 주소
  address: string; // 지번 주소
  lng: number; // 경도
  lat: number; // 위도
}

export interface RouteResult {
  distanceKm: number; // 소수 첫째 자리 반올림
  distanceM: number;
  tollFare: number; // 통행요금(원)
  fuelPrice: number; // 참고용(우리는 310원/km 로 별도 계산)
  durationMin: number; // 예상 소요(분)
}

export class MapsError extends Error {
  status: number;
  code: string;
  detail?: string;
  constructor(status: number, code: string, message: string, detail?: string) {
    super(message);
    this.name = 'MapsError';
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

function stripTags(s: string): string {
  return (s || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

// 지역 검색 API 의 mapx/mapy → WGS84 경도/위도.
// 현재 API 는 좌표를 WGS84 * 1e7 정수로 반환한다(예: 1271234567 → 127.1234567).
// 한국 좌표 범위(경도 124~132, 위도 33~39) 밖이면 스케일이 다른 것으로 보고 로그만 남긴다.
function toCoord(mapx: unknown, mapy: unknown): { lng: number; lat: number } {
  const x = Number(mapx);
  const y = Number(mapy);
  const lng = Math.abs(x) > 1000 ? x / 1e7 : x;
  const lat = Math.abs(y) > 1000 ? y / 1e7 : y;
  return { lng, lat };
}

const inKorea = (p: { lng: number; lat: number }) =>
  Number.isFinite(p.lng) && Number.isFinite(p.lat) && p.lng > 123 && p.lng < 132 && p.lat > 32 && p.lat < 40;

export async function searchPlaces(query: string): Promise<Place[]> {
  const q = (query || '').trim();
  if (!q) return [];
  if (process.env.MOCK_MAPS === '1') return mockPlaces(q);

  const id = process.env.NAVER_SEARCH_CLIENT_ID;
  const secret = process.env.NAVER_SEARCH_CLIENT_SECRET;
  if (!id || !secret) {
    throw new MapsError(503, 'MAPS_NO_KEY', '장소 검색 키가 설정되지 않았어요. 관리자에게 문의해 주세요.');
  }

  const url = `${SEARCH_URL}?query=${encodeURIComponent(q)}&display=5&sort=random`;
  let resp: Response;
  try {
    resp = await fetch(url, {
      headers: { 'X-Naver-Client-Id': id, 'X-Naver-Client-Secret': secret },
    });
  } catch (e) {
    throw new MapsError(502, 'SEARCH_NETWORK', '장소 검색 서버에 연결하지 못했어요.', String(e));
  }
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    const status = resp.status === 429 ? 429 : 502;
    throw new MapsError(status, 'SEARCH_FAIL', '장소 검색에 실패했어요. 잠시 후 다시 시도해 주세요.', body.slice(0, 300));
  }
  const data = (await resp.json().catch(() => ({}))) as { items?: Record<string, unknown>[] };
  const places = (data.items ?? []).map((it) => {
    const { lng, lat } = toCoord(it.mapx, it.mapy);
    return {
      name: stripTags(String(it.title ?? '')),
      roadAddress: String(it.roadAddress ?? ''),
      address: String(it.address ?? ''),
      lng,
      lat,
    };
  });
  const good = places.filter(inKorea);
  if (good.length < places.length) {
    console.warn('[maps] 좌표 범위 밖 결과 제외', places.length - good.length, '건 (mapx/mapy 스케일 확인 필요)');
  }
  return good;
}

// 주소 문자열 → 좌표(도로명/지번). POI 검색이 안 잡는 순수 주소를 정확히 변환한다.
// NCP Geocoding API — Directions 와 동일한 키(x-ncp-apigw-api-key-id/key)를 쓴다.
export async function geocode(query: string): Promise<Place[]> {
  const q = (query || '').trim();
  if (!q) return [];
  if (process.env.MOCK_MAPS === '1') return mockPlaces(q);

  const id = process.env.NCP_MAPS_KEY_ID;
  const key = process.env.NCP_MAPS_KEY;
  if (!id || !key) {
    throw new MapsError(503, 'MAPS_NO_KEY', '주소 변환 키가 설정되지 않았어요.');
  }
  const url = `${GEOCODE_URL}?query=${encodeURIComponent(q)}`;
  let resp: Response;
  try {
    resp = await fetch(url, {
      headers: { 'x-ncp-apigw-api-key-id': id, 'x-ncp-apigw-api-key': key },
    });
  } catch (e) {
    throw new MapsError(502, 'GEOCODE_NETWORK', '주소 변환 서버에 연결하지 못했어요.', String(e));
  }
  const data = (await resp.json().catch(() => ({}))) as {
    status?: string;
    addresses?: { roadAddress?: string; jibunAddress?: string; x?: string; y?: string }[];
  };
  if (!resp.ok || (data.status && data.status !== 'OK')) {
    throw new MapsError(502, 'GEOCODE_FAIL', '주소를 변환하지 못했어요.', JSON.stringify(data).slice(0, 300));
  }
  return (data.addresses ?? [])
    .map((a) => ({
      name: a.roadAddress || a.jibunAddress || q,
      roadAddress: a.roadAddress || '',
      address: a.jibunAddress || '',
      lng: Number(a.x),
      lat: Number(a.y),
    }))
    .filter(inKorea);
}

export async function routeDistance(start: string, goal: string): Promise<RouteResult> {
  if (process.env.MOCK_MAPS === '1') return mockRoute(start, goal);

  const id = process.env.NCP_MAPS_KEY_ID;
  const key = process.env.NCP_MAPS_KEY;
  if (!id || !key) {
    throw new MapsError(503, 'MAPS_NO_KEY', '경로 조회 키가 설정되지 않았어요. 관리자에게 문의해 주세요.');
  }

  const url = `${DIRECTIONS_URL}?start=${encodeURIComponent(start)}&goal=${encodeURIComponent(goal)}&option=traoptimal`;
  let resp: Response;
  try {
    resp = await fetch(url, {
      headers: { 'x-ncp-apigw-api-key-id': id, 'x-ncp-apigw-api-key': key },
    });
  } catch (e) {
    throw new MapsError(502, 'ROUTE_NETWORK', '경로 조회 서버에 연결하지 못했어요.', String(e));
  }
  const data = (await resp.json().catch(() => ({}))) as {
    code?: number;
    message?: string;
    route?: Record<string, { summary?: Record<string, number> }[]>;
  };
  if (!resp.ok || data.code !== 0) {
    // Directions 자체 코드: 1 동일지점 / 2 도로밖 / 4 경유지 도로밖 / 5 거리초과
    const msg =
      data.code === 1 ? '출발지와 목적지가 같아요.' :
      data.code === 2 ? '출발지 또는 목적지가 도로에서 너무 멀어요. 다른 위치를 선택해 주세요.' :
      data.code === 5 ? '경로가 너무 길어요(1,500km 이상).' :
      '경로를 찾지 못했어요. 위치를 다시 선택해 주세요.';
    throw new MapsError(400, 'ROUTE_FAIL', msg, `code=${data.code} ${data.message ?? ''}`.slice(0, 300));
  }
  const route = data.route ?? {};
  const opt = route.traoptimal?.[0] ?? Object.values(route)[0]?.[0];
  const s = opt?.summary;
  if (!s || typeof s.distance !== 'number') {
    throw new MapsError(400, 'ROUTE_FAIL', '경로 정보를 읽지 못했어요.');
  }
  const distanceM = s.distance;
  return {
    distanceM,
    distanceKm: Math.round(distanceM / 100) / 10,
    tollFare: s.tollFare || 0,
    fuelPrice: s.fuelPrice || 0,
    durationMin: Math.round((s.duration || 0) / 60000),
  };
}

// ── 목(mock): 키 없이 UI/플로우 테스트용 (MOCK_MAPS=1) ──
function mockPlaces(q: string): Place[] {
  return [
    { name: `${q} 판교점`, roadAddress: '경기 성남시 분당구 판교역로 235', address: '경기 성남시 분당구 삼평동 681', lng: 127.1112, lat: 37.3947 },
    { name: `${q} 강남점`, roadAddress: '서울 강남구 테헤란로 152', address: '서울 강남구 역삼동 737', lng: 127.0367, lat: 37.5006 },
    { name: `${q} 시청점`, roadAddress: '서울 중구 세종대로 110', address: '서울 중구 태평로1가 31', lng: 126.9784, lat: 37.5663 },
  ];
}

function mockRoute(start: string, goal: string): RouteResult {
  const [sx, sy] = start.split(',').map(Number);
  const [gx, gy] = goal.split(',').map(Number);
  // 직선거리(위경도 → km 근사) × 1.3(도로 우회 계수). 결정적 값.
  const straight = Math.hypot((gx - sx) * 88.8, (gy - sy) * 111);
  const km = Math.max(0.1, Math.round(straight * 1.3 * 10) / 10);
  return {
    distanceM: Math.round(km * 1000),
    distanceKm: km,
    tollFare: Math.floor(km / 40) * 1000,
    fuelPrice: 0,
    durationMin: Math.round(km * 1.4),
  };
}
