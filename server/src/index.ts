import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { describeError, extractReceipt, normalizeMediaType, PDF_MEDIA_TYPE } from './anthropic.js';
import { buildBuffer, claimFileName, type ExportKind, type PersonalClaim, type FuelClaim } from './export.js';
import { mockExtract } from './mock.js';

const app = express();

const originEnv = (process.env.ALLOWED_ORIGIN ?? 'http://localhost:3000').trim();
// ALLOWED_ORIGIN=* 이면 모든 오리진 허용(초기 셋업용). 아니면 콤마 구분 목록만 허용.
const corsOrigin = originEnv === '*' ? true : originEnv.split(',').map((s) => s.trim());
// 브라우저(다른 오리진)에서 다운로드 파일명을 읽으려면 Content-Disposition 을 노출해야 한다.
app.use(cors({ origin: corsOrigin, exposedHeaders: ['Content-Disposition'] }));
app.use(express.json({ limit: '50mb' })); // base64 이미지 수용

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: '빌리지 server', model: 'claude-sonnet-5', hasKey: Boolean(process.env.ANTHROPIC_API_KEY), mock: process.env.MOCK_EXTRACT === '1' });
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

const port = Number(process.env.PORT ?? 8080);
app.listen(port, () => {
  console.log(`빌리지 server 실행 중 → http://localhost:${port}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('⚠️  ANTHROPIC_API_KEY 가 설정되지 않았습니다. /api/extract 는 실패합니다. (.env 확인)');
  }
});
