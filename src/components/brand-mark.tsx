import { cn } from '@/lib/utils';

type Props = {
  size?: number;
  showWordmark?: boolean;
  className?: string;
};

export function BrandMark({ size = 28, showWordmark = false, className }: Props) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 256 256"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Junction"
      >
        <rect width="256" height="256" rx="56" fill="#008566" />
        <path
          d="M168 76V152C168 175.196 149.196 194 126 194H124C100.804 194 82 175.196 82 152"
          stroke="white"
          strokeWidth="20"
          strokeLinecap="round"
        />
        <circle cx="168" cy="76" r="8" fill="white" />
      </svg>
      {showWordmark && (
        <span className="text-base font-semibold tracking-tight text-foreground">Junction</span>
      )}
    </div>
  );
}
