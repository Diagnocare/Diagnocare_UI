import { environment } from 'src/environments/environment';

declare global {
  interface Window {
    RUNTIME_CONFIG?: { [key: string]: string };
  }
}

function getRuntimeConfigValue(key: string, fallback: string): string {
  if (typeof window !== 'undefined' && window.RUNTIME_CONFIG && window.RUNTIME_CONFIG[key]) {
    return window.RUNTIME_CONFIG[key];
  }
  return fallback;
}

export function getDiagnocareApiUrl(): string {
  if (typeof window !== 'undefined') {
    const runtimeDiagnocareApiUrl = (window as any)?.RUNTIME_CONFIG?.diagnocareApiURL;
    if (typeof runtimeDiagnocareApiUrl === 'string' && runtimeDiagnocareApiUrl.trim().length > 0) {
      return runtimeDiagnocareApiUrl;
    }
  }

  return environment.diagnocareApiURL || '';
}

export function getLoginUIUrl(): string {
  return getRuntimeConfigValue('loginUIUrl', environment.loginUIUrl);
}