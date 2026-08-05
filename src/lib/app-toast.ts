import { toast } from '@/hooks/use-toast';

/** Lightweight helpers so call sites stay readable. */
export function toastSuccess(title: string, description?: string) {
  return toast({ title, description });
}

export function toastError(title: string, description?: string) {
  return toast({ title, description, variant: 'destructive' });
}

export function toastInfo(title: string, description?: string) {
  return toast({ title, description });
}
