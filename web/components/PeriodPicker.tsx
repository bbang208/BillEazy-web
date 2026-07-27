'use client';

// 날짜 선택 팝오버 모음. 두 컴포넌트 모두 직접 타이핑 수정을 그대로 지원한다.
// - PeriodPicker: 기간(시작~끝) 범위 선택 → '2026년 7월 1일 ~ 2026년 7월 31일' 텍스트로 저장
// - DateField: 단일 일자 선택(개인경비 사용일자·주유대 일자) → 'YYYY/MM/DD' 로 전달
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { normalizeDate } from '@/lib/date';
import { ChevronLeft, ChevronRight } from '@/components/icons';

function koreanDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${y}년 ${m}월 ${d}일`;
}

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

const todayIso = () => {
  const d = new Date();
  return iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
};

// 자유 문자열에서 날짜(최대 2개)를 뽑아 [시작, 끝] ISO 로
function parseRange(value: string): string[] {
  const m = value.match(/\d{2,4}\s*[./\-,]\s*\d{1,2}\s*[./\-,]\s*\d{1,4}|\d{2,4}\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일/g) ?? [];
  return m.map((s) => normalizeDate(s)).filter(Boolean).slice(0, 2).sort();
}

type View = { y: number; m: number };

const viewOf = (isoDate?: string | null): View => {
  const base = isoDate ? new Date(isoDate) : new Date();
  return { y: base.getFullYear(), m: base.getMonth() + 1 };
};

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

// 바깥 클릭·Esc 로 닫기
function useDismiss(ref: React.RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [ref, open, close]);
}

// 월 이동 헤더 + 요일 + 날짜 그리드. 날짜별 강조는 stateOf 로 결정한다.
function Calendar({
  view, setView, stateOf, onPick, onHover, footer,
}: {
  view: View;
  setView: React.Dispatch<React.SetStateAction<View>>;
  stateOf: (d: string) => { edge?: boolean; inRange?: boolean };
  onPick: (d: string) => void;
  onHover?: (d: string) => void;
  footer?: React.ReactNode;
}) {
  const days = useMemo(() => {
    const first = new Date(view.y, view.m - 1, 1).getDay();
    const count = new Date(view.y, view.m, 0).getDate();
    return [...Array(first).fill(null), ...Array.from({ length: count }, (_, i) => iso(view.y, view.m, i + 1))];
  }, [view]);
  const today = todayIso();
  const moveMonth = (delta: number) =>
    setView((v) => {
      const d = new Date(v.y, v.m - 1 + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() + 1 };
    });

  return (
    <div
      style={{
        position: 'absolute', top: '100%', left: 0, marginTop: 6, zIndex: 30, width: 292,
        background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 12,
        boxShadow: '0 8px 24px rgba(0,0,0,.12)', padding: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <button type="button" onClick={() => moveMonth(-1)} style={navBtn} aria-label="이전 달">
          <ChevronLeft size={16} />
        </button>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
          {view.y}년 {view.m}월
        </span>
        <button type="button" onClick={() => moveMonth(1)} style={navBtn} aria-label="다음 달">
          <ChevronRight size={16} />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {WEEKDAYS.map((w, i) => (
          <span
            key={w}
            style={{
              textAlign: 'center', fontSize: 11, fontWeight: 600, padding: '4px 0',
              color: i === 0 ? 'var(--danger)' : 'var(--text-tertiary)',
            }}
          >
            {w}
          </span>
        ))}
        {days.map((d, i) => {
          if (!d) return <span key={`b${i}`} />;
          const { edge, inRange } = stateOf(d);
          return (
            <button
              key={d}
              type="button"
              onClick={() => onPick(d)}
              onMouseEnter={() => onHover?.(d)}
              style={{
                border: 'none', cursor: 'pointer', borderRadius: 8, padding: '7px 0', fontSize: 13,
                background: edge ? 'var(--primary)' : inRange ? 'var(--primary-tint)' : 'transparent',
                color: edge ? 'var(--on-primary)' : 'var(--text)',
                fontWeight: d === today || edge ? 700 : 400,
                outline: d === today && !edge ? '1px solid var(--border-strong)' : 'none',
              }}
            >
              {Number(d.slice(8))}
            </button>
          );
        })}
      </div>

      {footer && <div style={{ display: 'flex', gap: 6, marginTop: 10, alignItems: 'center' }}>{footer}</div>}
    </div>
  );
}

const inputStyle = (ai?: boolean): React.CSSProperties => ({
  border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', fontSize: 14,
  color: 'var(--text)', background: ai ? 'var(--primary-tint)' : 'var(--surface)', outline: 'none', width: '100%',
});

/** 기간(시작~끝) 선택. 시작일 → 종료일 두 번 클릭, 이번 달/지난달 프리셋. */
export function PeriodPicker({
  label, value, onChange, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>(() => viewOf(parseRange(value)[0]));
  const [start, setStart] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  useDismiss(wrap, open, () => setOpen(false));

  const committed = useMemo(() => parseRange(value), [value]);

  const openCalendar = () => {
    setView(viewOf(parseRange(value)[0]));
    setStart(null);
    setHover(null);
    setOpen(true);
  };

  const commit = (a: string, b: string) => {
    const [s, e] = [a, b].sort();
    onChange(`${koreanDate(s)} ~ ${koreanDate(e)}`);
    setStart(null);
    setOpen(false);
  };

  const pickDay = (day: string) => {
    if (!start) {
      setStart(day);
      setHover(null);
      return;
    }
    commit(start, day);
  };

  const setMonthRange = (y: number, m: number) => {
    commit(iso(y, m, 1), iso(y, m, new Date(y, m, 0).getDate()));
  };

  // 범위 표시: 고르는 중이면 시작~호버, 아니면 저장된 값
  const [rangeS, rangeE] = start
    ? [start, hover ?? start].sort()
    : [committed[0], committed[1] ?? committed[0]];

  const now = new Date();
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  return (
    <div ref={wrap} style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onFocus={openCalendar}
        onClick={() => !open && openCalendar()}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle()}
      />
      {open && (
        <Calendar
          view={view}
          setView={setView}
          stateOf={(d) => ({
            edge: d === rangeS || d === rangeE,
            inRange: Boolean(rangeS && rangeE && d >= rangeS && d <= rangeE),
          })}
          onPick={pickDay}
          onHover={(d) => start && setHover(d)}
          footer={
            <>
              <button type="button" style={presetBtn} onClick={() => setMonthRange(now.getFullYear(), now.getMonth() + 1)}>
                이번 달
              </button>
              <button type="button" style={presetBtn} onClick={() => setMonthRange(prevMonth.getFullYear(), prevMonth.getMonth() + 1)}>
                지난달
              </button>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 'auto' }}>
                {start ? '종료일을 선택하세요' : '시작일을 선택하세요'}
              </span>
            </>
          }
        />
      )}
    </div>
  );
}

/** 단일 일자 선택(개인경비 사용일자·주유대 일자). 선택하면 'YYYY/MM/DD' 로 onChange 에 전달한다. */
export function DateField({
  label, value, onChange, placeholder, ai,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; ai?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = normalizeDate(value); // 표기 어떤 형식이든 첫 날짜를 해석
  const [view, setView] = useState<View>(() => viewOf(selected || null));
  const wrap = useRef<HTMLDivElement>(null);
  useDismiss(wrap, open, () => setOpen(false));

  const openCalendar = () => {
    setView(viewOf(normalizeDate(value) || null));
    setOpen(true);
  };

  const pick = (d: string) => {
    onChange(d.replace(/-/g, '/'));
    setOpen(false);
  };

  return (
    <div ref={wrap} style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
        {label}
        {ai && <span style={{ color: 'var(--primary)', fontSize: 11, fontWeight: 600 }}>AI 자동입력</span>}
      </span>
      <input
        value={value}
        placeholder={placeholder}
        onFocus={openCalendar}
        onClick={() => !open && openCalendar()}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle(ai)}
      />
      {open && (
        <Calendar
          view={view}
          setView={setView}
          stateOf={(d) => ({ edge: d === selected })}
          onPick={pick}
          footer={
            <button type="button" style={presetBtn} onClick={() => pick(todayIso())}>
              오늘
            </button>
          }
        />
      )}
    </div>
  );
}

const navBtn: React.CSSProperties = {
  border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: 8,
  width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer', color: 'var(--text-secondary)',
};

const presetBtn: React.CSSProperties = {
  border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: 8,
  padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: 'var(--text)',
};
