import { toast } from '@/hooks/use-toast';

/** Compact, theme-aware app toasts with clear copy. */
export function toastSuccess(title: string, description?: string) {
  return toast({
    title,
    description,
    variant: 'default',
    className: 'snapty-toast snapty-toast-success',
  });
}

export function toastError(title: string, description?: string) {
  return toast({
    title,
    description,
    variant: 'destructive',
    className: 'snapty-toast snapty-toast-error',
  });
}

export function toastInfo(title: string, description?: string) {
  return toast({
    title,
    description,
    variant: 'default',
    className: 'snapty-toast snapty-toast-info',
  });
}
