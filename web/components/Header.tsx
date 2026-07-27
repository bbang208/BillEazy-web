'use client';

import React, { useEffect, useState } from 'react';
import { STEPS } from '@/lib/types';
import { useStore } from '@/lib/store';
import { fetchUsage, type UsageInfo } from '@/lib/api';
import { HelpCircle, Receipt } from './icons';

export function Header() {
  const { step, meta } = useStore();
  const activeIdx = STEPS.findIndex((s) => s.key === step);
  // 이번 달 Claude API 사용 금액 (서버에 Admin 키가 있을 때만 표시)
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  useEffect(() => {
    fetchUsage().then(setUsage).catch(() => {});
  }, []);

  return (
    <header
      style={{
        height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px', background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        position: 'sticky', top: 0, zIndex: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 160 }}>
        <Receipt size={22} color="var(--primary)" />
        <b style={{ fontSize: 18 }}>빌리지</b>
      </div>

      <nav style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        {STEPS.map((s, i) => {
          const done = i < activeIdx;
          const current = i === activeIdx;
          return (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span
                style={{
                  width: 22, height: 22, borderRadius: 999, fontSize: 12, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: current ? 'var(--primary)' : done ? 'var(--primary-tint)' : 'var(--surface-alt)',
                  color: current ? 'var(--on-primary)' : done ? 'var(--primary)' : 'var(--text-tertiary)',
                }}
              >
                {done ? '✓' : i + 1}
              </span>
              <span style={{ fontSize: 13, fontWeight: current ? 700 : 500, color: current ? 'var(--text)' : 'var(--text-tertiary)' }}>
                {s.label}
              </span>
            </div>
          );
        })}
      </nav>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 160, justifyContent: 'flex-end' }}>
        {usage?.enabled && usage.costUsd != null && (
          <span
            title={`${Number(usage.month?.split('-')[1])}월 Claude API 사용 금액 (10분 단위 갱신)`}
            style={{
              fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap',
              background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 999, padding: '4px 10px',
            }}
          >
            Claude {Number(usage.month?.split('-')[1])}월 ${usage.costUsd.toFixed(2)}
          </span>
        )}
        <span style={{ color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex' }} title="유의사항"><HelpCircle size={18} /></span>
        <div style={{ width: 32, height: 32, borderRadius: 999, background: 'var(--primary-tint)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14 }}>
          {meta.name?.[0] ?? '방'}
        </div>
      </div>
    </header>
  );
}
