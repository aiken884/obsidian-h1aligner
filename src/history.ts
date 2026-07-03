/**
 * history.ts — pure rename-history stack for the undo command
 * (no obsidian import; session-scoped, not persisted).
 */
export interface RenameRecord {
    from: string;
    to: string;
}

export class RenameHistory {
    private readonly stack: RenameRecord[] = [];

    constructor(private readonly cap = 20) {}

    push(record: RenameRecord): void {
        this.stack.push(record);
        if (this.stack.length > this.cap) this.stack.shift();
    }

    pop(): RenameRecord | undefined {
        return this.stack.pop();
    }

    peek(): RenameRecord | undefined {
        return this.stack[this.stack.length - 1];
    }

    get size(): number {
        return this.stack.length;
    }
}
