/**
 * DTOs para webhooks de Wompi
 * Documentación: https://docs.wompi.co/docs/colombia/eventos
 */

export interface WompiWebhookPayload {
    event: string; // 'transaction.updated'
    data: {
        transaction: WompiTransaction;
    };
    environment: 'test' | 'prod';
    signature: {
        properties: string[];
        checksum: string;
    };
    timestamp: number;
    sent_at: string;
}

export interface WompiTransaction {
    id: string;
    created_at: string;
    finalized_at: string;
    amount_in_cents: number;
    reference: string;
    currency: string;
    payment_method_type: string;
    payment_method: {
        type: string;
        extra?: {
            name?: string;
            brand?: string;
            last_four?: string;
        };
    };
    status: 'APPROVED' | 'DECLINED' | 'VOIDED' | 'ERROR' | 'PENDING';
    status_message?: string;
    customer_email: string;
    customer_data?: {
        full_name?: string;
        phone_number?: string;
    };
}

export interface WebhookResponse {
    status: 'ok' | 'ignored' | 'invalid_signature' | 'error';
    message?: string;
}
