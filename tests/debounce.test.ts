import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { KeyedDebouncer } from '../src/debounce';

describe('KeyedDebouncer', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('fires the callback after the delay', () => {
        const d = new KeyedDebouncer(100);
        const fn = vi.fn();
        d.schedule('a', fn);
        expect(fn).not.toHaveBeenCalled();
        vi.advanceTimersByTime(100);
        expect(fn).toHaveBeenCalledOnce();
    });

    it('coalesces rapid re-schedules of the same key into one firing of the latest callback', () => {
        const d = new KeyedDebouncer(100);
        const first = vi.fn();
        const second = vi.fn();
        d.schedule('a', first);
        vi.advanceTimersByTime(50);
        d.schedule('a', second);
        vi.advanceTimersByTime(99);
        expect(second).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledOnce();
    });

    it('keeps different keys independent', () => {
        const d = new KeyedDebouncer(100);
        const a = vi.fn();
        const b = vi.fn();
        d.schedule('a', a);
        vi.advanceTimersByTime(60);
        d.schedule('b', b);
        vi.advanceTimersByTime(40);
        expect(a).toHaveBeenCalledOnce();
        expect(b).not.toHaveBeenCalled();
        vi.advanceTimersByTime(60);
        expect(b).toHaveBeenCalledOnce();
    });

    it('cancel(key) prevents that key from firing', () => {
        const d = new KeyedDebouncer(100);
        const fn = vi.fn();
        d.schedule('a', fn);
        d.cancel('a');
        vi.advanceTimersByTime(200);
        expect(fn).not.toHaveBeenCalled();
    });

    it('cancelAll() prevents every pending key from firing', () => {
        const d = new KeyedDebouncer(100);
        const a = vi.fn();
        const b = vi.fn();
        d.schedule('a', a);
        d.schedule('b', b);
        d.cancelAll();
        vi.advanceTimersByTime(200);
        expect(a).not.toHaveBeenCalled();
        expect(b).not.toHaveBeenCalled();
    });

    it('honours a per-call delay override', () => {
        const d = new KeyedDebouncer(100);
        const fn = vi.fn();
        d.schedule('a', fn, 500);
        vi.advanceTimersByTime(499);
        expect(fn).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(fn).toHaveBeenCalledOnce();
    });

    it('allows re-scheduling a key after it fired', () => {
        const d = new KeyedDebouncer(100);
        const fn = vi.fn();
        d.schedule('a', fn);
        vi.advanceTimersByTime(100);
        d.schedule('a', fn);
        vi.advanceTimersByTime(100);
        expect(fn).toHaveBeenCalledTimes(2);
    });
});
