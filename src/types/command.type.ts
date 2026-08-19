import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from 'discord.js';
import { AttendanceService } from '../services/attendanceService';
import { ScheduleService } from '../services/scheduleService';

export type SlashCommandData =
  | SlashCommandBuilder
  | SlashCommandSubcommandsOnlyBuilder
  | SlashCommandOptionsOnlyBuilder
  | Omit<SlashCommandBuilder, 'addSubcommand' | 'addSubcommandGroup'>;

export interface CommandContext {
  attendanceService: AttendanceService;
  scheduleService: ScheduleService;
  adminRoleId?: string;
}

export interface BotCommand {
  data: SlashCommandData;
  execute: (
    interaction: ChatInputCommandInteraction,
    context: CommandContext,
  ) => Promise<void>;
}
