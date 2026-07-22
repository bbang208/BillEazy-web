'use client';

import React from 'react';
import { useStore } from '@/lib/store';
import { won, Row } from '@/lib/types';
import { Button, Card } from '@/components/primitives';
import { AlertTriangle, Check } from '@/components/icons';

export function ProcessingScreen() {
  const { rows, setStep, reset } = useStore();
  const total = rows.length;
  const done = rows.filter((r) => r.status === 'done').length;
  const pct = total ? (done / total) * 100 : 0;

  return (
    <div style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* 진행 배너 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>
            {total}장 중 {done}장 읽었어요
          </span>
          <Button
            variant="ghost"
            onClick={() => {
              reset();
              setStep('upload');
            }}
          >
            취소
          </Button>
        </div>
        <div style={{ height: 8, borderRadius: 999, background: 'var(--surface-alt)', overflow: 'hidden' }}>
          <div style={{ width: pct + '%', height: 8, borderRadius: 999, background: 'var(--primary)', transition: 'width .3s' }} />
        </div>
      </div>

      {/* 파일 카드 그리드 */}
      {total === 0 ? (
        <Card style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: 14 }}>
          아직 읽을 영수증이 없어요.
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {rows.map((r) => (
            <FileCard key={r.id} r={r} />
          ))}
        </div>
      )}

      {/* 하단 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>먼저 끝난 것부터 확인하셔도 돼요</span>
        <Button variant="primary" onClick={() => setStep('review')}>
          검토하러 가기
        </Button>
      </div>
    </div>
  );
}

function Thumb({ r }: { r: Row }) {
  return (
    <div
      style={{
        width: '100%', aspectRatio: '4 / 3', borderRadius: 10, overflow: 'hidden',
        background: 'var(--surface-alt)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 28, color: 'var(--text-tertiary)',
      }}
    >
      {r.previewUrl ? (
        <img src={r.previewUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        '🧾'
      )}
    </div>
  );
}

function FileCard({ r }: { r: Row }) {
  if (r.status === 'error') {
    return (
      <Card style={{ background: 'var(--danger-bg)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}><AlertTriangle size={16} color="var(--danger)" /> 글씨가 흐려서 못 읽었어요</div>
        {r.errorMsg && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.errorMsg}</div>}
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {r.fileName}
        </div>
      </Card>
    );
  }

  if (r.status === 'done') {
    return (
      <Card style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Thumb r={r} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: 'var(--success)', display: 'flex' }}><Check size={16} /></span>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {r.merchant || '상호 미확인'}
            </span>
          </div>
          <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 600 }}>{won(r.total)}</div>
        </div>
      </Card>
    );
  }

  // processing
  return (
    <Card style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Thumb r={r} />
      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {r.fileName}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ background: 'var(--surface-alt)', height: 12, borderRadius: 6, width: '80%' }} />
        <div style={{ background: 'var(--surface-alt)', height: 12, borderRadius: 6, width: '55%' }} />
        <div style={{ background: 'var(--surface-alt)', height: 12, borderRadius: 6, width: '65%' }} />
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>인식 중…</div>
    </Card>
  );
}
