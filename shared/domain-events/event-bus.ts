export type DomainEvent<TPayload = Record<string, unknown>> = Readonly<{ id: string; name: string; occurredAt: Date; actorUserId: string; payload: TPayload }>;
export type DomainEventHandler<TPayload = Record<string, unknown>> = (event: DomainEvent<TPayload>) => void | Promise<void>;

export class InProcessEventBus {
  private readonly handlers = new Map<string, Set<DomainEventHandler>>();
  subscribe<TPayload>(name: string, handler: DomainEventHandler<TPayload>): () => void {
    const handlers = this.handlers.get(name) ?? new Set<DomainEventHandler>(); handlers.add(handler as DomainEventHandler); this.handlers.set(name, handlers);
    return () => handlers.delete(handler as DomainEventHandler);
  }
  async publish<TPayload>(event: DomainEvent<TPayload>): Promise<void> {
    await Promise.all([...(this.handlers.get(event.name) ?? [])].map((handler) => Promise.resolve(handler(event as DomainEvent))));
  }
}
