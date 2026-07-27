'use client';

import React, { useState } from 'react';
import { useStore } from '@/lib/store';
import { won } from '@/lib/types';
import { Button, Callout } from '@/components/primitives';
import { Check } from '@/components/icons';

export function DoneScreen() {
  const { personal, fuel, subtotal, fuelTotal, download, reset, setStep, submitApproval } = useStore();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 팝업 차단을 피하려고 클릭 시점에 창을 먼저 열고, 기안 문서가 만들어지면 그 창을 이동시킨다.
  const onSubmit = () => {
    if (submitting) return;
    const popup = window.open('about:blank', '_blank');
    setSubmitting(true);
    setError(null);
    submitApproval()
      .then((loginUrl) => {
        if (popup) popup.location.href = loginUrl;
        else window.open(loginUrl, '_blank');
        setSubmitted(true);
      })
      .catch((e) => {
        popup?.close();
        setError((e as Error).message);
      })
      .finally(() => setSubmitting(false));
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '80px 24px',
        gap: 20,
      }}
    >
      <div
        style={{
          width: 88,
          height: 88,
          borderRadius: 999,
          background: 'var(--success-bg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--primary)',
        }}
      >
        <Check size={44} color="var(--primary)" strokeWidth={2.5} />
      </div>

      <h1 style={{ fontSize: 26, fontWeight: 700, textAlign: 'center', margin: 0 }}>
        청구서 완성! 결재 올릴 준비 됐어요
      </h1>

      <p
        style={{
          fontSize: 15,
          color: 'var(--text-secondary)',
          textAlign: 'center',
          margin: 0,
        }}
      >
        개인경비 {personal.length}건·{won(subtotal)}, 주유대 {fuel.length}건·{won(fuelTotal)}으로 정리했어요. 영수증은 별지에 첨부됐어요.
      </p>

      <div style={{ display: 'flex', gap: 8 }}>
        <Button variant="primary" onClick={onSubmit} disabled={submitting}>
          {submitting ? '기안 문서 만드는 중…' : '전자결재 상신'}
        </Button>
        <Button variant="secondary" onClick={() => download()}>
          엑셀 다시 받기
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            reset();
            setStep('upload');
          }}
        >
          새 청구서 만들기
        </Button>
      </div>

      {submitted && (
        <Callout tone="success" icon="✓">
          하이웍스 기안 창을 열었어요. 창에서 결재선을 지정하고 [기안하기]를 눌러야 상신이 완료돼요.
        </Callout>
      )}
      {error && (
        <Callout tone="danger" icon="!">
          {error}
        </Callout>
      )}
    </div>
  );
}
