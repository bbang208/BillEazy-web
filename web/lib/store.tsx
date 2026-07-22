'use client';

import React, { createContext, useCallback, useContext, useMemo, useReducer } from 'react';
import {
  CATEGORIES, Category, Meta, ReceiptExtraction, Row, Step,
  confidenceBand, fuelSubtotal,
} from './types';
import { extractReceipt, exportDoc } from './api';

interface State {
  step: Step;
  rows: Row[];
  meta: Meta;
}

type Action =
  | { type: 'step'; step: Step }
  | { type: 'addRows'; rows: Row[] }
  | { type: 'updateRow'; id: string; patch: Partial<Row> }
  | { type: 'removeRow'; id: string }
  | { type: 'moveRow'; id: string; to: 'personal' | 'fuel' }
  | { type: 'setMeta'; patch: Partial<Meta> }
  | { type: 'reset' };

const initial: State = {
  step: 'upload',
  rows: [],
  meta: { dept: '연구소', name: '', period: '' },
};

function reducer(state: State, a: Action): State {
  switch (a.type) {
    case 'step':
      return { ...state, step: a.step };
    case 'addRows':
      return { ...state, rows: [...state.rows, ...a.rows] };
    case 'updateRow':
      return { ...state, rows: state.rows.map((r) => (r.id === a.id ? { ...r, ...a.patch } : r)) };
    case 'removeRow':
      return { ...state, rows: state.rows.filter((r) => r.id !== a.id) };
    case 'moveRow':
      return {
        ...state,
        rows: state.rows.map((r) =>
          r.id === a.id
            ? {
                ...r,
                routing_hint: a.to === 'fuel' ? 'fuel' : 'personal_expense',
                // 주유대로 옮길 때 인식 금액을 주차료로 이월(비어있을 때만)
                parking: a.to === 'fuel' && !r.parking ? r.total : r.parking,
              }
            : r,
        ),
      };
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
  // actions
  setStep: (s: Step) => void;
  addFiles: (files: FileList | File[] | null) => Promise<void>;
  updateRow: (id: string, patch: Partial<Row>) => void;
  removeRow: (id: string) => void;
  moveRow: (id: string, to: 'personal' | 'fuel') => void;
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
  const moveRow = useCallback((id: string, to: 'personal' | 'fuel') => dispatch({ type: 'moveRow', id, to }), []);

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
    return { personal, fuel, subtotal, fuelTotal, categoryTotals, needsReview, isProcessing };
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
          remark: r.remark || r.approval_no,
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
    setStep, addFiles, updateRow, removeRow, moveRow, setMeta, reset, download,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): StoreValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore must be used within <StoreProvider>');
  return v;
}
