export function bytes(n: number): string {
  if (n < 1000) return `${n} B`;
  if (n < 1e6) return `${Math.round(n / 1e3)} KB`;
  const mb = n / 1e6;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}
export const pictures = (n: number) => `${n} picture${n === 1 ? '' : 's'}`;
export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif'];
