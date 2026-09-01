import { resolveBusinessTimezone } from './business';
import { DashboardConfig, loadDashboardConfig } from './dashboard';
import { DiscordConfig, loadDiscordConfig } from './discord';
import { GoogleConfig, loadGoogleConfigOptional } from './google';
import { MysqlConfig, loadMysqlConfig } from './mysql';

export interface AppConfig {
  discord: DiscordConfig;
  mysql: MysqlConfig;
  google?: GoogleConfig;
  dashboard?: DashboardConfig;
  timezone: string;
}

export function loadConfig(): AppConfig {
  return {
    discord: loadDiscordConfig(),
    mysql: loadMysqlConfig(),
    google: loadGoogleConfigOptional(),
    dashboard: loadDashboardConfig(),
    timezone: resolveBusinessTimezone(process.env.TIMEZONE),
  };
}
