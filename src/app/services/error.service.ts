import { Injectable, signal } from '@angular/core';

@Injectable({
    providedIn: 'root'
})
export class ErrorService {
    /** True when the latest measure/graph API call failed */
    graphError = signal<boolean>(false);

    setGraphError(hasError: boolean): void {
        this.graphError.set(hasError);
    }

    clearGraphError(): void {
        this.graphError.set(false);
    }
}
