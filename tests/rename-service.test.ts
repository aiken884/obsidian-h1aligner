import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RenameService } from '../src/rename-service';
import { DEFAULT_SETTINGS, type H1AlignerSettings } from '../src/settings';

interface FakeTFile {
    path: string;
    name: string;
    basename: string;
    extension: string;
    parent: { path: string } | null;
}

function makeFile(opts: { basename: string; folder?: string; ext?: string }): FakeTFile {
    const folder = opts.folder ?? '';
    const ext = opts.ext ?? 'md';
    const name = opts.basename + '.' + ext;
    const path = folder ? folder + '/' + name : name;
    return {
        path,
        name,
        basename: opts.basename,
        extension: ext,
        parent: { path: folder },
    };
}

interface FakeApp {
    metadataCache: { getFileCache: ReturnType<typeof vi.fn> };
    vault: {
        read: ReturnType<typeof vi.fn>;
        getAbstractFileByPath: ReturnType<typeof vi.fn>;
    };
    fileManager: { renameFile: ReturnType<typeof vi.fn> };
}

function makeApp(): FakeApp {
    return {
        metadataCache: { getFileCache: vi.fn().mockReturnValue(null) },
        vault: {
            read: vi.fn().mockResolvedValue(''),
            getAbstractFileByPath: vi.fn().mockReturnValue(null),
        },
        fileManager: { renameFile: vi.fn().mockResolvedValue(undefined) },
    };
}

describe('RenameService', () => {
    let app: FakeApp;
    let settings: H1AlignerSettings;

    beforeEach(() => {
        app = makeApp();
        settings = { ...DEFAULT_SETTINGS };
    });

    describe('happy path', () => {
        it('renames when H1 differs from basename', async () => {
            const file = makeFile({ basename: 'old' });
            app.metadataCache.getFileCache.mockReturnValue({
                headings: [{ level: 1, heading: 'New Title' }],
            });
            const svc = new RenameService(app as any, () => settings);
            const out = await svc.renameFromH1(file as any);
            expect(out.skipped).toBe('none');
            expect(out.newName).toBe('New Title');
            expect(app.fileManager.renameFile).toHaveBeenCalledWith(file, 'New Title.md');
        });

        it('uses fileManager.renameFile (not vault.rename) per PPLX Q2', async () => {
            const file = makeFile({ basename: 'old' });
            app.metadataCache.getFileCache.mockReturnValue({
                headings: [{ level: 1, heading: 'New' }],
            });
            const svc = new RenameService(app as any, () => settings);
            await svc.renameFromH1(file as any);
            expect(app.fileManager.renameFile).toHaveBeenCalledOnce();
        });

        it('falls back to vault.read when cache has no H1', async () => {
            const file = makeFile({ basename: 'doc' });
            app.metadataCache.getFileCache.mockReturnValue(null);
            app.vault.read.mockResolvedValue('# From Scan\nbody');
            const svc = new RenameService(app as any, () => settings);
            const out = await svc.renameFromH1(file as any);
            expect(out.skipped).toBe('none');
            expect(out.newName).toBe('From Scan');
            expect(app.vault.read).toHaveBeenCalled();
        });

        it('keeps file in subfolder when renaming', async () => {
            const file = makeFile({ basename: 'old', folder: 'notes' });
            app.metadataCache.getFileCache.mockReturnValue({
                headings: [{ level: 1, heading: 'Renamed' }],
            });
            const svc = new RenameService(app as any, () => settings);
            await svc.renameFromH1(file as any);
            expect(app.fileManager.renameFile).toHaveBeenCalledWith(file, 'notes/Renamed.md');
        });
    });

    describe('4-layer protection', () => {
        it('L1 no-h1: skips when neither cache nor content has H1', async () => {
            const file = makeFile({ basename: 'doc' });
            // cache=null, vault.read='' (default mocks)
            const svc = new RenameService(app as any, () => settings);
            const out = await svc.renameFromH1(file as any);
            expect(out.skipped).toBe('no-h1');
            expect(app.fileManager.renameFile).not.toHaveBeenCalled();
        });

        it('L2 empty-after-sanitize: skips when H1 sanitises to empty', async () => {
            const file = makeFile({ basename: 'doc' });
            // All-illegal H1 → replace with spaces → trim → empty
            app.metadataCache.getFileCache.mockReturnValue({
                headings: [{ level: 1, heading: '<<<>>>' }],
            });
            const svc = new RenameService(app as any, () => settings);
            const out = await svc.renameFromH1(file as any);
            expect(out.skipped).toBe('empty-after-sanitize');
            expect(app.fileManager.renameFile).not.toHaveBeenCalled();
        });

        it('L3 same-name: skips when new name equals current basename', async () => {
            const file = makeFile({ basename: 'My Title' });
            app.metadataCache.getFileCache.mockReturnValue({
                headings: [{ level: 1, heading: 'My Title' }],
            });
            const svc = new RenameService(app as any, () => settings);
            const out = await svc.renameFromH1(file as any);
            expect(out.skipped).toBe('same-name');
            expect(app.fileManager.renameFile).not.toHaveBeenCalled();
        });

        it('L4 collision: skips when a sibling already owns the target name', async () => {
            const file = makeFile({ basename: 'old', folder: 'notes' });
            app.metadataCache.getFileCache.mockReturnValue({
                headings: [{ level: 1, heading: 'Renamed' }],
            });
            app.vault.getAbstractFileByPath.mockReturnValue({ path: 'notes/Renamed.md' });
            const svc = new RenameService(app as any, () => settings);
            const out = await svc.renameFromH1(file as any);
            expect(out.skipped).toBe('collision');
            expect(out.newName).toBe('Renamed');
            expect(app.fileManager.renameFile).not.toHaveBeenCalled();
        });

        it('L4 collision: does NOT trigger when getAbstractFileByPath returns the file itself', async () => {
            const file = makeFile({ basename: 'old' });
            app.metadataCache.getFileCache.mockReturnValue({
                headings: [{ level: 1, heading: 'New' }],
            });
            // Hypothetical: same-path match — should not block
            app.vault.getAbstractFileByPath.mockImplementation((p: string) => {
                return p === file.path ? file : null;
            });
            const svc = new RenameService(app as any, () => settings);
            const out = await svc.renameFromH1(file as any);
            expect(out.skipped).toBe('none');
        });
    });

    describe('concurrency / serial chain', () => {
        it('serialises concurrent renames in submission order', async () => {
            const file1 = makeFile({ basename: 'a' });
            const file2 = makeFile({ basename: 'b' });
            app.metadataCache.getFileCache.mockImplementation((f: FakeTFile) => ({
                headings: [{ level: 1, heading: f.basename + '-new' }],
            }));

            const calls: string[] = [];
            app.fileManager.renameFile.mockImplementation(
                async (_f: FakeTFile, newPath: string) => {
                    calls.push(newPath);
                    await new Promise((r) => setTimeout(r, 5));
                },
            );

            const svc = new RenameService(app as any, () => settings);
            const p1 = svc.renameFromH1(file1 as any);
            const p2 = svc.renameFromH1(file2 as any);
            await Promise.all([p1, p2]);

            expect(calls).toEqual(['a-new.md', 'b-new.md']);
        });

        it('one failure does not poison the queue', async () => {
            const file1 = makeFile({ basename: 'a' });
            const file2 = makeFile({ basename: 'b' });
            app.metadataCache.getFileCache.mockImplementation((f: FakeTFile) => ({
                headings: [{ level: 1, heading: f.basename + '-new' }],
            }));
            // First rename throws, second should still proceed
            app.fileManager.renameFile
                .mockImplementationOnce(async () => { throw new Error('first fails'); })
                .mockImplementationOnce(async () => { /* second succeeds */ });

            const svc = new RenameService(app as any, () => settings);
            const out1 = await svc.renameFromH1(file1 as any);
            const out2 = await svc.renameFromH1(file2 as any);

            expect(out1.error).toBeInstanceOf(Error);
            expect(out2.skipped).toBe('none');
            expect(out2.newName).toBe('b-new');
        });
    });

    describe('error handling', () => {
        it('captures fileManager.renameFile error in outcome', async () => {
            const file = makeFile({ basename: 'old' });
            app.metadataCache.getFileCache.mockReturnValue({
                headings: [{ level: 1, heading: 'New' }],
            });
            app.fileManager.renameFile.mockRejectedValue(new Error('disk full'));
            const svc = new RenameService(app as any, () => settings);
            const out = await svc.renameFromH1(file as any);
            expect(out.error).toBeInstanceOf(Error);
            expect(out.error?.message).toBe('disk full');
        });

        it('captures vault.read error gracefully (treats as no content)', async () => {
            const file = makeFile({ basename: 'doc' });
            app.metadataCache.getFileCache.mockReturnValue(null);
            app.vault.read.mockRejectedValue(new Error('read fail'));
            const svc = new RenameService(app as any, () => settings);
            const out = await svc.renameFromH1(file as any);
            // No content + no cache → L1 no-h1
            expect(out.skipped).toBe('no-h1');
        });
    });
});