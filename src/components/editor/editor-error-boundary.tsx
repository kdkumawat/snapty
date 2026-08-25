'use client';

import React from 'react';
import { useEditorStore } from '@/store/editor-store';

type Props = { children: React.ReactNode };
type State = { error: Error | null };

/**
 * In-editor error boundary. Renders a small, scrim-free recovery card inside
 * the editor chrome (does not unmount the toolbar / action cluster). Resets
 * the next time the user successfully loads a new image, so they don't have
 * to refresh the page after a Konva hiccup.
 */
export class EditorErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Editor canvas crashed:', error, info);
  }

  reset = () => {
    this.setState({ error: null });
  };

  componentDidUpdate(_prev: Props, prevState: State) {
    if (!prevState.error) return;
    // The boundary resets as soon as a new image is loaded - the Konva tree
    // and the draft layer are rebuilt from scratch by the dynamic import.
    const dataURL = useEditorStore.getState().imageDataURL;
    if (dataURL) this.reset();
  }

  render() {
    if (this.state.error) {
      return (
        <div
          role="alert"
          className="absolute inset-0 z-[200] flex items-center justify-center bg-canvas/85 backdrop-blur-sm"
        >
          <div className="max-w-sm w-[calc(100%-2rem)] rounded-2xl floating-surface p-5 space-y-3 text-center">
            <p className="text-sm font-semibold">The editor hit a snag</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              The canvas stopped responding. Open a new image to start fresh -
              your in-progress work is preserved locally.
            </p>
            <button
              type="button"
              onClick={this.reset}
              className="h-9 px-4 rounded-lg bg-accent text-accent-foreground text-xs font-semibold hover:opacity-90 transition-opacity"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
