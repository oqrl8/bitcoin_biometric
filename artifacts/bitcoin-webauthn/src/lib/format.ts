export function formatBitcoinAddress(address: string) {
  if (!address || address.length < 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-6)}`;
}

export function formatCredentialId(id: string) {
  if (!id || id.length < 12) return id;
  return `${id.slice(0, 8)}...${id.slice(-4)}`;
}
