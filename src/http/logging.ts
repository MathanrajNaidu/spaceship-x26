export interface AppLogger {
  error(context: Record<string, unknown>, message: string): void;
  info(context: Record<string, unknown>, message: string): void;
}

export const noopLogger: AppLogger = {
  error() {
    return undefined;
  },
  info() {
    return undefined;
  },
};
