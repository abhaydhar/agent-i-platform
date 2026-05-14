import { useMemo, useState } from 'react';
import type { Agent, InputParam } from '@/types';

interface AgentFormProps {
  agent: Agent;
  submitting?: boolean;
  onSubmit: (values: Record<string, unknown>) => void;
}

type FormValues = Record<string, unknown>;
type FormErrors = Record<string, string>;

function defaultValueFor(param: InputParam): unknown {
  if (param.default !== undefined) return param.default;
  switch (param.type) {
    case 'boolean':
      return false;
    case 'number':
      return '';
    case 'multiselect':
      return [];
    default:
      return '';
  }
}

function buildInitialValues(params: InputParam[]): FormValues {
  return params.reduce<FormValues>((acc, p) => {
    acc[p.name] = defaultValueFor(p);
    return acc;
  }, {});
}

function validate(params: InputParam[], values: FormValues): FormErrors {
  const errs: FormErrors = {};
  for (const p of params) {
    const v = values[p.name];
    if (p.required) {
      const empty =
        v === undefined ||
        v === null ||
        v === '' ||
        (Array.isArray(v) && v.length === 0);
      if (empty) {
        errs[p.name] = `${p.label ?? p.name} is required`;
        continue;
      }
    }
    if (p.type === 'number' && v !== '' && v !== undefined && v !== null) {
      const n = Number(v);
      if (Number.isNaN(n)) {
        errs[p.name] = 'Must be a number';
      } else {
        if (p.min !== undefined && n < p.min) errs[p.name] = `Min is ${p.min}`;
        if (p.max !== undefined && n > p.max) errs[p.name] = `Max is ${p.max}`;
      }
    }
  }
  return errs;
}

function normalizeForSubmit(
  params: InputParam[],
  values: FormValues
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const p of params) {
    let v = values[p.name];
    if (p.type === 'number') {
      v = v === '' || v === null || v === undefined ? undefined : Number(v);
    } else if (p.type === 'paths') {
      const raw = String(v ?? '');
      v = raw
        .split(/\r?\n|,/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
    out[p.name] = v;
  }
  return out;
}

export function AgentForm({ agent, submitting, onSubmit }: AgentFormProps) {
  const initial = useMemo(
    () => buildInitialValues(agent.input_params),
    [agent.input_params]
  );
  const [values, setValues] = useState<FormValues>(initial);
  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  function setField(name: string, value: unknown) {
    setValues((prev) => ({ ...prev, [name]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const allTouched: Record<string, boolean> = {};
    agent.input_params.forEach((p) => (allTouched[p.name] = true));
    setTouched(allTouched);

    const errs = validate(agent.input_params, values);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    onSubmit(normalizeForSubmit(agent.input_params, values));
  }

  function handleReset() {
    setValues(initial);
    setErrors({});
    setTouched({});
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {agent.input_params.map((param) => {
        const value = values[param.name];
        const err = touched[param.name] ? errors[param.name] : undefined;
        return (
          <div key={param.name}>
            <label className="field-label" htmlFor={`field-${param.name}`}>
              {param.label ?? param.name}
              {param.required ? (
                <span className="ml-1 text-red-500">*</span>
              ) : null}
            </label>
            <FieldInput
              id={`field-${param.name}`}
              param={param}
              value={value}
              onChange={(v) => setField(param.name, v)}
              onBlur={() =>
                setTouched((prev) => ({ ...prev, [param.name]: true }))
              }
            />
            {param.description ? (
              <p className="field-hint">{param.description}</p>
            ) : null}
            {err ? <p className="mt-1 text-xs text-red-600">{err}</p> : null}
          </div>
        );
      })}

      <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-4">
        <button
          type="button"
          className="btn-ghost"
          onClick={handleReset}
          disabled={submitting}
        >
          Reset
        </button>
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? 'Running...' : 'Run agent'}
        </button>
      </div>
    </form>
  );
}

interface FieldInputProps {
  id: string;
  param: InputParam;
  value: unknown;
  onChange: (v: unknown) => void;
  onBlur: () => void;
}

function FieldInput({ id, param, value, onChange, onBlur }: FieldInputProps) {
  switch (param.type) {
    case 'text':
      return (
        <textarea
          id={id}
          rows={4}
          className="field-input font-mono"
          placeholder={param.placeholder}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
        />
      );
    case 'paths':
      return (
        <textarea
          id={id}
          rows={4}
          className="field-input font-mono text-xs"
          placeholder={param.placeholder ?? 'One path or glob per line'}
          value={
            Array.isArray(value)
              ? (value as string[]).join('\n')
              : String(value ?? '')
          }
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
        />
      );
    case 'number':
      return (
        <input
          id={id}
          type="number"
          className="field-input"
          placeholder={param.placeholder}
          value={value === undefined || value === null ? '' : String(value)}
          min={param.min}
          max={param.max}
          step={param.step ?? 1}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
        />
      );
    case 'boolean':
      return (
        <label className="inline-flex items-center gap-2">
          <input
            id={id}
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            onBlur={onBlur}
          />
          <span className="text-sm text-slate-700">
            {param.placeholder ?? 'Enabled'}
          </span>
        </label>
      );
    case 'select':
      return (
        <select
          id={id}
          className="field-input"
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
        >
          {!param.required ? <option value="">— Select —</option> : null}
          {(param.options ?? []).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );
    case 'multiselect':
      return (
        <div className="flex flex-wrap gap-2">
          {(param.options ?? []).map((opt) => {
            const arr = Array.isArray(value) ? (value as string[]) : [];
            const checked = arr.includes(opt.value);
            return (
              <label
                key={opt.value}
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition ${
                  checked
                    ? 'bg-indigo-600 text-white ring-indigo-600'
                    : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={checked}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...arr, opt.value]
                      : arr.filter((v) => v !== opt.value);
                    onChange(next);
                  }}
                  onBlur={onBlur}
                />
                {opt.label}
              </label>
            );
          })}
        </div>
      );
    case 'string':
    default:
      return (
        <input
          id={id}
          type="text"
          className="field-input"
          placeholder={param.placeholder}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
        />
      );
  }
}
