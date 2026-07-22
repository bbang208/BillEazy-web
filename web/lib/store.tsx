'use client';

import React, { createContext, useCallback, useContext, useMemo, useReducer } from 'react';
import {
  Bucket, CATEGORIES, Category, Meta, ReceiptExtraction, Row, Step,
  bucketOf, confidenceBand, fuelSubtotal,
} from './types';
import { extractReceipt, exportDoc } from './api';

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
  | { type: 'removeRow'; id: string }
  | { type: 'moveRows'; ids: string[]; to: Bucket }
  | { type: 'undoMove' }
  | { type: 'dismissUndo' }
  | { type: 'setMeta'; patch: Partial<Meta> }
  | { type: 'reset' };

const initial: State = {
  step: 'upload',
  rows: [],
  meta: { dept: '연구소', name: '', period: '' },
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
  routing_hint: 'personal_expense', account_suggestion: '', confidence: 0, matched_keywords: [],
};

function newRow(file: File): Row {
  return {
    ...EMPTY_EXTRACTION,
    id: crypto.randomUUID(),
    fileName: file.name,
    previewUrl: URL.createObjectURL(file),
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
    status: 'done',
    routing_hint: 'fuel',
    note: '', category: '', remark: '',
    purpose: '', destination: '', distanceKm: null, toll: 0, parking: 0, etc: 0,
    confirmed: false,
    routedBy: 'user', parkingAuto: false,
  };
}

// 영수증 미리보기(blob URL) → base64. 별지 첨부용.
async function rowsToImages(rows: Row[]): Promise<{ name: string; base64: string; mediaType: string }[]> {
  const out: { name: string; base64: string; mediaType: string }[] = [];
  for (const r of rows) {
    if (!r.previewUrl) continue;
    try {
      const blob = await fetch(r.previewUrl).then((x) => x.blob());
      const base64 = await new Promise<string>((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(String(fr.result).split(',')[1] || '');
        fr.onerror = rej;
        fr.readAsDataURL(blob);
      });
      out.push({ name: r.merchant || r.fileName, base64, mediaType: blob.type });
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
  subtotal: number;
  fuelTotal: number;
  categoryTotals: { category: Category; sum: number }[];
  needsReview: number;
  isProcessing: boolean;
  movedCount: number; // 사용자가 수동으로 분류를 바꾼 영수증 수
  undo: { to: Bucket; count: number; rows: Row[] } | null;
  // actions
  setStep: (s: Step) => void;
  addFiles: (files: FileList | File[] | null) => Promise<void>;
  updateRow: (id: string, patch: Partial<Row>) => void;
  removeRow: (id: string) => void;
  moveRow: (id: string, to: Bucket) => void;
  moveRows: (ids: string[], to: Bucket) => void;
  undoMove: () => void;
  dismissUndo: () => void;
  addFuelEntry: () => string; // 주유대(자차 출장) 항목 직접 추가 → 새 행 id 반환
  setMeta: (patch: Partial<Meta>) => void;
  reset: () => void;
  download: () => Promise<void>;
}

const Ctx = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);

  const addFiles = useCallback(async (input: FileList | File[] | null) => {
    const files = input ? Array.from(input) : [];
    if (!files.length) return;
    dispatch({ type: 'step', step: 'processing' });
    const pending = files.map(newRow);
    dispatch({ type: 'addRows', rows: pending });
    await Promise.all(
      pending.map(async (row, i) => {
        try {
          const ex = await extractReceipt(files[i]);
          dispatch({
            type: 'updateRow',
            id: row.id,
            patch: {
              ...ex,
              status: 'done',
              category: ex.account_suggestion,
              // 주유/주차 영수증은 인식 금액을 주차료 칸에 자동 채움
              ...(ex.routing_hint === 'fuel' ? { parking: ex.total } : {}),
            },
          });
        } catch (e) {
          dispatch({ type: 'updateRow', id: row.id, patch: { status: 'error', errorMsg: (e as Error).message } });
        }
      }),
    );
    dispatch({ type: 'step', step: 'review' });
  }, []);

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
    const personal = rows.filter((r) => r.routing_hint !== 'fuel');
    const fuel = rows.filter((r) => r.routing_hint === 'fuel');
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
    return { personal, fuel, subtotal, fuelTotal, categoryTotals, needsReview, isProcessing, movedCount };
  }, [state.rows]);

  const download = useCallback(async () => {
    const personalRows = state.rows.filter((r) => r.routing_hint !== 'fuel' && r.status !== 'error');
    const fuelRows = state.rows.filter((r) => r.routing_hint === 'fuel' && r.status !== 'error');
    if (personalRows.length) {
      await exportDoc('personal', {
        dept: state.meta.dept,
        name: state.meta.name,
        period: state.meta.period,
        items: personalRows.map((r) => ({
          date: (r.datetime || '').slice(0, 10),
          detail: r.items.join(', '),
          vendor: r.merchant,
          note: r.note,
          amount: r.total,
          category: (r.category || '소모품비') as Category,
          remark: r.remark, // 비고는 웹 입력값만 (비우면 빈칸)
        })),
        images: await rowsToImages(personalRows),
      });
    }
    if (fuelRows.length) {
      await exportDoc('fuel', {
        name: state.meta.name,
        writeDate: new Date().toISOString().slice(0, 10),
        period: state.meta.period,
        ratePerKm: 310,
        items: fuelRows.map((r) => ({
          date: (r.datetime || '').slice(0, 10),
          purpose: r.purpose,
          destination: r.destination,
          distanceKm: r.distanceKm ?? 0,
          toll: r.toll,
          parking: r.parking || r.total || 0,
          etc: r.etc,
        })),
        images: await rowsToImages(fuelRows),
      });
    }
  }, [state.rows, state.meta]);

  const value: StoreValue = {
    step: state.step,
    rows: state.rows,
    meta: state.meta,
    ...derived,
    undo: state.undo ? { to: state.undo.to, count: state.undo.rows.length, rows: state.undo.rows } : null,
    setStep, addFiles, updateRow, removeRow, moveRow, moveRows, undoMove, dismissUndo,
    addFuelEntry, setMeta, reset, download,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): StoreValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore must be used within <StoreProvider>');
  return v;
}
