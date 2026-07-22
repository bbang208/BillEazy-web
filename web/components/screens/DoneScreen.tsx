'use client';

import React from 'react';
import { useStore } from '@/lib/store';
import { won } from '@/lib/types';
import { Button } from '@/components/primitives';
import { Check } from '@/components/icons';

export function DoneScreen() {
  const { personal, fuel, subtotal, fuelTotal, download, reset, setStep } = useStore();

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
        <Button variant="primary" onClick={() => download()}>
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
    </div>
  );
}
