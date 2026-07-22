import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { extractReceipt, type ImageMediaType } from './anthropic.js';
import { buildBuffer, type ExportKind, type PersonalClaim, type FuelClaim } from './export.js';
import { mockExtract } from './mock.js';

const app = express();

const origins = (process.env.ALLOWED_ORIGIN ?? 'http://localhost:3000')
  .split(',')
  .map((s) => s.trim());
app.use(cors({ origin: origins }));
app.use(express.json({ limit: '50mb' })); // base64 이미지 수용

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: '빌리지 server', model: 'claude-sonnet-5', hasKey: Boolean(process.env.ANTHROPIC_API_KEY), mock: process.env.MOCK_EXTRACT === '1' });
});

// 영수증 이미지 → 구조화 추출 + 계정과목 추천
app.post('/api/extract', async (req, res) => {
  try {
    const { image, mediaType } = req.body as { image?: string; mediaType?: ImageMediaType };
    if (!image) return res.status(400).json({ error: 'image(base64) 가 필요합니다.' });
    // 크레딧 없이 테스트: MOCK_EXTRACT=1 이면 실제 API 대신 샘플 반환
    if (process.env.MOCK_EXTRACT === '1') {
      return res.json(await mockExtract());
    }
    const result = await extractReceipt(image, mediaType ?? 'image/jpeg');
    res.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'extract 실패';
    console.error('[extract]', msg);
    res.status(500).json({ error: msg });
  }
});

// 확정 데이터 → 회사 엑셀 양식 .xlsx
app.post('/api/export', async (req, res) => {
  try {
    const { kind, data } = req.body as { kind?: ExportKind; data?: PersonalClaim | FuelClaim };
    if (!data) return res.status(400).json({ error: 'data 가 필요합니다.' });
    const k: ExportKind = kind === 'fuel' ? 'fuel' : 'personal';
    const buf = await buildBuffer(k, data);
    const filename = k === 'fuel' ? '주유대청구양식.xlsx' : '개인경비청구서.xlsx';
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
