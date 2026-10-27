// The screens before their data arrives (D-084): the real toolbar's shape, with skeletons where
// the lists and the script will be, so nothing jumps when they land.
import { navigate } from '../router';
import { Icon } from './Icons';
import { EpisodesSkeleton, RowsSkeleton, ScriptSkeleton } from './Skeleton';

/** Home while its list loads, before we know who's signed in. */
export function HomeLoading() {
  return (
    <div className="app is-home" aria-busy="true">
      <header className="toolbar home-tb">
        <div className="lgrp slide">
          <span className="title">Home</span>
        </div>
      </header>
      <div className="body">
        <aside className="left" aria-label="Your scripts">
          <div className="in slide">
            <RowsSkeleton widths={['58%', '44%', '64%', '50%']} />
          </div>
        </aside>
        <main className="center">
          <div className="in slide">
            <div className="home">
              <EpisodesSkeleton />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

/** A script while its episode, drafts and document load. Back works already. */
export function ScriptLoading({ title }: { title: string | null }) {
  return (
    <div className="app" aria-busy="true">
      <header className="toolbar">
        <div className="lgrp slide">
          <button
            type="button"
            className="ib"
            title="Back to home"
            aria-label="Back to home"
            onClick={() => navigate('/')}
          >
            <Icon name="back" />
          </button>
          <button
            type="button"
            className="ib"
            title="Hide sidebar"
            aria-label="Hide sidebar"
            aria-disabled="true"
          >
            <Icon name="side" />
          </button>
          {title ? (
            <span className="title">{title}</span>
          ) : (
            <span className="sk-wrap" style={{ width: 140 }} aria-hidden="true">
              <span className="sk title" style={{ width: '100%', margin: 0 }} />
            </span>
          )}
        </div>
      </header>
      <div className="body">
        <aside className="left" aria-label="Script navigator">
          <div className="in slide">
            <div className="tabs" role="tablist">
              <span className="ta tab on" data-t="Scenes">
                Scenes
              </span>
              <span className="ta tab" data-t="Drafts">
                Drafts
              </span>
            </div>
            <RowsSkeleton />
          </div>
        </aside>
        <main className="center">
          <div className="in slide">
            <div className="desk">
              <div className="page">
                <ScriptSkeleton />
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
