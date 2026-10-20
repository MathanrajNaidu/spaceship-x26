export interface ErrorLogger {
  error(context: Record<string, unknown>, message: string): void;
}

export const noopLogger: ErrorLogger = {
  error() {
    return undefined;
  },
};
