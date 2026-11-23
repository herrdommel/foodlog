import { encode } from 'uqr';

export function QrCode({ value, label }: { value: string; label: string }) {
  const { data, size } = encode(value, { ecc: 'M', border: 2 });
  const squares: string[] = [];
  data.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) squares.push(`M${x} ${y}h1v1h-1z`);
    }),
  );
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      className="h-48 w-48 rounded-lg bg-white"
    >
      <path d={squares.join('')} fill="#000" />
    </svg>
  );
}
