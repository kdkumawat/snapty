'use client';

import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from '@/components/ui/toast';
import { useToast } from '@/hooks/use-toast';

export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider swipeDirection="right" duration={2800}>
      {toasts.map(({ id, title, description, action, className, ...props }) => (
        <Toast key={id} className={className} {...props}>
          <div className="grid gap-0.5 pr-2 min-w-0">
            {title && <ToastTitle className="text-[13px] font-semibold tracking-tight">{title}</ToastTitle>}
            {description && (
              <ToastDescription className="text-xs text-muted-foreground leading-snug">
                {description}
              </ToastDescription>
            )}
          </div>
          {action}
          <ToastClose />
        </Toast>
      ))}
      <ToastViewport className="sm:bottom-20 sm:right-4 p-3 md:max-w-[360px]" />
    </ToastProvider>
  );
}
