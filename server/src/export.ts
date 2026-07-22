import ExcelJS from 'exceljs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORIES, Category, FUEL_RATE_PER_KM } from './schema.js';

// 회사 원본 엑셀 양식(server/templates/*.xlsx)의 셀을 채워 100% 동일한 서식으로 산출한다.
const TEMPLATES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'templates');

export interface PersonalItem {
  date: string; detail: string; vendor: string; note: string; amount: number; category: Category; remark?: string;
}
export interface FuelItem {
  date: string; purpose: string; destination: string; distanceKm: number; toll?: number; parking?: number; etc?: number;
}
export interface ReceiptImage { name: string; base64: string; mediaType: string }
export interface PersonalClaim { dept: string; name: string; period: string; items: PersonalItem[]; images?: ReceiptImage[] }
export interface FuelClaim { name: string; writeDate?: string; period: string; ratePerKm?: number; items: FuelItem[]; images?: ReceiptImage[] }
export type ExportKind = 'personal' | 'fuel';

function toDate(s: string): Date | string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
  // ExcelJS 는 날짜를 UTC 기준으로 직렬화 → UTC 자정으로 만들어 하루 밀림 방지
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : (s || '');
}

function extOf(mt: string): 'png' | 'jpeg' | 'gif' | null {
  const t = (mt || '').toLowerCase();
  if (t.includes('png')) return 'png';
  if (t.includes('jpeg') || t.includes('jpg')) return 'jpeg';
  if (t.includes('gif')) return 'gif';
  return null; // webp/heic 등은 미지원 → 캡션만
}

// 영수증 이미지를 별지 시트에 2열 그리드로 첨부한다.
function addAttachments(wb: ExcelJS.Workbook, images: ReceiptImage[] | undefined, removeSheetName?: string) {
  if (!images || images.length === 0) return;
  if (removeSheetName) {
    const s = wb.getWorksheet(removeSheetName);
    if (s) wb.removeWorksheet(s.id);
    // 제거된 원본 이미지 시트의 media 가 orphan 으로 남지 않게 정리(엑셀 복구 팝업 방지)
    try {
      (wb as unknown as { media?: unknown[] }).media?.splice(0);
    } catch {
      /* noop */
    }
  }
  const ws = wb.addWorksheet('영수증 첨부');
  ws.getCell('B1').value = '별지 · 영수증 첨부';
  ws.getCell('B1').font = { bold: true, size: 14 };
  images.forEach((img, i) => {
    const block = Math.floor(i / 2);
    const col2 = i % 2; // 0=왼쪽, 1=오른쪽
    const capCol1 = col2 === 0 ? 2 : 9; // B / I 열
    const capRow1 = 3 + block * 26;
    const cap = ws.getCell(capRow1, capCol1);
    cap.value = `영수증 #${i + 1} ${img.name}`;
    cap.font = { color: { argb: 'FF868E96' }, size: 10 };
    const ext = extOf(img.mediaType);
    if (!ext) return;
    const id = wb.addImage({ base64: img.base64, extension: ext });
    ws.addImage(id, { tl: { col: capCol1 - 1, row: capRow1 }, ext: { width: 300, height: 440 } });
  });
}

// ── 개인경비: 업무관련 개인경비 사용 명세서 ──
// 메타 B5/C5/E7, 데이터 B10:H19(10행), 소계 H20, 계정과목별 H22:H27, 합계 H28
export async function buildPersonalBuffer(p: PersonalClaim): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.join(TEMPLATES, 'personal-expense-template.xlsx'));
  wb.calcProperties.fullCalcOnLoad = true;
  const ws = wb.worksheets[0];

  ws.getCell('B5').value = p.dept || '';
  ws.getCell('C5').value = p.name || '';
  ws.getCell('F5').value = p.name || ''; // 작성자 명 (원본 템플릿의 #VALUE! 오류 셀을 덮어씀)
  ws.getCell('E7').value = `지출 기간  ${p.period || ''}`;

  const CAP = 10; // 기본 데이터 행 10~19
  const n = p.items.length;
  const extra = Math.max(0, n - CAP);
  if (extra > 0) ws.duplicateRow(19, extra, true); // 스타일 보존하며 데이터 행 추가

  const rowCount = CAP + extra;
  for (let i = 0; i < rowCount; i++) {
    const r = 10 + i;
    for (const col of ['B', 'C', 'D', 'E', 'F', 'G', 'H']) ws.getCell(col + r).value = null;
  }
  p.items.forEach((it, i) => {
    const r = 10 + i;
    ws.getCell('B' + r).value = toDate(it.date);
    ws.getCell('C' + r).value = it.detail || '';
    ws.getCell('D' + r).value = it.vendor || '';
    ws.getCell('E' + r).value = it.note || '';
    ws.getCell('F' + r).value = it.amount || 0;
    ws.getCell('G' + r).value = it.category;
    ws.getCell('H' + r).value = it.remark || '';
  });

  // 수식 자리에 계산값 기록(무결성 보장, 서식 유지)
  const subtotalRow = 20 + extra;
  const catStart = 22 + extra;
  const totalRow = 28 + extra;
  const subtotal = p.items.reduce((s, it) => s + (it.amount || 0), 0);
  ws.getCell('H' + subtotalRow).value = subtotal;
  CATEGORIES.forEach((c, i) => {
    const sum = p.items.filter((it) => it.category === c).reduce((s, it) => s + (it.amount || 0), 0);
    ws.getCell('H' + (catStart + i)).value = sum; // G22~G27 순서 = CATEGORIES 순서와 일치
  });
  ws.getCell('H' + totalRow).value = subtotal;

  addAttachments(wb, p.images, '증빙자료'); // 원본 샘플 이미지 시트 제거 후 사용자 영수증 첨부
  return (await wb.xlsx.writeBuffer()) as unknown as Buffer;
}

// ── 주유대 청구 양식 ──
// 메타 B3/H3/I3, 데이터 B7:J10(4행, 열 B~J), 합계 행 11
export async function buildFuelBuffer(f: FuelClaim): Promise<Buffer> {
  const rate = f.ratePerKm ?? FUEL_RATE_PER_KM;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.join(TEMPLATES, 'fuel-expense-template.xlsx'));
  wb.calcProperties.fullCalcOnLoad = true;
  const ws = wb.worksheets[0];

  ws.getCell('B3').value = f.name || '';
  ws.getCell('H3').value = f.period || '';
  ws.getCell('I3').value = rate;

  const CAP = 4; // 데이터 행 7~10
  const n = f.items.length;
  const extra = Math.max(0, n - CAP);
  if (extra > 0) ws.duplicateRow(10, extra, true);

  const rowCount = CAP + extra;
  for (let i = 0; i < rowCount; i++) {
    const r = 7 + i;
    for (const col of ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']) ws.getCell(col + r).value = null;
  }
  let sE = 0, sF = 0, sG = 0, sH = 0, sI = 0, sJ = 0;
  f.items.forEach((it, i) => {
    const r = 7 + i;
    const amount = Math.round((it.distanceKm || 0) * rate);
    const toll = it.toll || 0, parking = it.parking || 0, etc = it.etc || 0;
    const sub = amount + toll + parking + etc;
    ws.getCell('B' + r).value = toDate(it.date);
    ws.getCell('C' + r).value = it.purpose || '';
    ws.getCell('D' + r).value = it.destination || '';
    ws.getCell('E' + r).value = it.distanceKm || 0;
    ws.getCell('F' + r).value = amount;
    ws.getCell('G' + r).value = toll;
    ws.getCell('H' + r).value = parking;
    ws.getCell('I' + r).value = etc;
    ws.getCell('J' + r).value = sub;
    sE += it.distanceKm || 0; sF += amount; sG += toll; sH += parking; sI += etc; sJ += sub;
  });
  const totalRow = 11 + extra;
  ws.getCell('E' + totalRow).value = sE;
  ws.getCell('F' + totalRow).value = sF;
  ws.getCell('G' + totalRow).value = sG;
  ws.getCell('H' + totalRow).value = sH;
  ws.getCell('I' + totalRow).value = sI;
  ws.getCell('J' + totalRow).value = sJ;

  addAttachments(wb, f.images);
  return (await wb.xlsx.writeBuffer()) as unknown as Buffer;
}

export async function buildBuffer(kind: ExportKind, data: PersonalClaim | FuelClaim): Promise<Buffer> {
  return kind === 'fuel'
    ? buildFuelBuffer(data as FuelClaim)
    : buildPersonalBuffer(data as PersonalClaim);
}
