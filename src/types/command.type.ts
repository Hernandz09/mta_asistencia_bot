import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from 'discord.js';
import { AttendanceService } from '../services/attendanceService';
import { BotStateService } from '../services/botStateService';
import { ScheduleService } from '../services/scheduleService';
import { ExtraHoursService } from '../services/extraHoursService';
import { RankingService } from '../services/rankingService';
import { StatsService } from '../services/statsService';

export type SlashCommandData =
  | SlashCommandBuilder
  | SlashCommandSubcommandsOnlyBuilder
  | SlashCommandOptionsOnlyBuilder
  | Omit<SlashCommandBuilder, 'addSubcommand' | 'addSubcommandGroup'>;

export interface CommandContext {
  attendanceService: AttendanceService;
  scheduleService: ScheduleService;
  statsService: StatsService;
  rankingService: RankingService;
  extraHoursService?: ExtraHoursService;
  botStateService: BotStateService;
  adminRoleId?: string;
  attendanceChannelId?: string;
  timezone: string;
}

export interface BotCommand {
  data: SlashCommandData;
  execute: (
    interaction: ChatInputCommandInteraction,
    context: CommandContext,
  ) => Promise<void>;
}
