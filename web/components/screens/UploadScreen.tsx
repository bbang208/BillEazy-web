'use client';

import React, { useRef, useState } from 'react';
import { useStore } from '@/lib/store';
import { Button, Callout } from '@/components/primitives';
import { UploadCloud } from '@/components/icons';

export function UploadScreen() {
  const { addFiles, isProcessing } = useStore();
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    void addFiles(e.dataTransfer.files);
  };

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '64px 24px', textAlign: 'center' }}>
      <h1 style={{ fontSize: 30, fontWeight: 700, color: 'var(--text)', lineHeight: 1.35, margin: 0 }}>
        영수증만 던지세요. 청구서는 빌리지가 만들어요.
      </h1>
      <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginTop: 12, marginBottom: 0 }}>
        카드전표·주차·주유 영수증을 끌어다 놓으세요. AI가 자동으로 채워드려요.
      </p>

      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        style={{
          marginTop: 32,
          height: 320,
          borderRadius: 20,
          border: '2px dashed var(--primary)',
          background: 'var(--primary-tint)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          cursor: 'pointer',
          opacity: drag ? 0.85 : 1,
          transition: 'opacity .12s',
        }}
      >
        <UploadCloud size={48} color="var(--primary)" strokeWidth={1.75} />
        {isProcessing ? (
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>인식 중…</div>
        ) : (
          <>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>
              여기로 파일을 끌어다 놓으세요
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>또는</div>
            <div onClick={(e) => e.stopPropagation()}>
              <Button variant="primary" onClick={() => inputRef.current?.click()}>
                파일 선택
              </Button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
              JPG · PNG · WEBP / 여러 장 한번에
            </div>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => {
            void addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      <div style={{ marginTop: 20, textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Callout tone="info" icon="ℹ️">
          영수증은 자동으로 개인경비로 정리돼요 (주유·주차·톨은 여비교통비). 주유대(개인 자차로 출장 이동)는 검토 화면에서 직접 추가하세요.
        </Callout>
        <Callout tone="warning" icon="⚠️">
          · 식대는 인당 8,000원 기준이에요&nbsp;&nbsp;&nbsp;· 현금 3만원 초과 지출은 현금영수증 또는 카드로 결제해주세요.
        </Callout>
      </div>
    </div>
  );
}
