import type { InputParam, InputParamType } from '@/types';

const TYPES: InputParamType[] = [
  'string',
  'text',
  'number',
  'boolean',
  'select',
  'multiselect',
  'paths',
];

interface InputParamsEditorProps {
  value: InputParam[];
  onChange: (next: InputParam[]) => void;
}

export function InputParamsEditor({ value, onChange }: InputParamsEditorProps) {
  function update(idx: number, patch: Partial<InputParam>) {
    const next = value.slice();
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  }
  function remove(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }
  function add() {
    onChange([
      ...value,
      { name: `param_${value.length + 1}`, label: '', type: 'string' },
    ]);
  }

  return (
    <div className="space-y-3">
      {value.length === 0 ? (
        <p className="text-xs text-slate-500">
          No input parameters yet. Add one below.
        </p>
      ) : null}
      {value.map((p, idx) => (
        <div
          key={idx}
          className="rounded-md border border-slate-200 bg-slate-50/50 p-3"
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div>
              <label className="field-label text-xs">Name</label>
              <input
                className="field-input"
                value={p.name}
                onChange={(e) => update(idx, { name: e.target.value })}
              />
            </div>
            <div>
              <label className="field-label text-xs">Label</label>
              <input
                className="field-input"
                value={p.label ?? ''}
                onChange={(e) => update(idx, { label: e.target.value })}
              />
            </div>
            <div>
              <label className="field-label text-xs">Type</label>
              <select
                className="field-input"
                value={p.type}
                onChange={(e) =>
                  update(idx, { type: e.target.value as InputParamType })
                }
              >
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <label className="inline-flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={Boolean(p.required)}
                onChange={(e) =>
                  update(idx, { required: e.target.checked })
                }
              />
              Required
            </label>
            <div className="sm:col-span-2">
              <label className="field-label text-xs">Placeholder</label>
              <input
                className="field-input"
                value={p.placeholder ?? ''}
                onChange={(e) =>
                  update(idx, { placeholder: e.target.value })
                }
              />
            </div>
          </div>
          {(p.type === 'select' || p.type === 'multiselect') && (
            <div className="mt-2">
              <label className="field-label text-xs">
                Options (label=value, one per line)
              </label>
              <textarea
                rows={3}
                className="field-input font-mono text-xs"
                value={(p.options ?? [])
                  .map((o) => `${o.label}=${o.value}`)
                  .join('\n')}
                onChange={(e) => {
                  const opts = e.target.value
                    .split(/\r?\n/)
                    .map((line) => line.trim())
                    .filter(Boolean)
                    .map((line) => {
                      const [label, val] = line.split('=');
                      return {
                        label: (label ?? '').trim(),
                        value: (val ?? label ?? '').trim(),
                      };
                    });
                  update(idx, { options: opts });
                }}
              />
            </div>
          )}
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              className="text-xs font-medium text-red-600 hover:text-red-700"
              onClick={() => remove(idx)}
            >
              Remove parameter
            </button>
          </div>
        </div>
      ))}
      <button type="button" className="btn-secondary text-xs" onClick={add}>
        + Add parameter
      </button>
    </div>
  );
}
