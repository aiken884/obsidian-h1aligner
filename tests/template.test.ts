import { describe, it, expect } from 'vitest';
import { renderNameTemplate } from '../src/template';

const CTIME = new Date(2026, 6, 3, 9, 5, 7).getTime(); // 2026-07-03 09:05:07 local

describe('renderNameTemplate', () => {
    it('renders the plain {{h1}} template', () => {
        expect(renderNameTemplate('{{h1}}', { h1: 'My Title', ctime: CTIME })).toBe('My Title');
    });

    it('renders {{date}} with the default YYYY-MM-DD format from ctime', () => {
        expect(renderNameTemplate('{{date}} {{h1}}', { h1: 'T', ctime: CTIME })).toBe('2026-07-03 T');
    });

    it('renders {{date:FORMAT}} custom formats', () => {
        expect(renderNameTemplate('{{date:YYYYMMDD}}-{{h1}}', { h1: 'x', ctime: CTIME })).toBe('20260703-x');
        expect(renderNameTemplate('{{date:YYYY.MM.DD HHmm}} {{h1}}', { h1: 'x', ctime: CTIME })).toBe(
            '2026.07.03 0905 x',
        );
    });

    it('falls back to {{h1}} when the template lacks the h1 token', () => {
        expect(renderNameTemplate('{{date}}', { h1: 'Title', ctime: CTIME })).toBe('Title');
        expect(renderNameTemplate('', { h1: 'Title', ctime: CTIME })).toBe('Title');
    });

    it('falls back to {{h1}} for non-string templates', () => {
        expect(renderNameTemplate(undefined as any, { h1: 'T', ctime: CTIME })).toBe('T');
    });

    it('does not expand $-patterns or tokens contained in the H1 text', () => {
        expect(renderNameTemplate('{{h1}}', { h1: 'a $& b', ctime: CTIME })).toBe('a $& b');
        expect(renderNameTemplate('{{h1}}', { h1: 'literal {{date}}', ctime: CTIME })).toBe(
            'literal {{date}}',
        );
    });

    it('supports multiple h1 occurrences', () => {
        expect(renderNameTemplate('{{h1}} - {{h1}}', { h1: 'A', ctime: CTIME })).toBe('A - A');
    });

    it('treats {{date:}} (empty format) as the default format, never literal output', () => {
        expect(renderNameTemplate('{{date:}} {{h1}}', { h1: 'N', ctime: CTIME })).toBe('2026-07-03 N');
    });

    it('falls back to the plain H1 when date parsing consumes the only {{h1}} token', () => {
        // '{{date:{{h1}} }}' passes a naive includes('{{h1}}') check but would
        // render to a CONSTANT name for every note — must fall back to the H1.
        expect(renderNameTemplate('{{date:{{h1}} }}', { h1: 'Real', ctime: CTIME })).toBe('Real');
    });
});
