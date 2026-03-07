import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class RabbitMQProducerService implements OnModuleDestroy {
    private readonly logger = new Logger(RabbitMQProducerService.name);

    constructor(
        @Inject('RABBITMQ_SERVICE') private readonly client: ClientProxy,
    ) { }

    async publishMessage(pattern: string, data: any): Promise<void> {
        try {
            await this.client.connect();

            // Fire and forget so we don't crash the main API execution
            this.client.emit(pattern, data).subscribe({
                next: () => {
                    this.logger.log(`Message published to pattern: ${pattern}`);
                },
                error: (err) => {
                    this.logger.error(`RabbitMQ emit error for ${pattern}:`, err);
                }
            });

        } catch (error: any) {
            this.logger.error(
                `Failed to connect or publish message to pattern ${pattern}: ${error.message}`,
                error.stack,
            );
        }
    }

    async onModuleDestroy() {
        await this.client.close();
    }
}
