'use client';

import React, { useState } from 'react';
import { useStore } from '@/lib/store';
import { won, fuelAmount, fuelSubtotal, isPdfRow, Row } from '@/lib/types';
import { Button, Callout, Segmented, CatBadge } from '@/components/primitives';
import { Download, FileText } from '@/components/icons';

type Doc = 'personal' | 'fuel' | 'attach';

const cellBase: React.CSSProperties = {
  padding: '9px 10px',
  fontSize: 13,
  color: 'var(--text)',
  borderRight: '1px solid var(--border)',
  borderBottom: '1px solid var(--border)',
  display: 'flex',
  alignItems: 'center',
  minWidth: 0,
  overflow: 'hidden',
};

function ReceiptBox({ r, height }: { r: Row; height: number }) {
  return (
    <div
      style={{
        width: '100%',
        height,
        borderRadius: 10,
        border: '1px solid var(--border)',
        background: 'var(--surface-alt)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        fontSize: 40,
      }}
    >
      {r.previewUrl ? (
        <img src={r.previewUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : isPdfRow(r) ? (
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-tertiary)' }}>
          <FileText size={32} /> PDF (미리보기 없음)
        </span>
      ) : (
        <span>🧾</span>
      )}
    </div>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{value || '—'}</span>
    </div>
  );
}

export function PreviewScreen() {
  const { personal, fuel, subtotal, fuelTotal, categoryTotals, meta, setStep, download } = useStore();
  const [doc, setDoc] = useState<Doc>('personal');

  const sheetStyle: React.CSSProperties = {
    maxWidth: 900,
    margin: '0 auto',
    background: 'var(--surface)',
    borderRadius: 12,
    border: '1px solid var(--border)',
    boxShadow: '0 12px 32px #00000014',
    padding: 40,
  };

  const catShown = categoryTotals.filter((c) => c.sum > 0);
  const attachRows = [...personal, ...fuel];

  return (
    <div style={{ padding: '0 24px 40px' }}>
      {/* 툴바 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
          padding: '12px 24px',
          flexWrap: 'wrap',
        }}
      >
        <Segmented<Doc>
          options={[
            { label: '개인경비 청구서', value: 'personal' },
            { label: '주유대 청구 양식', value: 'fuel' },
            { label: '영수증 별지', value: 'attach' },
          ]}
          value={doc}
          onChange={setDoc}
        />
        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="secondary" onClick={() => setStep('review')}>
            수정하러 돌아가기
          </Button>
          <Button
            variant="primary"
            onClick={async () => {
              await download();
              setStep('done');
            }}
          >
            <Download size={16} /> 엑셀 다운로드(.xlsx)
          </Button>
        </div>
      </div>

      <Callout tone="success" icon="✓" style={{ maxWidth: 900, margin: '0 auto 20px' }}>
        개인경비 {personal.length}건·{won(subtotal)} / 주유대 {fuel.length}건·{won(fuelTotal)}
      </Callout>

      {/* 미리보기 시트 */}
      <div style={sheetStyle}>
        {doc === 'personal' && <PersonalDoc personal={personal} subtotal={subtotal} catShown={catShown} meta={meta} />}
        {doc === 'fuel' && <FuelDoc fuel={fuel} fuelTotal={fuelTotal} meta={meta} />}
        {doc === 'attach' && <AttachDoc rows={attachRows} />}
      </div>
    </div>
  );
}

/* ---------------- 개인경비 청구서 ---------------- */

function PersonalDoc({
  personal,
  subtotal,
  catShown,
  meta,
}: {
  personal: Row[];
  subtotal: number;
  catShown: { category: any; sum: number }[];
  meta: { dept: string; name: string; period: string };
}) {
  const cols = '96px 1.5fr 1fr 1fr 110px 120px 1fr';
  const headers = ['사용일자', '사용내역', '거래처', '적요', '사용금액', '계정과목', '비고'];

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, textAlign: 'center', margin: '0 0 24px', color: 'var(--text)' }}>
        업무관련 개인경비 사용 명세서
      </h2>

      {/* 메타 + 결재란 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <MetaItem label="부서명" value={meta.dept} />
          <MetaItem label="성명" value={meta.name} />
          <MetaItem label="지출 기간" value={meta.period} />
        </div>
        <div style={{ display: 'flex' }}>
          {['작성', '담당', '팀장'].map((label) => (
            <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 3 }}>{label}</div>
              <div style={{ width: 70, height: 54, border: '1px dashed var(--border-strong)', borderRadius: 4 }} />
            </div>
          ))}
        </div>
      </div>

      {/* 표 */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: cols, background: 'var(--surface-alt)' }}>
          {headers.map((h, i) => (
            <div
              key={h}
              style={{
                ...cellBase,
                fontWeight: 700,
                fontSize: 12,
                color: 'var(--text-secondary)',
                justifyContent: i === 4 ? 'flex-end' : 'flex-start',
                borderRight: i === headers.length - 1 ? 'none' : cellBase.borderRight,
              }}
            >
              {h}
            </div>
          ))}
        </div>

        {personal.length === 0 ? (
          <div style={{ padding: '32px 12px', textAlign: 'center', fontSize: 13, color: 'var(--text-tertiary)' }}>
            개인경비 내역이 없습니다.
          </div>
        ) : (
          personal.map((r) => (
            <div key={r.id} style={{ display: 'grid', gridTemplateColumns: cols }}>
              <div style={cellBase}>{r.datetime.slice(0, 10)}</div>
              <div style={cellBase}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.items.join(', ')}
                </span>
              </div>
              <div style={cellBase}>{r.merchant}</div>
              <div style={cellBase}>{r.note}</div>
              <div style={{ ...cellBase, justifyContent: 'flex-end', fontWeight: 600 }}>{won(r.total)}</div>
              <div style={cellBase}>{r.category ? <CatBadge category={r.category} /> : '—'}</div>
              <div style={{ ...cellBase, borderRight: 'none' }}>{r.remark}</div>
            </div>
          ))
        )}
      </div>

      {/* 합계 영역 */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <div style={{ minWidth: 320, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-secondary)' }}>
            <span>소계</span>
            <span style={{ fontWeight: 600, color: 'var(--text)' }}>{won(subtotal)}</span>
          </div>
          {catShown.map((c) => (
            <div key={c.category} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
              <CatBadge category={c.category} />
              <span style={{ color: 'var(--text-secondary)' }}>{won(c.sum)}</span>
            </div>
          ))}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              borderTop: '1px solid var(--border-strong)',
              paddingTop: 8,
              marginTop: 2,
              fontSize: 15,
              fontWeight: 700,
              color: 'var(--text)',
            }}
          >
            <span>합 계</span>
            <span>{won(subtotal)}</span>
          </div>
        </div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 24 }}>
        · 식대 인당 8,000원&nbsp;&nbsp;&nbsp;· 현금 3만원 초과 시 현금영수증/카드
      </div>
    </div>
  );
}

/* ---------------- 주유대 청구 양식 ---------------- */

function FuelDoc({
  fuel,
  fuelTotal,
  meta,
}: {
  fuel: Row[];
  fuelTotal: number;
  meta: { dept: string; name: string; period: string };
}) {
  const cols = '90px 1fr 1fr 74px 96px 84px 84px 84px 100px';
  const headers = ['일자', '목적', '목적지', '거리(km)', '금액', '톨비', '주차료', '직접입력', '소계'];
  const rightCols = new Set([3, 4, 5, 6, 7, 8]);

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, textAlign: 'center', margin: '0 0 24px', color: 'var(--text)' }}>
        주유대 청구 양식
      </h2>

      <div style={{ display: 'flex', gap: 32, marginBottom: 20, flexWrap: 'wrap' }}>
        <MetaItem label="성명" value={meta.name} />
        <MetaItem label="작성일자" value={new Date().toISOString().slice(0, 10)} />
        <MetaItem label="기간" value={meta.period} />
        <MetaItem label="단가" value="310원/km" />
      </div>

      {fuel.length === 0 ? (
        <div
          style={{
            padding: '40px 12px',
            textAlign: 'center',
            fontSize: 13,
            color: 'var(--text-tertiary)',
            border: '1px dashed var(--border)',
            borderRadius: 8,
          }}
        >
          주유대 청구 내역이 없습니다.
        </div>
      ) : (
        <>
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: cols, background: 'var(--surface-alt)' }}>
              {headers.map((h, i) => (
                <div
                  key={h}
                  style={{
                    ...cellBase,
                    fontWeight: 700,
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                    justifyContent: rightCols.has(i) ? 'flex-end' : 'flex-start',
                    borderRight: i === headers.length - 1 ? 'none' : cellBase.borderRight,
                  }}
                >
                  {h}
                </div>
              ))}
            </div>

            {fuel.map((r) => (
              <div key={r.id} style={{ display: 'grid', gridTemplateColumns: cols }}>
                <div style={cellBase}>{r.datetime.slice(0, 10)}</div>
                <div style={cellBase}>{r.purpose}</div>
                <div style={cellBase}>{r.destination}</div>
                <div style={{ ...cellBase, justifyContent: 'flex-end' }}>{r.distanceKm ?? 0}</div>
                <div style={{ ...cellBase, justifyContent: 'flex-end' }}>{won(fuelAmount(r))}</div>
                <div style={{ ...cellBase, justifyContent: 'flex-end' }}>{won(r.toll)}</div>
                <div style={{ ...cellBase, justifyContent: 'flex-end' }}>{won(r.parking)}</div>
                <div style={{ ...cellBase, justifyContent: 'flex-end' }}>{won(r.etc)}</div>
                <div style={{ ...cellBase, justifyContent: 'flex-end', fontWeight: 600, borderRight: 'none' }}>
                  {won(fuelSubtotal(r))}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 40,
                minWidth: 260,
                fontSize: 15,
                fontWeight: 700,
                color: 'var(--text)',
                borderTop: '1px solid var(--border-strong)',
                paddingTop: 8,
              }}
            >
              <span>합 계</span>
              <span>{won(fuelTotal)}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------- 영수증 별지 ---------------- */

function AttachDoc({ rows }: { rows: Row[] }) {
  return (
    <div>
      <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 20px', color: 'var(--text)' }}>별지 · 영수증 첨부</h3>

      {rows.length === 0 ? (
        <div style={{ padding: '40px 12px', textAlign: 'center', fontSize: 13, color: 'var(--text-tertiary)' }}>
          첨부할 영수증이 없습니다.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20 }}>
          {rows.map((r, i) => (
            <div key={r.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <ReceiptBox r={r} height={220} />
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                영수증 #{i + 1} {r.merchant}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
