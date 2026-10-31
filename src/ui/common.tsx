import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from 'react';
import { LEVELS, LKEYS } from '../engine';
import type { LevelKey } from '../engine/types';
import { store } from '../state/store';

/** Re-render on every store change; returns the store. */
export function useStore() {
  useSyncExternalStore(store.subscribe, store.getVersion);
  return store;
}

export function LvTag({ k }: { k: LevelKey }) {
  const lv = LEVELS[k];
  return (
    <span className="lv">
      <i style={{ background: lv.color }} />
      {lv.short}
    </span>
  );
}

export function LevelSelect({ value, onChange, label, id }: { value: LevelKey; onChange: (k: LevelKey) => void; label?: string; id?: string }) {
  return (
    <select id={id} value={value} aria-label={label} onChange={(e) => onChange(e.target.value as LevelKey)}>
      {LKEYS.map((k) => (
        <option key={k} value={k}>
          {LEVELS[k].short} · {LEVELS[k].heb}
        </option>
      ))}
    </select>
  );
}

/** A button that needs a second click within 4 seconds, for deletes. */
export function ArmButton({ label, armedLabel = 'לחצו שוב', onConfirm, className = 'btn sm ghost' }: { label: string; armedLabel?: string; onConfirm: () => void; className?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      className={className + (armed ? ' pri' : '')}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else setArmed(true);
      }}
    >
      {armed ? armedLabel : label}
    </button>
  );
}

const commitKeys = (commit: () => void) => (e: KeyboardEvent<HTMLInputElement>) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    commit();
  }
};

/** Number field that commits on Enter or when leaving the field, and follows the stored value otherwise. */
export function NumInput({ value, onCommit, min, max, step, id, label }: { value: number; onCommit: (v: number) => void; min?: number; max?: number; step?: number; id?: string; label?: string }) {
  const [txt, setTxt] = useState(String(value));
  useEffect(() => setTxt(String(value)), [value]);
  const commit = () => {
    let v = +txt;
    if (txt.trim() === '' || isNaN(v)) return setTxt(String(value));
    if (min != null) v = Math.max(min, v);
    if (max != null) v = Math.min(max, v);
    if (v !== value) onCommit(v);
    else setTxt(String(value));
  };
  return <input type="number" id={id} aria-label={label} value={txt} min={min} max={max} step={step} onChange={(e) => setTxt(e.target.value)} onBlur={commit} onKeyDown={commitKeys(commit)} />;
}

/** HH:MM field; commits on Enter, on leaving the field, or when cleared. */
export function TimeInput({ value, onCommit, label, ...rest }: { value: string; onCommit: (v: string) => void; label: string } & Record<string, unknown>) {
  const [txt, setTxt] = useState(value);
  const last = useRef(value);
  useEffect(() => {
    setTxt(value);
    last.current = value;
  }, [value]);
  const commit = () => {
    if (txt === last.current) return;
    last.current = txt;
    onCommit(txt);
  };
  return <input type="time" aria-label={label} value={txt} onChange={(e) => setTxt(e.target.value)} onBlur={commit} onKeyDown={commitKeys(commit)} {...rest} />;
}

export const Note = ({ children, style }: { children: ReactNode; style?: React.CSSProperties }) => (
  <p className="note" style={style}>
    {children}
  </p>
);
