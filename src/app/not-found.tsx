import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main
      id="main-content"
      className="flex flex-1 items-center justify-center p-6 text-foreground"
    >
      <div className="max-w-sm w-full text-center space-y-4">
        <p className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground">
          404
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          The page you’re looking for doesn’t exist. Head back to the landing or jump
          straight into the editor.
        </p>
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button variant="outline" asChild>
            <Link href="/">Home</Link>
          </Button>
          <Button asChild>
            <Link href="/editor">Open editor</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
