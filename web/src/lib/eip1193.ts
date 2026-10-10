// The connected wallet's EIP-1193 provider, published by the wallet layer (wallet.tsx) so the transaction
// helpers in launch.ts can reach it without importing React or knowing about Privy.
export type Eip1193 = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };

let active: Eip1193 | null = null;

export function setActiveProvider(p: Eip1193 | null) {
  active = p;
}

export function getActiveProvider(): Eip1193 | null {
  return active;
}
