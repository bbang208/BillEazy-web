'use client';

import React, { useState } from 'react';
import { useStore } from '@/lib/store';
import { won } from '@/lib/types';
import { Button, Callout } from '@/components/primitives';
import { Check, ExternalLink } from '@/components/icons';

export function DoneScreen() {
  const { personal, fuel, subtotal, fuelTotal, download, reset, setStep, submitApproval } = useStore();
  const [submitting, setSubmitting] = useState(false);
  const [loginUrl, setLoginUrl] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false); // 팝업이 차단돼 자동으로 못 연 경우
  const [error, setError] = useState<string | null>(null);

  // 팝업 차단을 피하려고 클릭 시점에 창을 먼저 열고, 기안 문서가 만들어지면 그 창을 이동시킨다.
  // 그래도 차단되면(popup=null) 아래에 직접 여는 링크를 보여준다.
  const onSubmit = () => {
    if (submitting) return;
    const popup = window.open('', '_blank');
    setSubmitting(true);
    setError(null);
    setLoginUrl(null);
    submitApproval()
      .then((url) => {
        setLoginUrl(url);
        setBlocked(!popup);
        if (popup) popup.location.href = url;
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

      {loginUrl && (
        <Callout tone={blocked ? 'warning' : 'success'} icon="✓" style={{ maxWidth: 560 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
            <span>
              {blocked
                ? '브라우저가 팝업을 차단해서 기안 창을 자동으로 열지 못했어요. 아래 버튼으로 직접 열어주세요.'
                : '하이웍스 기안 창을 열었어요. 창에서 결재선을 지정하고 [기안하기]를 눌러야 상신이 완료돼요.'}
            </span>
            <a
              href={loginUrl}
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 10,
                background: 'var(--primary)', color: 'var(--on-primary)', fontSize: 13, fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              <ExternalLink size={14} /> 기안 창 {blocked ? '열기' : '다시 열기'}
            </a>
          </div>
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
