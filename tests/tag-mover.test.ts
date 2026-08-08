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

    it('does not touch a # that is not at the very start of the string (anchored strip)', () => {
        // The '#' strip is anchored (/^#+/) — it must never remove a '#'
        // elsewhere in the string, only a leading run of them.
        expect(normalizeTagName('a#b')).toBe('a#b');
        expect(normalizeTagName('a##b')).toBe('a##b');
    });

    it('trims whitespace exposed by stripping the leading #, not just the outer edges', () => {
        // '#  foo'.trim() leaves the string untouched (no OUTER whitespace) — the
        // leading spaces only become exposed at the string's edge after the '#'
        // strip, so the trailing .trim() must run again to catch them.
        expect(normalizeTagName('#  foo')).toBe('foo');
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

    it('ignore entries that normalize to empty never leak into wrongly excluding a degenerate tag', () => {
        // The '#' tag itself normalizes to '' — this only matters as a probe for
        // whether blank/whitespace-only ignore entries are correctly filtered out
        // of the ignore set (they must not) rather than leaking through as ''.
        const body = 'weird #';
        const cache: CacheLike = { tags: [tagAt(body, '#')] };
        expect(movableTags(cache, body, ['', '   '])).toHaveLength(1);
    });

    it('excludes via a cache.links span even when the body has no literal [...](...)  bracket syntax', () => {
        const body = 'see [[note#faketag]] and #real';
        const fake = tagAt(body, '#faketag');
        const real = tagAt(body, '#real');
        const cache: CacheLike = { tags: [fake, real], links: [{ position: fake.position }] };
        const out = movableTags(cache, body, []);
        expect(out.map((t) => t.tag)).toEqual(['#real']);
    });

    it('containment against an excluded span is inclusive at both boundaries', () => {
        const body = '#tag';
        const tag = tagAt(body, '#tag');
        const cache: CacheLike = {
            tags: [tag],
            // Span exactly matches the tag's own offsets — boundary-touching, not
            // strictly interior — must still count as "inside".
            links: [{ position: tag.position }],
        };
        expect(movableTags(cache, body, [])).toHaveLength(0);
    });

    it('does not exclude tags inside non-comment sections (only type==="comment" excludes)', () => {
        const body = 'para #tag here';
        const tag = tagAt(body, '#tag');
        const cache: CacheLike = {
            tags: [tag],
            sections: [
                {
                    type: 'paragraph',
                    position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: body.length, offset: body.length } },
                },
            ],
        };
        expect(movableTags(cache, body, [])).toHaveLength(1);
    });

    it('does not throw when a candidate claims an out-of-range line index (stale/malformed cache)', () => {
        const body = '#tag';
        const tag: InlineTag = {
            tag: '#tag',
            position: { start: { line: 99, col: 0, offset: 0 }, end: { line: 99, col: 4, offset: 4 } },
        };
        const cache: CacheLike = { tags: [tag] };
        expect(() => movableTags(cache, body, [])).not.toThrow();
    });

    it('the %% heuristic only counts %% BEFORE the tag on its line, not after', () => {
        const body = '#tag stays %% comment-marker-after';
        const tag = tagAt(body, '#tag');
        const cache: CacheLike = { tags: [tag] };
        expect(movableTags(cache, body, [])).toHaveLength(1);
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

    it('trims whitespace exposed by stripping # from an existing entry, not just the outer edges', () => {
        expect(mergeTagsIntoList(['#  weird'], [])).toEqual(['weird']);
    });

    it('never pushes an empty-after-clean entry into the output', () => {
        expect(mergeTagsIntoList(['', '   ', '#', '###'], ['real'])).toEqual(['real']);
    });

    it('does not silently drop a lone non-null scalar existing value (e.g. a bare YAML number)', () => {
        expect(mergeTagsIntoList(2025, [])).toEqual(['2025']);
    });

    it('excludes non-finite numbers and non-numeric, non-string junk from existing', () => {
        expect(mergeTagsIntoList([true, {}, Infinity, -Infinity, NaN], [])).toEqual([]);
    });

    it('does not touch a # that is not at the very start of an existing entry', () => {
        expect(mergeTagsIntoList(['a#b'], [])).toEqual(['a#b']);
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

    it('rejects a candidate whose tag was extended with CJK (#tag → #tag中文), mirroring the ASCII case', () => {
        // Same scenario as the ASCII '#tag → #tagX' test above, but the
        // extension is CJK — regression for the staleness guard's
        // TAG_BODY_CHAR class, which must recognize CJK letters as tag-body
        // characters, not just ASCII, since this feature treats CJK as
        // first-class tag content (see '#重點' tests elsewhere in this file).
        const body = 'note #tag中文 end';
        const stale: InlineTag = {
            tag: '#tag',
            position: { start: { line: 0, col: 5, offset: 5 }, end: { line: 0, col: 9, offset: 9 } },
        };
        const res = applyBodyTagRemoval(body, [stale], 'remove-tag');
        expect(res.text).toBe(body);
        expect(res.skippedStale).toBe(1);
    });

    it('rejects a CJK candidate extended further in CJK (#重點 → #重點中文)', () => {
        const body = '討論 #重點中文 之後';
        const stale: InlineTag = {
            tag: '#重點',
            position: {
                start: { line: 0, col: 3, offset: 3 },
                end: { line: 0, col: 6, offset: 6 },
            },
        };
        const res = applyBodyTagRemoval(body, [stale], 'remove-hash');
        expect(res.text).toBe(body);
        expect(res.skippedStale).toBe(1);
    });

    it('rejects a candidate immediately preceded by CJK text with no separator (#tag was really 中文#tag)', () => {
        // Mirrors the ASCII "doubled hash" prev-char test below, but for a
        // CJK character sitting directly before the cached start offset —
        // a fresh Obsidian tag can never be preceded by a CJK letter with no
        // separator (Obsidian's own parser would still start the tag at the
        // '#', so this specifically probes the prev-char branch, not the
        // content-match branch: text.slice(from,to) still equals c.tag).
        const body = '中文#tag end';
        const stale: InlineTag = {
            tag: '#tag',
            position: { start: { line: 0, col: 2, offset: 2 }, end: { line: 0, col: 6, offset: 6 } },
        };
        const res = applyBodyTagRemoval(body, [stale], 'remove-hash');
        expect(res.text).toBe(body);
        expect(res.skippedStale).toBe(1);
    });

    it('rejects a candidate immediately preceded by another # (accidentally-doubled hash)', () => {
        const body = '##tag end';
        // Content still matches at this offset ('#tag'), but the char right before
        // it is itself '#' — a fresh cache tag could never be bordered like this.
        const stale: InlineTag = {
            tag: '#tag',
            position: { start: { line: 0, col: 1, offset: 1 }, end: { line: 0, col: 5, offset: 5 } },
        };
        const res = applyBodyTagRemoval(body, [stale], 'remove-hash');
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

    it('still accepts a fresh, non-extended CJK tag bordered by CJK punctuation on both sides', () => {
        // Regression guard for the fix above: CJK punctuation must NOT be
        // misread as a tag-body character. If it were, this genuinely fresh
        // (non-extended) '#重點' would be wrongly flagged stale by the prev
        // AND next checks, even though nothing actually extended it.
        const body = '。#重點。';
        const res = applyBodyTagRemoval(body, [tagAt(body, '#重點')], 'remove-hash');
        expect(res.text).toBe('。重點。');
        expect(res.applied).toBe(1);
        expect(res.skippedStale).toBe(0);
    });

    it('still accepts a fresh, non-extended ASCII tag exactly as before the CJK fix', () => {
        const body = 'talk about #topic today';
        const res = applyBodyTagRemoval(body, [tagAt(body, '#topic')], 'remove-hash');
        expect(res.text).toBe('talk about topic today');
        expect(res.applied).toBe(1);
        expect(res.skippedStale).toBe(0);
    });
});
