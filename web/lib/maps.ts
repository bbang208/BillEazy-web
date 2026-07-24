import type { Place } from './types';

export type { Place };

// 회사(뉴로랩) 기본 출발지.
// TODO: 실제 사무실 도로명 주소·좌표로 교체(경도 lng / 위도 lat).
//       좌표를 모르면 화면에서 '출발지'를 한 번 검색·선택하면 자동으로 채워진다.
// NEXT_PUBLIC_DEFAULT_ORIGIN 에 JSON 을 넣으면 그 값으로 덮어쓴다.
// 회사(뉴로랩) 사무실. 좌표는 배포 후 NCP Geocoding 으로 확정해 채운다.
const FALLBACK_ORIGIN: Place = {
  name: '뉴로랩 (회사)',
  roadAddress: '경기 안산시 상록구 해안로 705 301호',
  address: '',
  lng: 0,
  lat: 0,
};

function readEnvOrigin(): Place | null {
  const raw = process.env.NEXT_PUBLIC_DEFAULT_ORIGIN;
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<Place>;
    if (typeof p.lng === 'number' && typeof p.lat === 'number') {
      return {
        name: p.name ?? '뉴로랩',
        roadAddress: p.roadAddress ?? '',
        address: p.address ?? '',
        lng: p.lng,
        lat: p.lat,
      };
    }
  } catch {
    /* 잘못된 JSON 이면 폴백 */
  }
  return null;
}

export const DEFAULT_ORIGIN: Place = readEnvOrigin() ?? FALLBACK_ORIGIN;

/** 좌표가 실제로 채워져 경로 계산이 가능한지(0,0 placeholder 제외). */
export function hasCoord(p?: Place | null): p is Place {
  return !!p && Number.isFinite(p.lng) && Number.isFinite(p.lat) && (p.lng !== 0 || p.lat !== 0);
}

/** 출발지|목적지 좌표로 만든 키. 같은 값이면 재계산하지 않기 위함. */
export function routeSig(origin?: Place | null, dest?: Place | null): string | null {
  if (!hasCoord(origin) || !hasCoord(dest)) return null;
  return `${origin!.lng.toFixed(6)},${origin!.lat.toFixed(6)}|${dest!.lng.toFixed(6)},${dest!.lat.toFixed(6)}`;
}
