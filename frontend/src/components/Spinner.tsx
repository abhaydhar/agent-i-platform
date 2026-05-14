interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}

const SIZE: Record<NonNullable<SpinnerProps['size']>, string> = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-10 w-10 border-[3px]',
};

export function Spinner({ size = 'md', label }: SpinnerProps) {
  return (
    <div className="inline-flex items-center gap-2" role="status">
      <span
        className={`${SIZE[size]} animate-spin rounded-full border-slate-200 border-t-indigo-600`}
        aria-hidden="true"
      />
      {label ? <span className="text-sm text-slate-600">{label}</span> : null}
    </div>
  );
}
