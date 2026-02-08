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
            await lastValueFrom(this.client.emit(pattern, data));
            this.logger.log(
                `Message published to pattern: ${pattern}, data: ${JSON.stringify(data)}`,
            );
        } catch (error: any) {
            this.logger.error(
                `Failed to publish message to pattern ${pattern}: ${error.message}`,
                error.stack,
            );
        }
    }

    async onModuleDestroy() {
        await this.client.close();
    }
}
