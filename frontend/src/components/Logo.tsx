import { Link } from 'react-router';

export function Logo({ size = 'md', to = '/' }: { size?: 'md' | 'lg'; to?: string }) {
  const iconSize = size === 'lg' ? 'h-14 w-14' : 'h-9 w-9';
  const textSize = size === 'lg' ? 'text-4xl' : 'text-2xl';
  return (
    <Link to={to} className="flex items-center gap-3">
      <img src="/brand/foodlog-icon.svg" alt="" className={iconSize} />
      <span className={`${textSize} font-display font-bold tracking-tight`}>
        Foodlog <span className="text-accent">I/O</span>
      </span>
    </Link>
  );
}
