import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RenameService } from '../src/rename-service';
import { DEFAULT_SETTINGS, type H1AlignerSettings } from '../src/settings';

interface FakeTFile {
    path: string;
    name: string;
    basename: string;
    extension: string;
    parent: { path: string } | null;
    stat: { ctime: number };
}

function makeFile(basename: string): FakeTFile {
    return {
        path: basename + '.md',
        name: basename + '.md',
        basename,
        extension: 'md',
        parent: { path: '' },
        stat: { ctime: 0 },
    };
}

/** Position helper mirroring Obsidian's TagCache for a tag inside `body`. */
function cacheTag(body: string, tag: string) {
    const offset = body.indexOf(tag);
    const before = body.slice(0, offset);
    const line = (before.match(/\n/g) ?? []).length;
    const col = offset - (before.lastIndexOf('\n') + 1);
    return {
        tag,
        position: {
            start: { line, col, offset },
            end: { line, col: col + tag.length, offset: offset + tag.length },
        },
    };
}

interface FakeApp {
    metadataCache: { getFileCache: ReturnType<typeof vi.fn> };
    vault: {
        cachedRead: ReturnType<typeof vi.fn>;
        getAbstractFileByPath: ReturnType<typeof vi.fn>;
        process: ReturnType<typeof vi.fn>;
    };
    fileManager: {
        renameFile: ReturnType<typeof vi.fn>;
        processFrontMatter: ReturnType<typeof vi.fn>;
    };
}

function makeApp(initialBody = ''): { app: FakeApp; getBody: () => string; getFm: () => Record<string, unknown> } {
    let body = initialBody;
    const fm: Record<string, unknown> = {};
    const app: FakeApp = {
        metadataCache: { getFileCache: vi.fn().mockReturnValue(null) },
        vault: {
            cachedRead: vi.fn().mockImplementation(() => Promise.resolve(body)),
            getAbstractFileByPath: vi.fn().mockReturnValue(null),
            process: vi.fn().mockImplementation((_f: unknown, cb: (d: string) => string) => {
                body = cb(body);
                return Promise.resolve(body);
            }),
        },
        fileManager: {
            renameFile: vi.fn().mockResolvedValue(undefined),
            processFrontMatter: vi
                .fn()
                .mockImplementation((_f: unknown, cb: (fm: Record<string, unknown>) => void) => {
                    cb(fm);
                    return Promise.resolve();
                }),
        },
    };
    return { app, getBody: () => body, getFm: () => fm };
}

const BODY = '# Title\n\nSome text #alpha and #beta here';

function cacheFor(body: string, extra: Record<string, unknown> = {}) {
    return {
        headings: [
            {
                level: 1,
                heading: 'Title',
                position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 7, offset: 7 } },
            },
        ],
        tags: [cacheTag(body, '#alpha'), cacheTag(body, '#beta')],
        ...extra,
    };
}

describe('tag move integration (rename-service)', () => {
    let settings: H1AlignerSettings;

    beforeEach(() => {
        settings = {
            ...DEFAULT_SETTINGS,
            moveTagsToFrontmatter: true,
            tagsToIgnoreForMove: [],
        };
    });

    it('does nothing when the master switch is off', async () => {
        settings.moveTagsToFrontmatter = false;
        const { app } = makeApp(BODY);
        app.metadataCache.getFileCache.mockReturnValue(cacheFor(BODY));
        const svc = new RenameService(app as never, () => settings);
        const out = await svc.renameFromH1(makeFile('Title') as never);
        expect(out.skipped).toBe('same-name');
        expect(out.movedTags).toBeUndefined();
        expect(app.fileManager.processFrontMatter).not.toHaveBeenCalled();
        expect(app.vault.process).not.toHaveBeenCalled();
    });

    it('skips when allowTagMove is false (edit trigger)', async () => {
        const { app } = makeApp(BODY);
        app.metadataCache.getFileCache.mockReturnValue(cacheFor(BODY));
        const svc = new RenameService(app as never, () => settings);
        const out = await svc.renameFromH1(makeFile('Title') as never, { allowTagMove: false });
        expect(out.movedTags).toBeUndefined();
        expect(app.fileManager.processFrontMatter).not.toHaveBeenCalled();
    });

    it('moves tags on a same-name skip (alignment already done)', async () => {
        const { app, getFm } = makeApp(BODY);
        app.metadataCache.getFileCache.mockReturnValue(cacheFor(BODY));
        const svc = new RenameService(app as never, () => settings);
        const out = await svc.renameFromH1(makeFile('Title') as never);
        expect(out.skipped).toBe('same-name');
        expect(out.movedTags).toBe(2);
        expect(getFm().tags).toEqual(['alpha', 'beta']);
    });

    it('does not move tags for a locked note', async () => {
        const { app } = makeApp(BODY);
        app.metadataCache.getFileCache.mockReturnValue(
            cacheFor(BODY, { frontmatter: { 'h1aligner-lock': true } }),
        );
        const svc = new RenameService(app as never, () => settings);
        const out = await svc.renameFromH1(makeFile('Title') as never);
        expect(out.skipped).toBe('locked');
        expect(app.fileManager.processFrontMatter).not.toHaveBeenCalled();
    });

    it('keep mode never rewrites the body', async () => {
        const { app, getBody } = makeApp(BODY);
        app.metadataCache.getFileCache.mockReturnValue(cacheFor(BODY));
        const svc = new RenameService(app as never, () => settings);
        await svc.renameFromH1(makeFile('Title') as never);
        expect(app.vault.process).not.toHaveBeenCalled();
        expect(getBody()).toBe(BODY);
    });

    it('remove-tag mode rewrites body first, then writes frontmatter', async () => {
        settings.bodyTagHandling = 'remove-tag';
        const { app, getBody, getFm } = makeApp(BODY);
        app.metadataCache.getFileCache.mockReturnValue(cacheFor(BODY));
        const order: string[] = [];
        app.vault.process.mockImplementation((_f: unknown, cb: (d: string) => string) => {
            order.push('body');
            const next = cb(getBody());
            (app.vault.cachedRead as ReturnType<typeof vi.fn>).mockResolvedValue(next);
            return Promise.resolve(next);
        });
        // Body state shared with the default mock is bypassed above, so track fm order only.
        app.fileManager.processFrontMatter.mockImplementation(
            (_f: unknown, cb: (fm: Record<string, unknown>) => void) => {
                order.push('frontmatter');
                const fm = getFm();
                cb(fm);
                return Promise.resolve();
            },
        );
        const out = await svc(app, settings).renameFromH1(makeFile('Title') as never);
        expect(out.movedTags).toBe(2);
        expect(order).toEqual(['body', 'frontmatter']);
    });

    it('rolls back the body when the frontmatter write fails', async () => {
        settings.bodyTagHandling = 'remove-tag';
        const { app, getBody } = makeApp(BODY);
        app.metadataCache.getFileCache.mockReturnValue(cacheFor(BODY));
        app.fileManager.processFrontMatter.mockRejectedValue(new Error('yaml broken'));
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const out = await svc(app, settings).renameFromH1(makeFile('Title') as never);
        expect(out.movedTags).toBeUndefined();
        expect(out.error).toBeUndefined(); // never fails the rename outcome
        expect(getBody()).toBe(BODY); // body restored
        errSpy.mockRestore();
    });

    it('abandons rollback when the file changed after our rewrite', async () => {
        settings.bodyTagHandling = 'remove-tag';
        const { app } = makeApp(BODY);
        app.metadataCache.getFileCache.mockReturnValue(cacheFor(BODY));
        let externalEdit = '';
        app.vault.process
            .mockImplementationOnce((_f: unknown, cb: (d: string) => string) => {
                const next = cb(BODY);
                externalEdit = next + '\nuser typed this';
                return Promise.resolve(next);
            })
            .mockImplementationOnce((_f: unknown, cb: (d: string) => string) => {
                externalEdit = cb(externalEdit);
                return Promise.resolve(externalEdit);
            });
        app.fileManager.processFrontMatter.mockRejectedValue(new Error('yaml broken'));
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        await svc(app, settings).renameFromH1(makeFile('Title') as never);
        expect(externalEdit).toContain('user typed this'); // untouched by rollback
        errSpy.mockRestore();
    });

    it('dry run reports the candidate count without any writes', async () => {
        const { app } = makeApp(BODY);
        app.metadataCache.getFileCache.mockReturnValue(cacheFor(BODY));
        const out = await svc(app, settings).renameFromH1(makeFile('Title') as never, { dryRun: true });
        expect(out.movedTags).toBe(2);
        expect(app.vault.process).not.toHaveBeenCalled();
        expect(app.fileManager.processFrontMatter).not.toHaveBeenCalled();
        expect(app.fileManager.renameFile).not.toHaveBeenCalled();
    });

    it('skips silently when the cache is null (not indexed yet)', async () => {
        const { app } = makeApp('# Other\ntext');
        app.metadataCache.getFileCache.mockReturnValue(null);
        app.vault.cachedRead.mockResolvedValue('# Other\ntext');
        const out = await svc(app, settings).renameFromH1(makeFile('Old') as never);
        expect(out.skipped).toBe('none'); // rename itself proceeds via content scan
        expect(out.movedTags).toBeUndefined();
        expect(app.fileManager.processFrontMatter).not.toHaveBeenCalled();
    });

    it('mixed scenario: frontmatter tags + ignore list + heading tag all interact', async () => {
        const body = '# Title #headline\n\nText #alpha #Ignored #beta';
        const cache = {
            headings: [
                {
                    level: 1,
                    heading: 'Title #headline',
                    position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 17, offset: 17 } },
                },
            ],
            tags: [
                cacheTag(body, '#headline'),
                cacheTag(body, '#alpha'),
                cacheTag(body, '#Ignored'),
                cacheTag(body, '#beta'),
            ],
            frontmatter: { tags: ['existing', 'Alpha'] },
        };
        const { app, getFm } = makeApp(body);
        app.metadataCache.getFileCache.mockReturnValue(cache);
        settings.tagsToIgnoreForMove = ['ignored'];
        const out = await svc(app, settings).renameFromH1(makeFile('x') as never);
        // Honest count: 'Alpha' already sits in the cached frontmatter, so
        // only 'beta' is genuinely new (headline excluded, Ignored ignored).
        expect(out.movedTags).toBe(1);
        // The live merge reads the fm object the fake starts empty:
        expect(getFm().tags).toEqual(['alpha', 'beta']);
    });

    it('keep mode is a complete no-op when every candidate already exists in frontmatter', async () => {
        const body = 'Text #alpha only';
        const cache = {
            tags: [cacheTag(body, '#alpha')],
            frontmatter: { tags: ['Alpha'] },
        };
        const { app } = makeApp(body);
        app.metadataCache.getFileCache.mockReturnValue(cache);
        const out = await svc(app, settings).renameFromH1(makeFile('x') as never);
        expect(out.movedTags).toBeUndefined();
        expect(app.fileManager.processFrontMatter).not.toHaveBeenCalled();
    });

    it('legacy comma-separated string frontmatter merges as multiple tags', async () => {
        const body = 'Text #inline only';
        const cache = { tags: [cacheTag(body, '#inline')] };
        const { app, getFm } = makeApp(body);
        app.metadataCache.getFileCache.mockReturnValue(cache);
        app.fileManager.processFrontMatter.mockImplementation(
            (_f: unknown, cb: (fm: Record<string, unknown>) => void) => {
                const fm = getFm();
                fm.tags = 'project, work';
                cb(fm);
                return Promise.resolve();
            },
        );
        await svc(app, settings).renameFromH1(makeFile('x') as never);
        expect(getFm().tags).toEqual(['project', 'work', 'inline']);
    });

    it('respects a raw-content frontmatter lock the cache missed', async () => {
        const body = '---\nh1aligner-lock: true\n---\nText #alpha';
        const cache = { tags: [cacheTag(body, '#alpha')], headings: [{ level: 1, heading: 'x', position: { start: { line: 99, col: 0, offset: 900 }, end: { line: 99, col: 3, offset: 903 } } }] };
        const { app } = makeApp(body);
        app.metadataCache.getFileCache.mockReturnValue(cache);
        const out = await svc(app, settings).renameFromH1(makeFile('x') as never);
        expect(out.movedTags).toBeUndefined();
        expect(app.fileManager.processFrontMatter).not.toHaveBeenCalled();
    });

    it('alias write happens AFTER the tag move so offsets stay valid', async () => {
        settings.preserveOldNameAsAlias = true;
        settings.bodyTagHandling = 'remove-tag';
        const body = '# New Name\n\nText #alpha end';
        const cache = cacheForBody(body);
        const { app } = makeApp(body);
        app.metadataCache.getFileCache.mockReturnValue(cache);
        const calls: string[] = [];
        app.vault.process.mockImplementation((_f: unknown, cb: (d: string) => string) => {
            calls.push('body');
            return Promise.resolve(cb(body));
        });
        app.fileManager.processFrontMatter.mockImplementation(
            (_f: unknown, cb: (fm: Record<string, unknown>) => void) => {
                const fm: Record<string, unknown> = {};
                cb(fm);
                calls.push(fm.aliases !== undefined ? 'alias' : 'tags');
                return Promise.resolve();
            },
        );
        const out = await svc(app, settings).renameFromH1(makeFile('Old') as never);
        expect(out.skipped).toBe('none');
        expect(calls).toEqual(['body', 'tags', 'alias']);
    });

    it('excludes stale-skipped candidates from the frontmatter merge (race: concurrent edit before vault.process)', async () => {
        // Regression for "Step 2 unconditionally maps over the ORIGINAL
        // candidate list": candidates are built from a cachedRead() snapshot,
        // but vault.process() re-verifies each candidate against the file's
        // CURRENT live content, which can differ if a concurrent edit landed
        // in between. Here '#alpha' gets extended (still-valid text at its
        // cached offset, but now bordered by another word char) so it must
        // be skipped as stale; '#beta' is untouched and still applies.
        settings.bodyTagHandling = 'remove-tag';
        const body = 'Text #alpha and #beta here';
        const cache = { tags: [cacheTag(body, '#alpha'), cacheTag(body, '#beta')] };
        const { app, getFm } = makeApp(body);
        app.metadataCache.getFileCache.mockReturnValue(cache);
        // Same length as `body` so '#beta's offset stays valid in the raced
        // text — only '#alpha' is affected (extended by one word char).
        const racedBody = 'Text #alphb and #beta here';
        app.vault.process.mockImplementation((_f: unknown, cb: (d: string) => string) => {
            const next = cb(racedBody);
            return Promise.resolve(next);
        });
        const out = await svc(app, settings).renameFromH1(makeFile('x') as never);
        expect(out.staleTags).toBe(1); // alpha skipped as stale
        expect(out.movedTags).toBe(1); // only beta actually removed
        // BUG 2 fix: the stale-skipped 'alpha' must NOT land in frontmatter
        // even though it was in the original candidate list.
        expect(getFm().tags).toEqual(['beta']);
    });

    it('decision table: no-h1 and collision skips still move tags', async () => {
        // no-h1
        const body1 = 'no heading #alpha here';
        const { app: app1, getFm: fm1 } = makeApp(body1);
        app1.metadataCache.getFileCache.mockReturnValue({ tags: [cacheTag(body1, '#alpha')] });
        app1.vault.cachedRead.mockResolvedValue(body1);
        const out1 = await svc(app1, settings).renameFromH1(makeFile('x') as never);
        expect(out1.skipped).toBe('no-h1');
        expect(out1.movedTags).toBe(1);
        expect(fm1().tags).toEqual(['alpha']);
        // collision
        const body2 = '# Target\n\n#beta here';
        const { app: app2, getFm: fm2 } = makeApp(body2);
        app2.metadataCache.getFileCache.mockReturnValue(cacheForBody(body2));
        app2.vault.getAbstractFileByPath.mockReturnValue({ path: 'Target.md' });
        const out2 = await svc(app2, settings).renameFromH1(makeFile('other') as never);
        expect(out2.skipped).toBe('collision');
        expect(out2.movedTags).toBe(1);
        expect(fm2().tags).toEqual(['beta']);
    });
});

function svc(app: FakeApp, settings: H1AlignerSettings): RenameService {
    return new RenameService(app as never, () => settings);
}

/** cacheFor() variant that derives heading position from the given body. */
function cacheForBody(body: string) {
    const heading = body.split('\n')[0];
    return {
        headings: [
            {
                level: 1,
                heading: heading.replace(/^#\s*/, ''),
                position: {
                    start: { line: 0, col: 0, offset: 0 },
                    end: { line: 0, col: heading.length, offset: heading.length },
                },
            },
        ],
        tags: [...body.matchAll(/#[a-z]+/g)].map((m) => cacheTag(body, m[0])),
    };
}
