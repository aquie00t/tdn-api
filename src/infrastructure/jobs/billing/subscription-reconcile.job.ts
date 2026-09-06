import type {
    ReconcileSubscriptionsOutput,
    ReconcileSubscriptionsUseCase,
} from "@core/use-cases/billing/reconcile-subscriptions";

/**
 * Runs one subscription reconcile pass.
 */
export class SubscriptionReconcileJob {
    /**
     * @param reconcileSubscriptionsUseCase - The use case that does the work
     */
    constructor(
        private readonly reconcileSubscriptionsUseCase: ReconcileSubscriptionsUseCase,
    ) {}

    /**
     * Executes the pass.
     *
     * @param limit - Most rows to examine
     * @returns What the pass did
     */
    async run(limit: number): Promise<ReconcileSubscriptionsOutput> {
        return this.reconcileSubscriptionsUseCase.execute(limit);
    }
}
