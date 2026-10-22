// Real-time collaboration end to end: two apps side by side in real Chromium, a real sync
// server (test/syncServer.ts) that tests can kill and restart, real key presses.
import { afterEach, describe, expect, it } from 'vitest';
import { commands, userEvent } from 'vitest/browser';
import {
  clickEndOf,
  mount,
  newEpisode,
  press,
  server,
  sleep,
  stored,
  type,
  undo,
  unmountAll,
  until,
  type MountedApp,
} from './helpers';

afterEach(async () => {
  unmountAll();
  await server('restart'); // in case a test left it down
});

const focusEnd = (app: MountedApp, line: number) => clickEndOf(line, app.host);
const same = (a: MountedApp, b: MountedApp) =>
  JSON.stringify(a.lines()) === JSON.stringify(b.lines());

describe('two browsers', () => {
  it('co-write a scene live, with each other’s avatar and caret', async () => {
    const ep = newEpisode();
    const maya = await mount('Maya', ep, 'left');
    const sam = await mount('Sam', ep, 'right');

    await focusEnd(maya, 0);
    await press('{Enter}');
    await type('int. kitchen - night');
    await press('{Enter}');
    await type('Rain hammers the window.');
    await until(() => same(maya, sam));
    expect(sam.lines()).toEqual([
      'scene_heading: int. kitchen - night',
      'action: Rain hammers the window.',
    ]);

    await focusEnd(sam, 1);
    await press('{Enter}{Tab}');
    await type('mara');
    await press('{Enter}');
    await type('We can still fix this.');
    await until(() => same(maya, sam));
    expect(maya.lines().slice(2)).toEqual(['character: mara', 'dialogue: We can still fix this.']);

    // Presence: each sees the other's avatar, and Sam's caret is in Maya's script.
    await until(() => maya.host.querySelector('.avatars .av')?.textContent === 'SA');
    expect(sam.host.querySelector('.avatars .av')?.textContent).toBe('MA');
    await until(() => maya.host.querySelector('.script .rc') !== null);
    expect(maya.host.querySelector('.rc .rc-name')?.textContent).toBe('Sam');
    await commands.clickAt('[data-slot="left"] .tab:nth-child(2)', 5, 5); // the Drafts tab
    await until(
      () => maya.host.querySelector('.left small')?.textContent === 'Editing now · You, Sam',
    );
  });

  it('undo is per writer: Maya’s undo never reverts Sam’s edit in the same line', async () => {
    const ep = newEpisode();
    const maya = await mount('Maya', ep, 'left');
    const sam = await mount('Sam', ep, 'right');
    await focusEnd(maya, 0);
    await type('Fog lifts.');
    await until(() => same(maya, sam));
    await focusEnd(sam, 0);
    await type(' A gull circles.');
    await until(() => same(maya, sam));
    await focusEnd(maya, 0);
    await undo();
    await until(() => same(maya, sam) && maya.lines()[0] === 'action:  A gull circles.');
  });
});

describe('server crash and offline work', () => {
  it('killing the server mid-typing loses nothing once it restarts', async () => {
    const ep = newEpisode();
    const maya = await mount('Maya', ep, 'left');
    const sam = await mount('Sam', ep, 'right');
    await focusEnd(maya, 0);

    const words = Array.from({ length: 60 }, (_, i) => `w${i}`);
    let crashed = false;
    for (const [i, w] of words.entries()) {
      await type(`${w} `);
      if (i === 25) {
        await server('kill'); // mid-typing
        crashed = true;
      }
      if (i === 40) {
        await until(() => maya.host.querySelector('.cue')?.textContent === 'Offline', 5000);
      }
    }
    expect(crashed).toBe(true);
    await server('restart');
    await until(() => !maya.host.querySelector('.cue') && !sam.host.querySelector('.cue'), 15_000);
    await until(() => same(maya, sam), 5000);

    const text = maya.lines()[0]!;
    for (const w of words) expect(text, w).toContain(`${w} `);
    const saved = await stored(ep);
    for (const w of words) expect(saved, w).toContain(`${w} `);
  });

  it('offline edits survive closing the tab, then merge when the server is back', async () => {
    const ep = newEpisode();
    const maya = await mount('Maya', ep, 'left');
    await focusEnd(maya, 0);
    await type('Before the outage. ');
    await until(() => !maya.host.querySelector('.cue'));

    await server('kill');
    await until(() => maya.host.querySelector('.cue')?.textContent === 'Offline', 5000);
    expect(maya.host.querySelector('.cue')?.getAttribute('title')).toContain(
      'saved on this device',
    );
    await type('Written offline.');
    await sleep(100); // y-indexeddb writes to the device
    maya.unmount(); // the tab is closed while still offline

    const reopened = await mount('Maya', ep, 'left', 'ready'); // server still down
    expect(reopened.lines()[0]).toBe('action: Before the outage. Written offline.');
    expect(reopened.host.querySelector('.cue')?.textContent).toBe('Offline');

    await server('restart');
    await until(() => !reopened.host.querySelector('.cue'), 15_000);
    const sam = await mount('Sam', ep, 'right');
    expect(sam.lines()[0]).toBe('action: Before the outage. Written offline.');
    expect(await stored(ep)).toContain('Written offline.');
  });

  it('both writers edit while the server is down; it all merges on reconnect', async () => {
    const ep = newEpisode();
    const maya = await mount('Maya', ep, 'left');
    const sam = await mount('Sam', ep, 'right');
    await focusEnd(maya, 0);
    await type('Shared line.');
    await until(() => same(maya, sam));

    await server('kill');
    await until(() => !!maya.host.querySelector('.cue') && !!sam.host.querySelector('.cue'), 5000);
    await focusEnd(maya, 0);
    await press('{Enter}');
    await type('Maya wrote this offline.');
    await focusEnd(sam, 0);
    await type(' Sam added this.');

    await server('restart');
    await until(() => !maya.host.querySelector('.cue') && !sam.host.querySelector('.cue'), 15_000);
    await until(() => same(maya, sam), 5000);
    expect(maya.lines()).toEqual([
      'action: Shared line. Sam added this.',
      'action: Maya wrote this offline.',
    ]);
    await userEvent.click(document.body);
  });
});
