interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}

const sizes = { sm: 'w-4 h-4', md: 'w-8 h-8', lg: 'w-12 h-12' };
const borders = { sm: 'border-2', md: 'border-2', lg: 'border-3' };

export default function LoadingSpinner({ size = 'md', label }: LoadingSpinnerProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3">
      <div
        className={`${sizes[size]} ${borders[size]} border-apple-gray-3 border-t-apple-blue rounded-full animate-spin`}
      />
      {label && <p className="text-sm text-apple-text-secondary">{label}</p>}
    </div>
  );
}

export function FullPageLoader({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center min-h-64">
      <LoadingSpinner size="lg" label={label || 'Analyse wird berechnet...'} />
    </div>
  );
}
