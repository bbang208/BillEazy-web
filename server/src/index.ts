import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { describeError, extractReceipt, normalizeMediaType, PDF_MEDIA_TYPE } from './anthropic.js';
import { buildBuffer, claimFileName, type ExportKind, type PersonalClaim, type FuelClaim } from './export.js';
import { mockExtract } from './mock.js';
import { geocode, MapsError, ncpKey, ncpKeyId, routeDistance, searchClientId, searchClientSecret, searchPlaces } from './maps.js';
import { approvalEvents, createDraft, documentState, hiworksFormId, hiworksToken, HiworksError, recordCallback, type DraftFile } from './hiworks.js';

const app = express();
// Railway 프록시 뒤에서 req.protocol/host 가 원래 값(https·공개 도메인)으로 잡히게 한다(콜백 URL 자동 구성용).
app.set('trust proxy', true);

const originEnv = (process.env.ALLOWED_ORIGIN ?? 'http://localhost:3000').trim();
// ALLOWED_ORIGIN=* 이면 모든 오리진 허용(초기 셋업용). 아니면 콤마 구분 목록만 허용.
const corsOrigin = originEnv === '*' ? true : originEnv.split(',').map((s) => s.trim());
// 브라우저(다른 오리진)에서 다운로드 파일명을 읽으려면 Content-Disposition 을 노출해야 한다.
app.use(cors({ origin: corsOrigin, exposedHeaders: ['Content-Disposition'] }));
app.use(express.json({ limit: '50mb' })); // base64 이미지 수용

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: '빌리지 server',
    model: 'claude-sonnet-5',
    hasKey: Boolean(process.env.ANTHROPIC_API_KEY),
    mock: process.env.MOCK_EXTRACT === '1',
    maps: {
      mock: process.env.MOCK_MAPS === '1',
      hasSearchKey: Boolean(searchClientId() && searchClientSecret()),
      hasRouteKey: Boolean(ncpKeyId() && ncpKey()),
    },
    hiworks: {
      hasToken: Boolean(hiworksToken()),
      formId: hiworksFormId() || null,
    },
  });
});

function sendMapsError(res: express.Response, e: unknown) {
  if (e instanceof MapsError) {
    if (e.detail) console.error('[maps]', e.code, e.detail);
    return res.status(e.status).json({ error: e.message, code: e.code });
  }
  const msg = e instanceof Error ? e.message : '지도 요청 실패';
  console.error('[maps]', msg);
  res.status(500).json({ error: '지도 요청 중 오류가 발생했어요.' });
}

// 장소(POI) 검색: 키워드 → 후보 목록(좌표 포함)
app.get('/api/places', async (req, res) => {
  try {
    const places = await searchPlaces(String(req.query.query ?? ''));
    res.json({ places });
  } catch (e) {
    sendMapsError(res, e);
  }
});

// 주소 → 좌표 변환(순수 주소용)
app.get('/api/geocode', async (req, res) => {
  try {
    const places = await geocode(String(req.query.query ?? ''));
    res.json({ places });
  } catch (e) {
    sendMapsError(res, e);
  }
});

// 경로 거리: start·goal(경도,위도) → 주행 거리·톨비
app.get('/api/route', async (req, res) => {
  try {
    const start = String(req.query.start ?? '').trim();
    const goal = String(req.query.goal ?? '').trim();
    if (!start || !goal) return res.status(400).json({ error: 'start·goal(경도,위도) 가 필요합니다.' });
    res.json(await routeDistance(start, goal));
  } catch (e) {
    sendMapsError(res, e);
  }
});

// Claude API 제한: 요청 32MB. base64 는 원본의 약 4/3 이므로 24MB 원본까지 허용.
const MAX_BASE64_BYTES = 30 * 1024 * 1024;

// 영수증 이미지·PDF → 구조화 추출 + 계정과목 추천
app.post('/api/extract', async (req, res) => {
  try {
    const { image, mediaType } = req.body as { image?: string; mediaType?: string };
    if (!image) return res.status(400).json({ error: '파일(base64) 이 필요합니다.' });
    // 크레딧 없이 테스트: MOCK_EXTRACT=1 이면 실제 API 대신 샘플 반환
    if (process.env.MOCK_EXTRACT === '1') {
      return res.json(await mockExtract());
    }
    const mt = normalizeMediaType(mediaType) ?? 'image/jpeg';
    if (image.length > MAX_BASE64_BYTES) {
      const mb = Math.round((image.length * 3) / 4 / 1024 / 1024);
      return res.status(400).json({
        error: `파일이 너무 커요(약 ${mb}MB). ${mt === PDF_MEDIA_TYPE ? 'PDF' : '이미지'} 는 24MB 이하로 올려주세요.`,
      });
    }
    const result = await extractReceipt(image, mt);
    res.json(result);
  } catch (e) {
    // SDK 원문(예: `529 {"type":"error",...}`)은 로그에만 남기고, 화면에는 한국어 안내만 보낸다.
    const f = describeError(e);
    console.error('[extract]', f.code, f.detail);
    res.status(f.status).json({ error: f.message, code: f.code, retryable: f.retryable });
  }
});

// 확정 데이터 → 회사 엑셀 양식 .xlsx
app.post('/api/export', async (req, res) => {
  try {
    const { kind, data } = req.body as { kind?: ExportKind; data?: PersonalClaim | FuelClaim };
    if (!data) return res.status(400).json({ error: 'data 가 필요합니다.' });
    const k: ExportKind = kind === 'fuel' ? 'fuel' : 'personal';
    const buf = await buildBuffer(k, data);
    // 파일명: 뉴로랩 {작성자} 개인경비|주유대 청구 YY MM DD.xlsx (날짜 = 작성일)
    const filename = claimFileName(k, data.name, (data as FuelClaim).writeDate);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.end(buf);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'export 실패';
    console.error('[export]', msg);
    res.status(500).json({ error: msg });
  }
});

// ── 하이웍스 전자결재 ──

function sendHiworksError(res: express.Response, e: unknown) {
  if (e instanceof HiworksError) {
    if (e.detail) console.error('[hiworks]', e.code, e.detail);
    return res.status(e.status).json({ error: e.message, code: e.code });
  }
  const msg = e instanceof Error ? e.message : '전자결재 요청 실패';
  console.error('[hiworks]', msg);
  res.status(500).json({ error: '전자결재 요청 중 오류가 발생했어요.' });
}

// 문서 상태 변경 콜백을 받을 공개 주소. 환경변수가 없으면 요청 호스트로 구성한다(로컬은 수신 불가·기안은 정상).
function callbackUrl(req: express.Request): string {
  const env = (process.env.HIWORKS_CALLBACK_URL ?? '').trim();
  if (env) return env.endsWith('/api/approval/callback') ? env : `${env.replace(/\/$/, '')}/api/approval/callback`;
  return `${req.protocol}://${req.get('host')}/api/approval/callback`;
}

// 확정 청구 데이터(개인경비·주유대) → 회사 엑셀 첨부 + 기안 문서 생성 → 기안하기 팝업 URL 반환.
// 실제 상신은 사용자가 팝업(login_url)에서 결재선을 지정하고 [기안하기]를 눌러야 완료된다.
app.post('/api/approval/draft', async (req, res) => {
  try {
    const { subject, contents, claims, attachments } = req.body as {
      subject?: string;
      contents?: string; // 기안 본문(html). 회사 양식 폼은 웹에서 구성해 보낸다.
      claims?: { kind?: ExportKind; data?: PersonalClaim | FuelClaim }[];
      attachments?: DraftFile[]; // 영수증 원본 등 추가 첨부(base64)
    };
    if (!subject?.trim()) return res.status(400).json({ error: 'subject(기안 제목) 가 필요합니다.' });
    if (!contents?.trim()) return res.status(400).json({ error: 'contents(기안 본문) 가 필요합니다.' });

    const files: DraftFile[] = [];
    for (const c of claims ?? []) {
      if (!c?.data) continue;
      const k: ExportKind = c.kind === 'fuel' ? 'fuel' : 'personal';
      const buf = await buildBuffer(k, c.data);
      files.push({
        file_name: claimFileName(k, c.data.name, (c.data as FuelClaim).writeDate),
        file: Buffer.from(buf).toString('base64'),
      });
    }
    for (const a of attachments ?? []) {
      if (a?.file_name && a?.file) files.push({ file_name: a.file_name, file: a.file });
    }

    const result = await createDraft({ subject, contents, callbackUrl: callbackUrl(req), files });
    res.json(result);
  } catch (e) {
    sendHiworksError(res, e);
  }
});

// 하이웍스가 문서 상태 변경 시 호출(기안 progress·반려 rejected·취소 canceled·완료 complete·삭제 deleted)
app.get('/api/approval/callback', (req, res) => {
  const ev = recordCallback(req.query as Record<string, unknown>);
  console.log('[hiworks] callback', ev.approvalCode || ev.approvalId, ev.state);
  res.send('OK');
});

// 수신한 콜백 목록(웹에서 상신 결과 확인용)
app.get('/api/approval/events', (_req, res) => {
  res.json({ events: approvalEvents() });
});

// 문서 상태 재조회(콜백의 approval_id 사용)
app.get('/api/approval/status/:id', async (req, res) => {
  try {
    res.json({ state: await documentState(req.params.id) });
  } catch (e) {
    sendHiworksError(res, e);
  }
});

const port = Number(process.env.PORT ?? 8080);
app.listen(port, () => {
  console.log(`빌리지 server 실행 중 → http://localhost:${port}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('⚠️  ANTHROPIC_API_KEY 가 설정되지 않았습니다. /api/extract 는 실패합니다. (.env 확인)');
  }
});
