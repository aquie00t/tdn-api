import type {
    BillingEventRecord,
    IBillingEventRepository,
} from "@core/ports/repositories/billing-event.repository";
import type { PrismaTransactionalClient } from "@infrastructure/persistence/database/prisma-client.type";
import { Prisma } from "@generated/prisma/client";
import type { BillingProvider as PrismaBillingProvider } from "@generated/prisma/client";

/**
 * Prisma implementation of the billing event repository.
 */
export class PrismaBillingEventRepository implements IBillingEventRepository {
    /**
     * @param prisma - Prisma client, possibly scoped to a transaction
     */
    constructor(private readonly prisma: PrismaTransactionalClient) {}

    /**
     * Records a notification, unless it has already been recorded.
     *
     * @param event - The notification to record.
     * @returns True when this caller recorded it.
     */
    async recordIfNew(event: BillingEventRecord): Promise<boolean> {
        try {
            await this.prisma.billingEvent.create({
                data: {
                    id: event.id,
                    provider: event.provider as PrismaBillingProvider,
                    type: event.type,
                    providerSubscriptionId:
                        event.providerSubscriptionId ?? null,
                },
            });

            return true;
        } catch (error: unknown) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === "P2002"
            ) {
                // A redelivery. Already recorded, already applied.
                return false;
            }

            throw error;
        }
    }

    /**
     * Removes a record, so the delivery it stood for can be retried.
     *
     * @param id - The provider's identifier for the delivery.
     */
    async forget(id: string): Promise<void> {
        await this.prisma.billingEvent.deleteMany({ where: { id } });
    }
}
