'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { Place } from '@/lib/types';
import { searchPlaces } from '@/lib/api';
import { MapPin, Search } from '@/components/icons';

/**
 * 네이버 지도 장소(POI) 검색 입력.
 * - 타이핑하면 300ms 디바운스로 후보를 조회해 드롭다운으로 보여준다.
 * - 후보를 고르면 onSelect(place) — 좌표까지 확정.
 * - 직접 타이핑한 텍스트는 onText 로 흘려 목적지 문자열은 항상 유지(좌표 없이도 수동 입력 가능).
 */
export function PlaceSearch({
  label, value, onSelect, onText, required, placeholder, hint, disabled,
}: {
  label: string;
  value: string; // 현재 표시 텍스트(선택된 장소명 또는 수동 입력)
  onSelect: (p: Place) => void;
  onText?: (t: string) => void;
  required?: boolean;
  placeholder?: string;
  hint?: string; // 선택된 주소 등 보조 표시
  disabled?: boolean;
}) {
  const [q, setQ] = useState(value);
  const [results, setResults] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const acRef = useRef<AbortController | null>(null);
  const typed = useRef(false); // 사용자가 직접 입력했는지(값 프로그램 설정 시 검색 방지)
  const qRef = useRef(q);
  qRef.current = q;

  // 부모 value 변경(다른 행 선택 등) → 입력 동기화. 이때는 검색하지 않는다.
  // 단, onText 로 우리가 올린 값이 그대로 되돌아온 '에코'면 무시한다(타이핑 중 드롭다운이 닫히는 것 방지).
  useEffect(() => {
    if (value === qRef.current) return;
    typed.current = false;
    setQ(value);
    setOpen(false);
  }, [value]);

  // 바깥 클릭 시 닫기
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // 디바운스 검색 — 사용자가 직접 타이핑했을 때만.
  useEffect(() => {
    if (!typed.current) return;
    const term = q.trim();
    if (!term) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      acRef.current?.abort();
      const ac = new AbortController();
      acRef.current = ac;
      const list = await searchPlaces(term, ac.signal);
      setResults(list);
      setOpen(true);
      setLoading(false);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const pick = (p: Place) => {
    typed.current = false;
    setQ(p.name);
    setResults([]);
    setOpen(false);
    onSelect(p);
  };

  const border = required && !value.trim() ? 'var(--primary)' : 'var(--border)';

  return (
    <div ref={boxRef} style={{ display: 'flex', flexDirection: 'column', gap: 4, position: 'relative' }}>
      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{label}</span>
      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', display: 'flex' }}>
          <Search size={15} />
        </span>
        <input
          value={q}
          disabled={disabled}
          placeholder={placeholder ?? '장소·상호명으로 검색'}
          onChange={(e) => {
            typed.current = true;
            setQ(e.target.value);
            onText?.(e.target.value);
          }}
          onFocus={() => results.length && setOpen(true)}
          style={{
            border: `1px solid ${border}`, borderRadius: 10, padding: '10px 12px 10px 34px', fontSize: 14,
            color: 'var(--text)', background: disabled ? 'var(--surface-alt)' : 'var(--surface)',
            outline: 'none', width: '100%',
          }}
        />
      </div>
      {hint && (
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <MapPin size={12} /> {hint}
        </span>
      )}

      {open && (
        <div
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, marginTop: 4,
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden',
          }}
        >
          {loading && results.length === 0 ? (
            <div style={{ padding: '12px 14px', fontSize: 13, color: 'var(--text-tertiary)' }}>검색 중…</div>
          ) : results.length === 0 ? (
            <div style={{ padding: '12px 14px', fontSize: 13, color: 'var(--text-tertiary)' }}>검색 결과가 없어요.</div>
          ) : (
            results.map((p, i) => (
              <button
                key={`${p.lng},${p.lat},${i}`}
                type="button"
                onClick={() => pick(p)}
                style={{
                  display: 'flex', flexDirection: 'column', gap: 2, width: '100%', textAlign: 'left',
                  padding: '10px 14px', background: 'transparent', border: 'none', cursor: 'pointer',
                  borderBottom: i === results.length - 1 ? 'none' : '1px solid var(--border)',
                }}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-alt)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <span style={{ fontSize: 14, color: 'var(--text)', fontWeight: 600 }}>{p.name}</span>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{p.roadAddress || p.address}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
