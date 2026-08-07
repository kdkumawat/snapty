import { redirect } from 'next/navigation';

/** Legacy /editor bookmarks → root editor. */
export default function EditorRoutePage() {
  redirect('/');
}
