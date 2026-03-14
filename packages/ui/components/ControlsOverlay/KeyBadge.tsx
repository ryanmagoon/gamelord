import React from "react";

interface KeyBadgeProps {
  children: React.ReactNode;
  /** Optional button label displayed below the badge. */
  label?: string;
  className?: string;
}

export function KeyBadge({ children, label, className }: KeyBadgeProps) {
  if (label) {
    return (
      <div className={`flex flex-col items-center gap-0.5 ${className ?? ""}`}>
        <kbd className="inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded bg-white/10 border border-white/20 text-xs font-mono font-medium text-white/90">
          {children}
        </kbd>
        <span className="text-[9px] text-white/40 leading-none">{label}</span>
      </div>
    );
  }

  return (
    <kbd
      className={`inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded bg-white/10 border border-white/20 text-xs font-mono font-medium text-white/90 ${className ?? ""}`}
    >
      {children}
    </kbd>
  );
}
