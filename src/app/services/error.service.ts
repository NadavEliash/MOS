import { Injectable, signal } from '@angular/core';

@Injectable({
    providedIn: 'root'
})
export class ErrorService {
    /** Set of measure IDs that failed to load */
    private failedMeasures = signal<Set<string>>(new Set());

    failedMeasuresSignal = this.failedMeasures.asReadonly();

    setGraphError(measureId: string | boolean): void {
        if (typeof measureId === 'boolean') {
            if (measureId) {
                this.failedMeasures.update(prev => {
                    const next = new Set(prev);
                    next.add('global');
                    return next;
                });
            } else {
                this.failedMeasures.set(new Set());
            }
            return;
        }

        this.failedMeasures.update(prev => {
            const next = new Set(prev);
            next.add(measureId);
            return next;
        });
    }

    clearGraphError(measureId?: string): void {
        if (measureId) {
            this.failedMeasures.update(prev => {
                const next = new Set(prev);
                next.delete(measureId);
                return next;
            });
        } else {
            this.failedMeasures.set(new Set());
        }
    }

    hasError(measureId: string): boolean {
        return this.failedMeasures().has(measureId);
    }
}
