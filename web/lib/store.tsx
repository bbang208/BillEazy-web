'use client';

import React, { createContext, useCallback, useContext, useMemo, useReducer, useRef } from 'react';
import {
  Bucket, CATEGORIES, Category, Meta, ReceiptExtraction, Row, Step,
  bucketOf, confidenceBand, fuelSubtotal, groupByPreview, rejectReason,
} from './types';
import { ExtractError, extractReceipts, exportDoc, createApprovalDraft, fileToBase64 } from './api';
import { buildApprovalForm, claimFileLabel } from './approval';
import { isPdf, renderPdfPages } from './pdf';
import { currentMonthPeriod, formatPeriod, normalizeDate, todayISO } from './date';
import { DEFAULT_ORIGIN } from './maps';

// 다시 시도·원본 첨부에 쓰려고 원본 파일을 fileKey 로 들고 있는다(상태에 넣지 않음).
// 한 파일에서 여러 항목이 나오면 그 항목들이 같은 fileKey 를 공유한다.
const fileByKey = new Map<string, File>();

// 여러 장을 한꺼번에 던지면 API 가 붐벼서 529(overloaded)가 나기 쉽다. 동시 3건까지만.
const CONCURRENCY = 3;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function runPool<T>(items: T[], worker: (item: T, index: number) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        await worker(items[i], i);
      }
    }),
  );
}

/** 일시적 오류(529/429/5xx)는 백오프를 두고 스스로 몇 번 더 시도한다. */
async function extractWithRetry(file: File, attempts = 2): Promise<ReceiptExtraction[]> {
  for (let i = 0; ; i++) {
    try {
      return await extractReceipts(file);
    } catch (e) {
      // '영수증을 못 찾음'은 다시 보내도 같을 확률이 높아 자동 재시도에서 뺀다(사용자가 직접 재시도는 가능).
      const retryable = e instanceof ExtractError ? e.retryable && e.code !== 'no_receipt' : true;
      if (!retryable || i >= attempts - 1) throw e;
      await sleep(2000 + Math.random() * 1000); // 서버 자체 재시도 뒤 한 번 더 (약 2초 대기)
    }
  }
}

// 직전 수동 이동 스냅샷 (되돌리기용)
interface MoveUndo {
  to: Bucket;
  rows: Row[]; // 이동 직전 상태 그대로
}

interface State {
  step: Step;
  rows: Row[];
  meta: Meta;
  undo: MoveUndo | null;
}

type Action =
  | { type: 'step'; step: Step }
  | { type: 'addRows'; rows: Row[] }
  | { type: 'updateRow'; id: string; patch: Partial<Row> }
  // 인식 완료: 원래 행을 첫 번째 건으로 채우고, 같은 파일에서 더 나온 건들을 바로 뒤에 끼워 넣는다.
  | { type: 'resolveRow'; id: string; patch: Partial<Row>; extra: Row[] }
  | { type: 'removeRow'; id: string }
  | { type: 'moveRows'; ids: string[]; to: Bucket }
  | { type: 'undoMove' }
  | { type: 'dismissUndo' }
  | { type: 'setMeta'; patch: Partial<Meta> }
  | { type: 'reset' };

const initial: State = {
  step: 'upload',
  rows: [],
  // 지출 기간은 작성 중인 달의 1일~말일로 미리 채운다(수정 가능).
  meta: { dept: '연구소', name: '', period: currentMonthPeriod(), account: '' },
  undo: null,
};

/**
 * 항목을 다른 문서(탭)로 옮긴다.
 * - 개인경비 → 주유대: 인식 금액을 주차료 칸에 이월(비어 있을 때만). 자동으로 채웠다는 표시를 남겨 되돌릴 수 있게 한다.
 * - 주유대 → 개인경비: 자동으로 채운 주차료는 다시 비우고, 계정과목이 비어 있으면 AI 추천값을 복구한다.
 */
function moveOne(r: Row, to: Bucket): Row {
  if (bucketOf(r) === to) return r;
  if (to === 'fuel') {
    const fill = !r.parking && r.total > 0;
    return {
      ...r,
      routing_hint: 'fuel',
      routedBy: 'user',
      parking: fill ? r.total : r.parking,
      parkingAuto: fill ? true : r.parkingAuto,
      origin: r.origin ?? DEFAULT_ORIGIN, // 출발지 기본값(회사)
    };
  }
  return {
    ...r,
    routing_hint: 'personal_expense',
    routedBy: 'user',
    parking: r.parkingAuto ? 0 : r.parking,
    parkingAuto: false,
    category: r.category || r.account_suggestion,
  };
}

function reducer(state: State, a: Action): State {
  switch (a.type) {
    case 'step':
      return { ...state, step: a.step, undo: null };
    case 'addRows':
      return { ...state, rows: [...state.rows, ...a.rows], undo: null };
    case 'updateRow':
      return {
        ...state,
        rows: state.rows.map((r) => (r.id === a.id ? { ...r, ...a.patch } : r)),
        // 편집한 항목이 되돌리기 대상이면 스냅샷을 버린다(편집분이 사라지는 걸 막기 위함).
        undo: state.undo?.rows.some((r) => r.id === a.id) ? null : state.undo,
      };
    case 'resolveRow': {
      const i = state.rows.findIndex((r) => r.id === a.id);
      if (i < 0) return state; // 인식 도중 사용자가 지웠으면 무시
      const prev = state.rows[i];
      // 인식을 기다리는 동안 사용자가 직접 탭을 옮겼다면 그 선택을 AI 값으로 덮지 않는다.
      const patch = prev.routedBy === 'user'
        ? { ...a.patch, routing_hint: prev.routing_hint, category: prev.category || a.patch.category }
        : a.patch;
      const base = { ...prev, ...patch };
      return {
        ...state,
        // 같은 파일에서 나온 항목끼리 목록에서 붙어 있도록 원래 자리 바로 뒤에 넣는다.
        rows: [...state.rows.slice(0, i), base, ...a.extra, ...state.rows.slice(i + 1)],
        undo: state.undo?.rows.some((r) => r.id === a.id) ? null : state.undo,
      };
    }
    case 'removeRow':
      return {
        ...state,
        rows: state.rows.filter((r) => r.id !== a.id),
        undo: state.undo?.rows.some((r) => r.id === a.id) ? null : state.undo,
      };
    case 'moveRows': {
      const ids = new Set(a.ids);
      // 실제로 바뀌는 항목만 대상으로 삼는다(이미 그 탭이면 무시).
      const targets = state.rows.filter((r) => ids.has(r.id) && bucketOf(r) !== a.to);
      if (!targets.length) return state;
      const targetIds = new Set(targets.map((r) => r.id));
      return {
        ...state,
        rows: state.rows.map((r) => (targetIds.has(r.id) ? moveOne(r, a.to) : r)),
        undo: { to: a.to, rows: targets },
      };
    }
    case 'undoMove': {
      if (!state.undo) return state;
      const snap = new Map(state.undo.rows.map((r) => [r.id, r]));
      return { ...state, rows: state.rows.map((r) => snap.get(r.id) ?? r), undo: null };
    }
    case 'dismissUndo':
      return { ...state, undo: null };
    case 'setMeta':
      return { ...state, meta: { ...state.meta, ...a.patch } };
    case 'reset':
      return { ...initial, meta: state.meta };
    default:
      return state;
  }
}

const EMPTY_EXTRACTION: ReceiptExtraction = {
  merchant: '', biz_no: '', datetime: '', card_type: '', card_no_masked: '', approval_no: '',
  items: [], supply_amount: 0, vat: 0, total: 0, payment_method: 'unknown',
  routing_hint: 'personal_expense', account_suggestion: '', confidence: 0, matched_keywords: [], page: 0,
};

// 인식 결과를 행에 반영할 때 쓰는 공통 패치 (첫 번째 건·추가로 나온 건 모두 같은 규칙)
function extractionPatch(ex: ReceiptExtraction): Partial<Row> {
  return {
    ...ex,
    status: 'done',
    errorMsg: undefined,
    retryable: undefined,
    category: ex.account_suggestion,
    // 사용자가 금액을 고쳐도 인식값으로 되돌릴 수 있게 원본을 남긴다.
    aiTotal: ex.total,
    // 주유/주차 영수증은 인식 금액을 주차료 칸에 자동 채움
    ...(ex.routing_hint === 'fuel' ? { parking: ex.total } : {}),
  };
}

// 같은 파일에서 두 번째 이후로 나온 건이 물려받으면 안 되는 사용자 입력값(재시도한 행에 남아 있을 수 있다)
const BLANK_INPUT = {
  note: '', category: '' as Category | '', remark: '',
  purpose: '', destination: '', distanceKm: null, toll: 0, parking: 0, etc: 0,
  origin: undefined, dest: undefined, routeSig: undefined, distanceAuto: false, tollAuto: false,
  confirmed: false, routedBy: 'ai' as const, parkingAuto: false,
} satisfies Partial<Row>;

function newRow(file: File, fileKey: string): Row {
  const pdf = isPdf(file);
  const url = URL.createObjectURL(file);
  return {
    ...EMPTY_EXTRACTION,
    id: crypto.randomUUID(),
    fileName: file.name,
    fileKey,
    // PDF 는 <img> 로 못 그리므로 첫 페이지 렌더링이 끝난 뒤에 previewUrl 을 채운다.
    previewUrl: pdf ? undefined : url,
    fileUrl: url,
    fileType: pdf ? 'application/pdf' : file.type || 'image/jpeg',
    pageCount: 0,
    status: 'processing',
    note: '', category: '', remark: '',
    purpose: '', destination: '', distanceKm: null, toll: 0, parking: 0, etc: 0,
    confirmed: false,
    routedBy: 'ai', parkingAuto: false,
  };
}

// 사용자가 직접 추가하는 빈 주유대(개인 자차 출장) 항목.
function blankFuelRow(): Row {
  return {
    ...EMPTY_EXTRACTION,
    id: crypto.randomUUID(),
    fileName: '',
    fileType: '',
    pageCount: 0,
    status: 'done',
    routing_hint: 'fuel',
    note: '', category: '', remark: '',
    purpose: '', destination: '', distanceKm: null, toll: 0, parking: 0, etc: 0,
    origin: DEFAULT_ORIGIN, // 출발지 기본값(회사)
    confirmed: false,
    routedBy: 'user', parkingAuto: false,
  };
}

// 확정 청구 데이터 → 서버 /api/export·/api/approval/draft 에 보낼 문서별 페이로드.
// 엑셀 다운로드와 전자결재 첨부가 항상 같은 내용이 되도록 한 곳에서 만든다.
async function buildClaimPayloads(rows: Row[], meta: Meta) {
  const personalRows = rows.filter((r) => r.routing_hint !== 'fuel' && r.status !== 'error');
  const fuelRows = rows.filter((r) => r.routing_hint === 'fuel' && r.status !== 'error');
  const claims: { kind: 'personal' | 'fuel'; data: unknown }[] = [];
  if (personalRows.length) {
    claims.push({
      kind: 'personal',
      data: {
        dept: meta.dept,
        name: meta.name,
        period: formatPeriod(meta.period),
        items: personalRows.map((r) => ({
          date: normalizeDate(r.datetime),
          detail: r.items.join(', '),
          vendor: r.merchant,
          note: r.note,
          amount: r.total,
          category: (r.category || '소모품비') as Category,
          remark: r.remark, // 비고는 웹 입력값만 (비우면 빈칸)
        })),
        images: await rowsToImages(personalRows),
      },
    });
  }
  if (fuelRows.length) {
    claims.push({
      kind: 'fuel',
      data: {
        name: meta.name,
        writeDate: todayISO(),
        period: formatPeriod(meta.period),
        ratePerKm: 310,
        items: fuelRows.map((r) => ({
          date: normalizeDate(r.datetime),
          purpose: r.purpose,
          destination: r.destination,
          distanceKm: r.distanceKm ?? 0,
          toll: r.toll,
          parking: r.parking || r.total || 0,
          etc: r.etc,
        })),
        images: await rowsToImages(fuelRows),
      },
    });
  }
  return { claims, personalRows, fuelRows };
}

// 영수증 미리보기(blob URL) → base64. 별지 첨부용.
// 같은 이미지에서 나온 항목(한 쪽에 영수증이 여러 건)은 한 장으로 묶어 중복 첨부를 막는다.
async function rowsToImages(rows: Row[]): Promise<{ name: string; base64: string; mediaType: string }[]> {
  const out: { name: string; base64: string; mediaType: string }[] = [];
  for (const g of groupByPreview(rows)) {
    if (!g.previewUrl) continue;
    try {
      const blob = await fetch(g.previewUrl).then((x) => x.blob());
      const base64 = await new Promise<string>((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(String(fr.result).split(',')[1] || '');
        fr.onerror = rej;
        fr.readAsDataURL(blob);
      });
      out.push({ name: g.name, base64, mediaType: blob.type });
    } catch {
      /* 이미지 변환 실패 시 건너뜀 */
    }
  }
  return out;
}

export interface StoreValue {
  step: Step;
  rows: Row[];
  meta: Meta;
  // derived
  personal: Row[];
  fuel: Row[];
  failed: Row[]; // 형식 미지원·인식 실패로 청구에서 빠진 파일
  subtotal: number;
  fuelTotal: number;
  categoryTotals: { category: Category; sum: number }[];
  needsReview: number;
  isProcessing: boolean;
  movedCount: number; // 사용자가 수동으로 분류를 바꾼 영수증 수
  // 파일 하나에서 여러 건이 나온 항목들: 행 id → { 몇 번째, 총 몇 건 }
  splitParts: Record<string, { index: number; count: number }>;
  splitCount: number; // 그렇게 나뉜 항목 수 (안내 문구 표시용)
  undo: { to: Bucket; count: number; rows: Row[] } | null;
  // actions
  setStep: (s: Step) => void;
  addFiles: (files: FileList | File[] | null) => Promise<void>;
  updateRow: (id: string, patch: Partial<Row>) => void;
  removeRow: (id: string) => void;
  retryRow: (id: string) => Promise<void>; // 실패한 파일 다시 인식
  moveRow: (id: string, to: Bucket) => void;
  moveRows: (ids: string[], to: Bucket) => void;
  undoMove: () => void;
  dismissUndo: () => void;
  addFuelEntry: () => string; // 주유대(자차 출장) 항목 직접 추가 → 새 행 id 반환
  setMeta: (patch: Partial<Meta>) => void;
  reset: () => void;
  download: () => Promise<void>;
  submitApproval: () => Promise<string>; // 하이웍스 기안 문서 생성 → 기안하기 팝업 URL 반환
}

const Ctx = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);

  // 되돌아보지 않고 최신 행 목록을 읽기 위한 참조(재시도 시 원본 행을 찾는 용도)
  const rowsRef = useRef(state.rows);
  rowsRef.current = state.rows;

  /**
   * 파일 한 개 처리: 형식 검증 → (PDF면) 1쪽 렌더 → 인식 → 나온 건 수만큼 항목 만들기.
   * 결제 건이 여러 개면 첫 번째 건은 원래 행에 채우고, 나머지는 바로 뒤에 새 항목으로 끼워 넣는다.
   */
  const processRow = useCallback(async (row: Row, file: File) => {
    const rowId = row.id;
    // 지원하지 않는 형식·크기는 API 호출 전에 걸러 이유를 그대로 보여준다.
    const reject = rejectReason(file);
    if (reject) {
      dispatch({ type: 'updateRow', id: rowId, patch: { status: 'error', errorMsg: reject, retryable: false } });
      return;
    }

    const pdf = isPdf(file);
    const pageUrls = new Map<number, string>();
    let pageCount = row.pageCount;
    // PDF 는 먼저 1쪽을 렌더링해 인식을 기다리는 동안에도 미리보기가 보이게 한다. 실패해도 인식은 계속.
    if (pdf) {
      try {
        const first = await renderPdfPages(file, [1]);
        pageCount = first.pageCount;
        for (const [p, url] of Object.entries(first.pages)) pageUrls.set(Number(p), url);
        dispatch({ type: 'updateRow', id: rowId, patch: { previewUrl: pageUrls.get(1), pageCount } });
      } catch {
        /* 렌더 실패 시 미리보기만 없음 */
      }
    }

    try {
      const list = await extractWithRetry(file);
      if (!list.length) throw new ExtractError('영수증을 찾지 못했어요.', true, 'no_receipt');

      // 모델이 실제 쪽 수를 넘는 번호(영수증 순번을 쪽 번호로 착각 등)를 돌려줄 수 있다.
      // 렌더러(renderPdfPages)와 같은 규칙으로 맞춰야 렌더한 이미지를 다시 찾을 수 있다.
      const pageOf = (ex: ReceiptExtraction) => {
        const p = Math.max(1, Math.round(ex.page) || 1);
        return pageCount > 0 ? Math.min(pageCount, p) : p; // 쪽 수를 모르면(1쪽 렌더 실패) 그대로 둔다
      };

      // 건마다 그 건이 있는 쪽을 미리보기로 쓴다(1쪽은 위에서 이미 렌더링했으므로 건너뜀).
      if (pdf) {
        const want = [...new Set(list.map(pageOf))].filter((p) => !pageUrls.has(p));
        if (want.length) {
          try {
            const more = await renderPdfPages(file, want);
            pageCount = more.pageCount || pageCount;
            for (const [p, url] of Object.entries(more.pages)) pageUrls.set(Number(p), url);
          } catch {
            /* 추가 쪽 렌더 실패 시 1쪽 미리보기로 대체 */
          }
        }
      }
      // PDF 는 해당 쪽 이미지, 이미지 파일은 원본 blob URL 을 그대로 공유한다.
      const previewFor = (ex: ReceiptExtraction) =>
        pdf ? (pageUrls.get(pageOf(ex)) ?? pageUrls.get(1) ?? row.previewUrl) : row.previewUrl;
      // 화면 배지가 "3쪽 중 4쪽" 처럼 말이 안 되게 나오지 않도록 보정한 쪽 번호를 저장한다.
      const pagePatch = (ex: ReceiptExtraction) => (pdf ? { page: pageOf(ex) } : {});

      const [first, ...rest] = list;
      dispatch({
        type: 'resolveRow',
        id: rowId,
        patch: { ...extractionPatch(first), ...pagePatch(first), pageCount, previewUrl: previewFor(first) },
        extra: rest.map((ex) => ({
          ...row, // 파일 정보(fileKey·fileUrl·fileType·fileName)를 그대로 물려받는다
          ...BLANK_INPUT,
          ...extractionPatch(ex),
          ...pagePatch(ex),
          id: crypto.randomUUID(),
          pageCount,
          previewUrl: previewFor(ex),
        })),
      });
    } catch (e) {
      dispatch({
        type: 'updateRow',
        id: rowId,
        patch: {
          status: 'error',
          errorMsg: (e as Error).message,
          retryable: e instanceof ExtractError ? e.retryable : true,
        },
      });
    }
  }, []);

  const addFiles = useCallback(async (input: FileList | File[] | null) => {
    const files = input ? Array.from(input) : [];
    if (!files.length) return;
    dispatch({ type: 'step', step: 'processing' });
    const pending = files.map((f) => newRow(f, crypto.randomUUID()));
    pending.forEach((row, i) => fileByKey.set(row.fileKey!, files[i]));
    dispatch({ type: 'addRows', rows: pending });
    await runPool(pending, (row, i) => processRow(row, files[i]));
    dispatch({ type: 'step', step: 'review' });
  }, [processRow]);

  // 실패한 파일 다시 시도 (원본 파일을 그대로 재사용)
  const retryRow = useCallback(async (id: string) => {
    const row = rowsRef.current.find((r) => r.id === id);
    const file = row?.fileKey ? fileByKey.get(row.fileKey) : undefined;
    if (!row || !file) return;
    dispatch({ type: 'updateRow', id, patch: { status: 'processing', errorMsg: undefined } });
    await processRow({ ...row, status: 'processing' }, file);
  }, [processRow]);

  const updateRow = useCallback((id: string, patch: Partial<Row>) => dispatch({ type: 'updateRow', id, patch }), []);
  const removeRow = useCallback((id: string) => dispatch({ type: 'removeRow', id }), []);
  const setMeta = useCallback((patch: Partial<Meta>) => dispatch({ type: 'setMeta', patch }), []);
  const setStep = useCallback((s: Step) => dispatch({ type: 'step', step: s }), []);
  const reset = useCallback(() => dispatch({ type: 'reset' }), []);
  const moveRow = useCallback((id: string, to: Bucket) => dispatch({ type: 'moveRows', ids: [id], to }), []);
  const moveRows = useCallback((ids: string[], to: Bucket) => dispatch({ type: 'moveRows', ids, to }), []);
  const undoMove = useCallback(() => dispatch({ type: 'undoMove' }), []);
  const dismissUndo = useCallback(() => dispatch({ type: 'dismissUndo' }), []);
  const addFuelEntry = useCallback(() => {
    const row = blankFuelRow();
    dispatch({ type: 'addRows', rows: [row] });
    return row.id;
  }, []);

  const derived = useMemo(() => {
    const rows = state.rows;
    // 읽지 못한 파일은 청구 목록에서 빼고 따로 안내한다(빈 항목이 섞이는 걸 방지).
    const failed = rows.filter((r) => r.status === 'error');
    const usable = rows.filter((r) => r.status !== 'error');
    const personal = usable.filter((r) => r.routing_hint !== 'fuel');
    const fuel = usable.filter((r) => r.routing_hint === 'fuel');
    const subtotal = personal.reduce((s, r) => s + (r.total || 0), 0);
    const fuelTotal = fuel.reduce((s, r) => s + fuelSubtotal(r), 0);
    const categoryTotals = CATEGORIES.map((category) => ({
      category,
      sum: personal.filter((r) => r.category === category).reduce((s, r) => s + (r.total || 0), 0),
    })).filter((x) => x.sum > 0);
    const needsReview =
      personal.filter((r) => r.status === 'done' && (!r.category || confidenceBand(r.confidence) !== 'high' || !r.note.trim())).length +
      fuel.filter((r) => r.status === 'done' && (!r.purpose.trim() || !r.destination.trim() || !r.distanceKm)).length;
    const isProcessing = rows.some((r) => r.status === 'processing');
    const movedCount = rows.filter((r) => r.routedBy === 'user' && !!r.fileName).length;
    // 한 파일에서 여러 건이 나온 경우 "N건 중 몇 번째"를 표시하기 위한 색인
    const splitParts: Record<string, { index: number; count: number }> = {};
    const byFile = new Map<string, Row[]>();
    for (const r of rows) {
      if (!r.fileKey) continue;
      const list = byFile.get(r.fileKey);
      if (list) list.push(r);
      else byFile.set(r.fileKey, [r]);
    }
    for (const list of byFile.values()) {
      if (list.length < 2) continue;
      list.forEach((r, i) => {
        splitParts[r.id] = { index: i + 1, count: list.length };
      });
    }
    const splitCount = Object.keys(splitParts).length;
    return {
      personal, fuel, failed, subtotal, fuelTotal, categoryTotals,
      needsReview, isProcessing, movedCount, splitParts, splitCount,
    };
  }, [state.rows]);

  const download = useCallback(async () => {
    const { claims } = await buildClaimPayloads(state.rows, state.meta);
    for (const c of claims) await exportDoc(c.kind, c.data);
  }, [state.rows, state.meta]);

  // 하이웍스 전자결재 상신: 회사 품의 양식 본문 + 엑셀·영수증 원본 첨부로 기안 문서를 만들고
  // 기안하기 팝업 URL 을 돌려준다. 실제 상신은 팝업에서 결재선 지정 후 [기안하기].
  const submitApproval = useCallback(async (): Promise<string> => {
    const { claims, personalRows, fuelRows } = await buildClaimPayloads(state.rows, state.meta);
    if (!claims.length) throw new Error('상신할 청구 내역이 없어요.');
    // 영수증 원본 파일(이미지·PDF)도 문서에 함께 첨부한다.
    // 한 파일에서 여러 항목이 나왔어도 원본은 한 번만 붙인다.
    const attachments: { file_name: string; file: string }[] = [];
    const attached = new Set<string>();
    for (const r of [...personalRows, ...fuelRows]) {
      if (!r.fileKey || attached.has(r.fileKey)) continue;
      const f = fileByKey.get(r.fileKey);
      if (!f) continue;
      attached.add(r.fileKey);
      const { base64 } = await fileToBase64(f);
      attachments.push({ file_name: f.name, file: base64 });
    }
    const personalTotal = personalRows.reduce((s, r) => s + (r.total || 0), 0);
    const fuelTotal = fuelRows.reduce((s, r) => s + fuelSubtotal(r), 0);
    const { subject, contents } = buildApprovalForm({
      meta: state.meta,
      personalTotal,
      fuelTotal,
      excelLabels: claims.map((c) => claimFileLabel(c.kind, state.meta.name)),
      receiptCount: attachments.length,
    });
    const { loginUrl } = await createApprovalDraft({ subject, contents, claims, attachments });
    return loginUrl;
  }, [state.rows, state.meta]);

  const value: StoreValue = {
    step: state.step,
    rows: state.rows,
    meta: state.meta,
    ...derived,
    undo: state.undo ? { to: state.undo.to, count: state.undo.rows.length, rows: state.undo.rows } : null,
    setStep, addFiles, updateRow, removeRow, retryRow, moveRow, moveRows, undoMove, dismissUndo,
    addFuelEntry, setMeta, reset, download, submitApproval,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): StoreValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore must be used within <StoreProvider>');
  return v;
}
