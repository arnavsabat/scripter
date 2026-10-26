import { describe, expect, it } from 'vitest';
import {
  canBeCoWriter,
  canEdit,
  canMerge,
  canView,
  isRole,
  type Access,
  type EpisodeScope,
  type SeriesScope,
} from '../src/permissions';

const series: SeriesScope = { kind: 'series', seriesId: 's1' };
const ep1: EpisodeScope = { kind: 'episode', seriesId: 's1', episodeId: 'e1' };
const ep2: EpisodeScope = { kind: 'episode', seriesId: 's1', episodeId: 'e2' };
const access = (role: Access['role'], ...assigned: string[]): Access => ({
  role,
  assigned: new Set(assigned),
});

describe('showrunner', () => {
  const sr = access('showrunner');
  it('edits the series and every episode, assigned or not', () => {
    expect(canEdit(sr, series)).toBe(true);
    expect(canEdit(sr, ep1)).toBe(true);
    expect(canEdit(sr, ep2)).toBe(true);
  });
  it('sends to main on every episode', () => {
    expect(canMerge(sr, ep1)).toBe(true);
  });
});

describe('writer', () => {
  const writer = access('writer', 'e1');
  it('edits and sends to main on assigned episodes only', () => {
    expect(canEdit(writer, ep1)).toBe(true);
    expect(canMerge(writer, ep1)).toBe(true);
    expect(canEdit(writer, ep2)).toBe(false);
    expect(canMerge(writer, ep2)).toBe(false);
  });
  it('reads every episode of the series', () => {
    expect(canView(writer, ep2)).toBe(true);
  });
  it("can't manage the series (invite, roles, episodes)", () => {
    expect(canEdit(writer, series)).toBe(false);
  });
});

describe('viewer', () => {
  it('reads everything and edits nothing, even if an old assignment lingers', () => {
    const viewer = access('viewer', 'e1');
    expect(canView(viewer, ep1)).toBe(true);
    expect(canView(viewer, series)).toBe(true);
    expect(canEdit(viewer, ep1)).toBe(false);
    expect(canMerge(viewer, ep1)).toBe(false);
    expect(canEdit(viewer, series)).toBe(false);
  });
});

describe('not a member', () => {
  it('has no access at all', () => {
    const stranger = access(null, 'e1');
    expect(canView(stranger, ep1)).toBe(false);
    expect(canView(stranger, series)).toBe(false);
    expect(canEdit(stranger, ep1)).toBe(false);
    expect(canMerge(stranger, ep1)).toBe(false);
  });
});

describe('co-writers and roles', () => {
  it('only members with the writer role can be added as co-writers', () => {
    expect(canBeCoWriter('writer')).toBe(true);
    expect(canBeCoWriter('viewer')).toBe(false);
    expect(canBeCoWriter('showrunner')).toBe(false);
    expect(canBeCoWriter(null)).toBe(false);
  });
  it('recognises exactly the three roles', () => {
    expect(['showrunner', 'writer', 'viewer'].every(isRole)).toBe(true);
    expect(isRole('admin')).toBe(false);
    expect(isRole(undefined)).toBe(false);
  });
});
