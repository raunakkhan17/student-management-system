'use client';

import { AlertTriangle } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `destructive` styles the confirm button as a danger action. */
  variant?: 'default' | 'destructive';
  onConfirm: () => Promise<void> | void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm,
}: ConfirmDialogProps) {
  const [isWorking, setIsWorking] = useState(false);

  const handleConfirm = async () => {
    setIsWorking(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      // The caller surfaces failures; the dialog just stops spinning.
      setIsWorking(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={isWorking ? undefined : onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          {variant === 'destructive' && (
            <span className="bg-destructive-muted text-destructive grid size-11 place-items-center rounded-full">
              <AlertTriangle className="size-5" aria-hidden />
            </span>
          )}
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="text-muted-foreground text-sm">{description}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isWorking}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            disabled={isWorking}
            onClick={(event) => {
              // Keep the dialog open until the async action settles.
              event.preventDefault();
              void handleConfirm();
            }}
            className={cn(
              variant === 'destructive' &&
                'bg-destructive text-destructive-foreground hover:bg-destructive/90',
            )}
          >
            {isWorking ? 'Working…' : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Small helper for the common "open a confirm, remember the target row" pattern. */
export function useConfirmTarget<T>() {
  const [target, setTarget] = useState<T | null>(null);
  return {
    target,
    isOpen: target !== null,
    open: (value: T) => setTarget(value),
    close: () => setTarget(null),
    onOpenChange: (open: boolean) => {
      if (!open) setTarget(null);
    },
  };
}
