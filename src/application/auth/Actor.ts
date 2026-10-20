interface ActorBase {
  readonly id: string;
  readonly name: string;
}

export type Actor =
  (ActorBase & { readonly role: 'CREW_LEAD' }) | (ActorBase & { readonly role: 'PASSENGER' });

export type ActorRole = Actor['role'];
