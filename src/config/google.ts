function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Variable de entorno requerida: ${key}`);
  }
  return value;
}

export interface GoogleConfig {
  sheetsId: string;
  serviceAccountEmail: string;
  privateKey: string;
}

export function loadGoogleConfig(): GoogleConfig {
  return {
    sheetsId: requireEnv('GOOGLE_SHEETS_ID').trim(),
    serviceAccountEmail: requireEnv('GOOGLE_SERVICE_ACCOUNT_EMAIL').trim(),
    privateKey: requireEnv('GOOGLE_PRIVATE_KEY').trim().replace(/\\n/g, '\n'),
  };
}

/** Sheets es respaldo de emergencia: si faltan las tres variables, se desactiva. */
export function loadGoogleConfigOptional(): GoogleConfig | undefined {
  const sheetsId = process.env.GOOGLE_SHEETS_ID?.trim();
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const key = process.env.GOOGLE_PRIVATE_KEY?.trim();
  if (!sheetsId && !email && !key) {
    return undefined;
  }
  if (!sheetsId || !email || !key) {
    throw new Error(
      'Configuración incompleta de Google Sheets: define GOOGLE_SHEETS_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL y GOOGLE_PRIVATE_KEY, o ninguna.',
    );
  }
  return {
    sheetsId,
    serviceAccountEmail: email,
    privateKey: key.replace(/\\n/g, '\n'),
  };
}
