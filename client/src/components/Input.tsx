import React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-2 w-full">
        {label && <label className="text-sm font-medium neon-label">{label}</label>}
        <input
          ref={ref}
          className={cn(
            'w-full min-w-0 px-4 py-3 rounded-xl bg-secondary/50 border',
            'text-foreground placeholder:text-muted-foreground',
            'focus:outline-none transition-all duration-200',
            'neon-input',
            error && 'border-destructive',
            className
          )}
          {...props}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }
);
Input.displayName = 'Input';
