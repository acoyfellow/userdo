export interface AuthUser {
  id: string;
  email: string;
  createdAt: string;
}

export interface AuthConfig {
  baseUrl: string;
  storage?: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
  };
}
