'use client';

import React from 'react';
import { CAT_COLOR, CATEGORIES, CATEGORY_DESC, Category, CONF_COLOR, CONF_LABEL, confidenceBand } from '@/lib/types';
import { AlertTriangle, Check, Info, RotateCcw, X } from './icons';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  variant = 'primary', children, onClick, disabled, full, style, type,
}: {
  variant?: Variant; children: React.ReactNode; onClick?: () => void;
  disabled?: boolean; full?: boolean; style?: React.CSSProperties; type?: 'button' | 'submit';
}) {
  const base: React.CSSProperties = {
    borderRadius: 10, padding: '11px 18px', fontSize: 14, fontWeight: 600,
    border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
    width: full ? '100%' : undefined, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    transition: 'background .12s',
  };
  const skins: Record<Variant, React.CSSProperties> = {
    primary: { background: 'var(--primary)', color: 'var(--on-primary)' },
    secondary: { background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border-strong)' },
    ghost: { background: 'transparent', color: 'var(--text-secondary)' },
    danger: { background: 'var(--danger)', color: '#fff' },
  };
  return (
    <button type={type ?? 'button'} onClick={onClick} disabled={disabled} style={{ ...base, ...skins[variant], ...style }}>
      {children}
    </button>
  );
}

export function Card({ children, style, onClick }: { children: React.ReactNode; style?: React.CSSProperties; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16,
        padding: 24, boxShadow: '0 4px 12px #0000000f', ...style,
      }}
    >
      {children}
    </div>
  );
}

type Tone = 'info' | 'warning' | 'success' | 'danger';
const TONE_BG: Record<Tone, string> = { info: 'var(--info-bg)', warning: 'var(--warning-bg)', success: 'var(--success-bg)', danger: 'var(--danger-bg)' };
const TONE_FG: Record<Tone, string> = { info: 'var(--info)', warning: 'var(--warning)', success: 'var(--success)', danger: 'var(--danger)' };

const TONE_ICON: Record<Tone, React.ComponentType<{ size?: number }>> = {
  info: Info,
  warning: AlertTriangle,
  success: Check,
  danger: AlertTriangle,
};

export function Callout({ tone = 'info', icon, children, style }: { tone?: Tone; icon?: string; children: React.ReactNode; style?: React.CSSProperties }) {
  const Ic = TONE_ICON[tone];
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: TONE_BG[tone], borderRadius: 10, padding: 14, fontSize: 13, color: 'var(--text)', ...style }}>
      <span style={{ color: TONE_FG[tone], display: 'flex', marginTop: 1, flexShrink: 0 }}><Ic size={18} /></span>
      <div>{children}</div>
    </div>
  );
}

export function Badge({ color, bg, children, style }: { color: string; bg?: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <span style={{ borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 600, color, background: bg ?? `${color}20`, whiteSpace: 'nowrap', ...style }}>
      {children}
    </span>
  );
}

export function CatBadge({ category }: { category: Category }) {
  return <Badge color={CAT_COLOR[category]}>{category}</Badge>;
}

export function ConfidenceBadge({ confidence }: { confidence: number }) {
  const band = confidenceBand(confidence);
  return <Badge color={CONF_COLOR[band]}>{CONF_LABEL[band]}</Badge>;
}

export function Field({
  label, value, onChange, placeholder, ai, required, readOnly, right, type = 'text', width,
}: {
  label?: string; value: string | number; onChange?: (v: string) => void; placeholder?: string;
  ai?: boolean; required?: boolean; readOnly?: boolean; right?: boolean; type?: string; width?: number | string;
}) {
  const border = required && !String(value).trim() ? 'var(--primary)' : 'var(--border)';
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, width, position: 'relative' }}>
      {label && (
        <span style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
          {label}
          {ai && <span style={{ color: 'var(--primary)', fontSize: 11, fontWeight: 600 }}>AI 자동입력</span>}
        </span>
      )}
      <input
        type={type}
        value={value}
        readOnly={readOnly}
        placeholder={placeholder}
        onChange={(e) => onChange?.(e.target.value)}
        style={{
          border: `1px solid ${border}`, borderRadius: 10, padding: '10px 12px', fontSize: 14,
          color: readOnly ? 'var(--text-secondary)' : 'var(--text)',
          background: ai ? 'var(--primary-tint)' : readOnly ? 'var(--surface-alt)' : 'var(--surface)',
          outline: 'none', textAlign: right ? 'right' : 'left', fontWeight: right ? 600 : 400, width: '100%',
        }}
      />
    </label>
  );
}

export function TextArea({ label, value, onChange, placeholder, required }: { label?: string; value: string; onChange: (v: string) => void; placeholder?: string; required?: boolean }) {
  const border = required && !value.trim() ? 'var(--primary)' : 'var(--border)';
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {label && <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{label}</span>}
      <textarea
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        style={{
          border: `1px solid ${border}`, borderRadius: 10, padding: '10px 12px', fontSize: 14,
          color: 'var(--text)', background: required && !value.trim() ? 'var(--primary-tint)' : 'var(--surface)',
          outline: 'none', resize: 'vertical', fontFamily: 'inherit',
        }}
      />
    </label>
  );
}

export function CategorySelect({ value, onChange }: { value: Category | ''; onChange: (c: Category) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as Category)}
      style={{
        border: `1px solid ${value ? 'var(--border)' : 'var(--danger)'}`, borderRadius: 10, padding: '9px 12px',
        fontSize: 14, background: value ? 'var(--surface)' : 'var(--danger-bg)', color: 'var(--text)', outline: 'none',
      }}
    >
      <option value="">계정과목 선택</option>
      {CATEGORIES.map((c) => (
        <option key={c} value={c}>{c} · {CATEGORY_DESC[c]}</option>
      ))}
    </select>
  );
}

export function Segmented<T extends string>({
  options, value, onChange, size = 'md', full,
}: {
  options: { label: string; value: T; count?: number; icon?: React.ReactNode }[];
  value: T; onChange: (v: T) => void; size?: 'sm' | 'md'; full?: boolean;
}) {
  const sm = size === 'sm';
  return (
    <div style={{ display: full ? 'flex' : 'inline-flex', gap: 4, background: 'var(--surface-alt)', borderRadius: 10, padding: 4 }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            style={{
              border: 'none', borderRadius: 7, padding: sm ? '6px 12px' : '7px 14px', fontSize: sm ? 13 : 14,
              fontWeight: 600, cursor: 'pointer', flex: full ? 1 : undefined,
              background: active ? 'var(--primary)' : 'transparent', color: active ? 'var(--on-primary)' : 'var(--text-secondary)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              transition: 'background .12s, color .12s',
            }}
          >
            {o.icon}
            {o.label}
            {o.count != null && (
              <span style={{ fontSize: 12, borderRadius: 999, padding: '0 7px', background: active ? '#ffffff33' : 'var(--border)', color: active ? '#fff' : 'var(--text-secondary)' }}>
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function Divider() {
  return <div style={{ height: 1, background: 'var(--border)' }} />;
}

/** 카드 안에 겹쳐 놓는 작은 버튼. 부모 카드의 클릭(선택)과 겹치지 않게 이벤트를 멈춘다. */
export function ChipButton({
  children, onClick, title, tone = 'default',
}: {
  children: React.ReactNode; onClick: () => void; title?: string; tone?: 'default' | 'primary';
}) {
  const primary = tone === 'primary';
  return (
    <button
      title={title}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
        border: `1px solid ${primary ? 'var(--primary)' : 'var(--border-strong)'}`,
        background: primary ? 'var(--primary-tint)' : 'var(--surface)',
        color: primary ? 'var(--primary)' : 'var(--text-secondary)',
        borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <span
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => { e.stopPropagation(); onChange(!checked); }}
      style={{
        width: 18, height: 18, borderRadius: 5, flexShrink: 0, cursor: 'pointer',
        border: `1.5px solid ${checked ? 'var(--primary)' : 'var(--border-strong)'}`,
        background: checked ? 'var(--primary)' : 'var(--surface)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
      }}
    >
      {checked && <Check size={12} />}
    </span>
  );
}

/** 화면 하단 중앙 토스트 (되돌리기 안내용) */
export function Toast({
  children, actionLabel, onAction, onClose,
}: {
  children: React.ReactNode; actionLabel?: string; onAction?: () => void; onClose?: () => void;
}) {
  return (
    <div
      style={{
        // 중앙 카드의 버튼을 가리지 않도록 좌측 하단에 띄운다.
        position: 'fixed', left: 24, bottom: 24, zIndex: 50,
        display: 'flex', alignItems: 'center', gap: 14,
        background: 'var(--text)', color: '#fff', borderRadius: 12, padding: '12px 14px 12px 18px',
        boxShadow: '0 12px 32px #0000002e', fontSize: 14, maxWidth: 'calc(100vw - 32px)',
      }}
    >
      <span>{children}</span>
      {actionLabel && (
        <button
          onClick={onAction}
          style={{
            border: 'none', background: '#ffffff1f', color: '#fff', borderRadius: 8,
            padding: '6px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 5,
          }}
        >
          <RotateCcw size={14} /> {actionLabel}
        </button>
      )}
      {onClose && (
        <button
          onClick={onClose}
          aria-label="닫기"
          style={{ border: 'none', background: 'transparent', color: '#ffffffa8', cursor: 'pointer', display: 'flex', padding: 2 }}
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}

export function Dot({ color }: { color: string }) {
  return <span style={{ width: 8, height: 8, borderRadius: 8, background: color, display: 'inline-block', flexShrink: 0 }} />;
}
