import { describe, it, expect } from 'vitest';
import {
    normalizeTagName,
    movableTags,
    mergeTagsIntoList,
    applyBodyTagRemoval,
    type CacheLike,
    type InlineTag,
} from '../src/tag-mover';

/** Build an InlineTag whose position matches its place inside `body`. */
function tagAt(body: string, tag: string, occurrence = 0): InlineTag {
    let offset = -1;
    for (let i = 0; i <= occurrence; i++) {
        offset = body.indexOf(tag, offset + 1);
    }
    if (offset < 0) throw new Error(`tag ${tag} not found in body`);
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

describe('normalizeTagName', () => {
    it('strips one leading #, trims, folds case, keeps nesting', () => {
        expect(normalizeTagName('#A/B')).toBe('a/b');
        expect(normalizeTagName(' a/b ')).toBe('a/b');
        expect(normalizeTagName('A/B')).toBe('a/b');
        expect(normalizeTagName('#a')).toBe('a');
        expect(normalizeTagName('#a/b/c')).toBe('a/b/c');
    });

    it('strips ALL leading #s, not just one (hand-typed "##tag")', () => {
        expect(normalizeTagName('##weird')).toBe('weird');
        expect(normalizeTagName('###triple')).toBe('triple');
        expect(normalizeTagName('###')).toBe('');
    });
    it('NFC-normalizes so NFD and NFC forms compare equal', () => {
        expect(normalizeTagName('café')).toBe(normalizeTagName('café'));
    });
});

describe('movableTags', () => {
    it('keeps a plain paragraph tag', () => {
        const body = 'Some text #alpha here';
        const cache: CacheLike = { tags: [tagAt(body, '#alpha')] };
        expect(movableTags(cache, body, [])).toHaveLength(1);
    });

    it('excludes tags on heading lines', () => {
        const body = '# Title #topic\n\nBody #keep';
        const cache: CacheLike = {
            tags: [tagAt(body, '#topic'), tagAt(body, '#keep')],
            headings: [{ position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 14, offset: 14 } } }],
        };
        const out = movableTags(cache, body, []);
        expect(out.map((t) => t.tag)).toEqual(['#keep']);
    });

    it('excludes tags inside link ranges', () => {
        const body = 'see [#ref](https://x.com) and #real';
        const refTag = tagAt(body, '#ref');
        const cache: CacheLike = {
            tags: [refTag, tagAt(body, '#real')],
            links: [{ position: { start: { line: 0, col: 4, offset: 4 }, end: { line: 0, col: 25, offset: 25 } } }],
        };
        const out = movableTags(cache, body, []);
        expect(out.map((t) => t.tag)).toEqual(['#real']);
    });

    it('excludes tag-like text inside an EXTERNAL markdown link even without a cache.links entry', () => {
        // Regression: live-vault testing showed cache.links never contains
        // external URL links (only internal, vault-resolved links) — a
        // '[#tag](https://...)' produces a tag but no cache.links entry at
        // all, so exclusion cannot rely on cache.links alone.
        const body = 'see [#linktag](https://example.com/#frag) and #realtag';
        const cache: CacheLike = {
            tags: [tagAt(body, '#linktag'), tagAt(body, '#realtag')],
            // No `links` key at all — matches real Obsidian behavior.
        };
        const out = movableTags(cache, body, []);
        expect(out.map((t) => t.tag)).toEqual(['#realtag']);
    });

    it('excludes tags inside comment sections', () => {
        const body = '%%\n#hidden\n%%\n#visible';
        const cache: CacheLike = {
            tags: [tagAt(body, '#hidden'), tagAt(body, '#visible')],
            sections: [
                { type: 'comment', position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 2, col: 2, offset: 13 } } },
            ],
        };
        const out = movableTags(cache, body, []);
        expect(out.map((t) => t.tag)).toEqual(['#visible']);
    });

    it('handles missing/empty sections gracefully (compat assumption)', () => {
        const body = 'plain #tag';
        expect(movableTags({ tags: [tagAt(body, '#tag')] }, body, [])).toHaveLength(1);
        expect(movableTags({ tags: [tagAt(body, '#tag')], sections: [] }, body, [])).toHaveLength(1);
    });

    it('excludes tag after an odd number of %% on the same line (inline comment)', () => {
        const body = 'text %% #inline more';
        const cache: CacheLike = { tags: [tagAt(body, '#inline')] };
        expect(movableTags(cache, body, [])).toHaveLength(0);
    });

    it('keeps tag after a balanced %%…%% pair on the same line', () => {
        const body = '%% note %% #after';
        const cache: CacheLike = { tags: [tagAt(body, '#after')] };
        expect(movableTags(cache, body, [])).toHaveLength(1);
    });

    it('keeps blockquote tags (parser marks them as regular tags)', () => {
        const body = '> quoted #inquote';
        const cache: CacheLike = { tags: [tagAt(body, '#inquote')] };
        expect(movableTags(cache, body, [])).toHaveLength(1);
    });

    it('applies the ignore list case-insensitively with full nested names', () => {
        const body = '#Work/ProjectA #other';
        const cache: CacheLike = { tags: [tagAt(body, '#Work/ProjectA'), tagAt(body, '#other')] };
        const out = movableTags(cache, body, ['work/projecta']);
        expect(out.map((t) => t.tag)).toEqual(['#other']);
        // '#'-prefixed ignore entries also match (normalized before compare)
        expect(movableTags(cache, body, ['#Work/ProjectA']).map((t) => t.tag)).toEqual(['#other']);
    });

    it('returns empty for cache without tags', () => {
        expect(movableTags({}, '', [])).toEqual([]);
    });
});

describe('mergeTagsIntoList', () => {
    it('merges into an existing array, dedup case-insensitive, first casing wins', () => {
        expect(mergeTagsIntoList(['Test', 'keep'], ['#test', '#New'])).toEqual(['Test', 'keep', 'New']);
    });
    it('accepts a single string existing value', () => {
        expect(mergeTagsIntoList('solo', ['#solo', '#extra'])).toEqual(['solo', 'extra']);
    });
    it('accepts numeric existing values (YAML bare numbers)', () => {
        expect(mergeTagsIntoList([2025, 'x'], ['#2025b'])).toEqual(['2025', 'x', '2025b']);
    });
    it('filters nested arrays and non-string junk', () => {
        expect(mergeTagsIntoList([['nested'], null, {}, 'ok'], ['#in'])).toEqual(['ok', 'in']);
    });
    it('strips # and preserves original casing of incoming tags', () => {
        expect(mergeTagsIntoList(undefined, ['#CJK標籤', '#a/B'])).toEqual(['CJK標籤', 'a/B']);
    });
    it('keeps a CJK punctuation-polluted tag verbatim', () => {
        expect(mergeTagsIntoList([], ['#重點。'])).toEqual(['重點。']);
    });
    it('dedups NFC/NFD variants', () => {
        expect(mergeTagsIntoList(['café'], ['#café'])).toEqual(['café']);
    });
    it('splits legacy comma/space-separated string frontmatter (adversarial #1)', () => {
        expect(mergeTagsIntoList('project, work', ['#inline'])).toEqual(['project', 'work', 'inline']);
        expect(mergeTagsIntoList('project work', ['#project'])).toEqual(['project', 'work']);
    });
    it('strips # after trimming leading whitespace (adversarial #2)', () => {
        expect(normalizeTagName(' #foo')).toBe('foo');
        expect(mergeTagsIntoList([' #foo'], ['#foo'])).toEqual(['foo']);
        expect(mergeTagsIntoList(['\t#bar'], ['#bar', '#baz'])).toEqual(['bar', 'baz']);
    });
    it('strips ALL leading #s from a malformed existing entry, never leaves one behind', () => {
        expect(mergeTagsIntoList(['##weird'], [])).toEqual(['weird']);
        expect(mergeTagsIntoList(['###triple', '#normal'], [])).toEqual(['triple', 'normal']);
        expect(mergeTagsIntoList(['##weird'], ['#weird'])).toEqual(['weird']); // dedups against the fixed form
    });
});

describe('applyBodyTagRemoval', () => {
    it('remove-hash strips only the # and keeps the word', () => {
        const body = 'talk about #topic today';
        const res = applyBodyTagRemoval(body, [tagAt(body, '#topic')], 'remove-hash');
        expect(res.text).toBe('talk about topic today');
        expect(res.applied).toBe(1);
        expect(res.skippedStale).toBe(0);
    });

    it('remove-tag removes the tag plus one preceding space', () => {
        const body = 'end of line #trail\nnext';
        const res = applyBodyTagRemoval(body, [tagAt(body, '#trail')], 'remove-tag');
        expect(res.text).toBe('end of line\nnext');
    });

    it('remove-tag swallows tab and U+3000 but never a newline or NBSP', () => {
        const tab = 'a\t#t1';
        expect(applyBodyTagRemoval(tab, [tagAt(tab, '#t1')], 'remove-tag').text).toBe('a');
        const ideographic = 'a　#t2';
        expect(applyBodyTagRemoval(ideographic, [tagAt(ideographic, '#t2')], 'remove-tag').text).toBe('a');
        const newline = 'a\n#t3';
        expect(applyBodyTagRemoval(newline, [tagAt(newline, '#t3')], 'remove-tag').text).toBe('a\n');
        const nbsp = 'a #t4';
        expect(applyBodyTagRemoval(nbsp, [tagAt(nbsp, '#t4')], 'remove-tag').text).toBe('a ');
    });

    it('processes from end to start so earlier offsets stay valid', () => {
        const body = '#one #two #three';
        const tags = [tagAt(body, '#one'), tagAt(body, '#two'), tagAt(body, '#three')];
        const res = applyBodyTagRemoval(body, tags, 'remove-tag');
        expect(res.text).toBe('');
        expect(res.applied).toBe(3);
    });

    it('skips stale candidates entirely without partial edits', () => {
        const body = 'text #real here';
        const stale: InlineTag = {
            tag: '#moved',
            position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 6, offset: 6 } },
        };
        const res = applyBodyTagRemoval(body, [stale, tagAt(body, '#real')], 'remove-hash');
        expect(res.text).toBe('text real here');
        expect(res.applied).toBe(1);
        expect(res.skippedStale).toBe(1);
    });

    it('handles multiple identical tags at distinct offsets', () => {
        const body = '#dup and #dup';
        const tags = [tagAt(body, '#dup', 0), tagAt(body, '#dup', 1)];
        const res = applyBodyTagRemoval(body, tags, 'remove-hash');
        expect(res.text).toBe('dup and dup');
        expect(res.applied).toBe(2);
    });

    it('CJK polluted tag removes verbatim including punctuation', () => {
        const body = '討論 #重點。接著';
        const res = applyBodyTagRemoval(body, [tagAt(body, '#重點。接著')], 'remove-tag');
        expect(res.text).toBe('討論');
    });

    it('emoji tags round-trip', () => {
        const body = 'note #tag😀 end';
        const res = applyBodyTagRemoval(body, [tagAt(body, '#tag😀')], 'remove-hash');
        expect(res.text).toBe('note tag😀 end');
    });

    it('rejects a stale offset that now points into a URL (adversarial #8)', () => {
        const body = 'see http://x.com/#tag now';
        const stale: InlineTag = {
            tag: '#tag',
            position: { start: { line: 0, col: 17, offset: 17 }, end: { line: 0, col: 21, offset: 21 } },
        };
        const res = applyBodyTagRemoval(body, [stale], 'remove-hash');
        expect(res.text).toBe(body);
        expect(res.skippedStale).toBe(1);
    });

    it('rejects a candidate whose tag was extended (#tag → #tagX) instead of leaving a dangling X', () => {
        const body = 'note #tagX end';
        const stale: InlineTag = {
            tag: '#tag',
            position: { start: { line: 0, col: 5, offset: 5 }, end: { line: 0, col: 9, offset: 9 } },
        };
        const res = applyBodyTagRemoval(body, [stale], 'remove-tag');
        expect(res.text).toBe(body);
        expect(res.skippedStale).toBe(1);
    });

    it('still accepts fresh tags at line start, end of file, and after CJK text', () => {
        const eof = 'ends with #tail';
        expect(applyBodyTagRemoval(eof, [tagAt(eof, '#tail')], 'remove-tag').text).toBe('ends with');
        const bol = '#head starts';
        expect(applyBodyTagRemoval(bol, [tagAt(bol, '#head')], 'remove-tag').text).toBe(' starts');
        const cjk = '討論 #重點 之後';
        expect(applyBodyTagRemoval(cjk, [tagAt(cjk, '#重點')], 'remove-tag').text).toBe('討論 之後');
    });
});
