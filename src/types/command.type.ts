import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from 'discord.js';
import { AttendanceService } from '../services/attendanceService';
import { BotStateService } from '../services/botStateService';
import { ScheduleService } from '../services/scheduleService';
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
  botStateService: BotStateService;
  adminRoleId?: string;
  timezone: string;
}

export interface BotCommand {
  data: SlashCommandData;
  execute: (
    interaction: ChatInputCommandInteraction,
    context: CommandContext,
  ) => Promise<void>;
}
