import { InvalidNameError } from '../errors/ValidationError.js';

export function assertName(name: string, label: string): string {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 100) {
    throw new InvalidNameError(label);
  }
  return trimmed;
}
