// 하이웍스 전자결재 품의 본문(회사 양식) 구성.
// 회사 폼: "뉴로랩 {YYYY년 M월} 업무관련 개인경비 지급 품의 건" 제목에
// 인사말 → <하기> → 1.사용기간 → 2.인원별 금액 표 → 계좌 → 3.첨부 목록 순서의 HTML 본문.
import type { Meta } from './types';
import { normalizeDate, todayISO } from './date';

export interface ApprovalForm {
  subject: string;
  contents: string;
}

// period 자유 문자열("2026/06/16 ~ 2026/06/29" 등)에서 ISO 날짜들만 뽑는다.
function periodDates(period: string): string[] {
  const m = period.match(/\d{2,4}\s*[./\-,]\s*\d{1,2}\s*[./\-,]\s*\d{1,4}|\d{2,4}\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일/g) ?? [];
  return m.map((s) => normalizeDate(s)).filter(Boolean);
}

// '2026-06-16' → '2026년 6월 16일' (회사 양식은 0 없이 표기)
function koreanDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${y}년 ${m}월 ${d}일`;
}

function koreanMonth(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  return `${y}년 ${m}월`;
}

const won = (n: number) => `${(n || 0).toLocaleString('ko-KR')} 원`;

// server/src/export.ts 의 claimFileName 과 같은 규칙 (첨부 목록 표기용, 확장자 제외)
export function claimFileLabel(kind: 'personal' | 'fuel', name: string): string {
  const [y, m, d] = todayISO().split('-');
  const who = name.replace(/[\\/:*?"<>|]/g, '').trim();
  const kindLabel = kind === 'fuel' ? '주유대 청구' : '개인경비 청구';
  return ['뉴로랩', who, kindLabel, `${y.slice(2)} ${m} ${d}`].filter(Boolean).join(' ');
}

const cell = 'border:1px solid #333;padding:8px;text-align:center;';

export function buildApprovalForm(opts: {
  meta: Meta;
  personalTotal: number;
  fuelTotal: number;
  excelLabels: string[]; // 첨부 엑셀 표기명(확장자 제외)
  receiptCount: number;
}): ApprovalForm {
  const { meta, personalTotal, fuelTotal, excelLabels, receiptCount } = opts;
  const dates = periodDates(meta.period);
  const baseISO = dates[0] || todayISO();
  const month = koreanMonth(baseISO);
  const total = personalTotal + fuelTotal;
  const hasFuel = fuelTotal > 0;

  const subject = `뉴로랩 ${month} 업무관련 개인경비 지급 품의 건`;

  const periodLabel = dates.length >= 2
    ? `${koreanDate(dates[0])} ~ ${koreanDate(dates[1])}`
    : dates.length === 1
      ? koreanDate(dates[0])
      : meta.period.trim();

  // 표: 이름·사용월·개인경비(·주유대)·합계 + 빈 행 + 총합계 행 (회사 양식 그대로)
  const headCells = ['이름', '사용월', '개인경비', ...(hasFuel ? ['주유대'] : []), '합계']
    .map((h) => `<th style="${cell}">${h}</th>`).join('');
  const dataCells = [
    meta.name || '', month, won(personalTotal), ...(hasFuel ? [won(fuelTotal)] : []), won(total),
  ].map((v) => `<td style="${cell}">${v}</td>`).join('');
  const cols = hasFuel ? 5 : 4;
  const emptyRow = `<tr>${`<td style="${cell}">&nbsp;</td>`.repeat(cols)}</tr>`;
  const totalRow = `<tr>${`<td style="${cell}"></td>`.repeat(cols - 2)}<td style="${cell}"><b>총합계</b></td><td style="${cell}"><b>${won(total)}</b></td></tr>`;

  const attachLines = [
    ...excelLabels.map((n) => `- ${n}`),
    ...(receiptCount > 0 ? [`- 영수증 ${receiptCount}건`] : []),
  ].map((s) => `<p>${s}</p>`).join('');

  const contents = [
    `<p>하기와 같이 뉴로랩 ${month} 업무관련 개인경비에 대하여 품의 드리오니 검토 후 재가하여 주시길 바랍니다.</p>`,
    '<p style="text-align:center">&lt;하기&gt;</p>',
    '<hr>',
    `<p>1. 사용기간: ${periodLabel}</p>`,
    '<p>2. 인원별 사용 금액 및 계좌</p>',
    `<table style="border-collapse:collapse;width:100%">`,
    `<tr>${headCells}</tr>`,
    `<tr>${dataCells}</tr>`,
    emptyRow,
    totalRow,
    '</table>',
    `<p>계좌: ${meta.account.trim()}</p>`,
    '<p>3. 첨부</p>',
    attachLines,
  ].join('\n');

  return { subject, contents };
}
