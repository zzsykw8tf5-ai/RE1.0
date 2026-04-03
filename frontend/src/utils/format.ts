export function formatEur(value: number, decimals = 0): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatUSD(value: number, decimals = 0): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatPct(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)} %`;
}

export function formatPctDirect(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)} %`;
}

export function formatNum(value: number, decimals = 0): string {
  return new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatSqm(value: number): string {
  return `${formatNum(value, 0)} m²`;
}

export function formatSqft(value: number): string {
  return `${formatNum(value, 0)} sqft`;
}

export function formatMultiple(value: number): string {
  return `${value.toFixed(2)}x`;
}

export function formatIRR(value: number): string {
  return `${(value * 100).toFixed(1)} %`;
}

export function getRiskColor(score: number): string {
  if (score < 30) return 'text-apple-green';
  if (score < 55) return 'text-apple-orange';
  if (score < 75) return 'text-orange-600';
  return 'text-apple-red';
}

export function getRiskBg(score: number): string {
  if (score < 30) return 'bg-green-100 text-green-700';
  if (score < 55) return 'bg-orange-100 text-orange-700';
  if (score < 75) return 'bg-red-100 text-red-600';
  return 'bg-red-100 text-red-700';
}

export function getRiskLabel(score: number): string {
  if (score < 30) return 'Niedrig';
  if (score < 55) return 'Mittel';
  if (score < 75) return 'Erhöht';
  return 'Hoch';
}

export function propertyTypeLabel(type: string): string {
  const map: Record<string, string> = {
    RESIDENTIAL: 'Wohnen',
    OFFICE: 'Büro',
    RETAIL: 'Einzelhandel',
    INDUSTRIAL: 'Industrie',
    MIXED: 'Gemischt',
  };
  return map[type] || type;
}

export function sqmToSqft(sqm: number): number {
  return sqm * 10.7639;
}

export function eurToUsd(eur: number, rate = 1.08): number {
  return eur * rate;
}
