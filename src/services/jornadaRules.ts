import { parseTimeToMinutes } from '../utils/date';

export interface ToleranceConfig {
  adelantoMaxMin: number;
  toleranciaEntradaMin: number;
  toleranciaSalidaMin: number;
  limiteSinSalidaMin: number;
  refrigerioMin: number;
}

export const SPEC_TOLERANCES: ToleranceConfig = {
  adelantoMaxMin: 60,
  toleranciaEntradaMin: 5,
  toleranciaSalidaMin: 30,
  limiteSinSalidaMin: 180,
  refrigerioMin: 0,
};

export type EstadoEntrada =
  | 'PUNTUAL'
  | 'PUNTUAL_ANTICIPADO'
  | 'TARDANZA'
  | 'FUERA_DE_HORARIO'
  | 'SIN_MARCA';

export type EstadoSalida =
  | 'PUNTUAL'
  | 'SALIDA_ANTICIPADA'
  | 'FUERA_DE_HORA_SALIDA'
  | 'SIN_SALIDA';

export type EstadoJornada = 'ABIERTA' | 'CERRADA' | 'FALTA';

export interface JornadaCalculo {
  estadoEntrada: EstadoEntrada;
  estadoSalida: EstadoSalida | null;
  estadoJornada: EstadoJornada;
  horasComputadas: number;
  horasPorJustificar: number;
  minutosTardanza: number;
}

function roundHours(hours: number): number {
  return Math.round(Math.max(0, hours) * 100) / 100;
}

function minutesOf(time: string): number {
  return parseTimeToMinutes(time);
}

/**
 * Motor de reglas ESPEC-ASIS-001 §§4–5.
 * H = hora de entrada programada, S = hora de salida programada.
 */
export function calcularJornada(
  horaEntradaReal: string | null,
  horaSalidaReal: string | null,
  horaProgramadaEntrada: string | null,
  horaProgramadaSalida: string | null,
  config: ToleranceConfig = SPEC_TOLERANCES,
): JornadaCalculo {
  if (!horaProgramadaEntrada || !horaProgramadaSalida) {
    return {
      estadoEntrada: horaEntradaReal ? 'FUERA_DE_HORARIO' : 'SIN_MARCA',
      estadoSalida: horaSalidaReal ? 'PUNTUAL' : horaEntradaReal ? 'SIN_SALIDA' : null,
      estadoJornada: horaEntradaReal && horaSalidaReal ? 'CERRADA' : horaEntradaReal ? 'ABIERTA' : 'FALTA',
      horasComputadas: 0,
      horasPorJustificar: 0,
      minutosTardanza: 0,
    };
  }

  const H = minutesOf(horaProgramadaEntrada);
  const S = minutesOf(horaProgramadaSalida);
  const horasProgramadas = roundHours((S - H - config.refrigerioMin) / 60);

  if (!horaEntradaReal) {
    return {
      estadoEntrada: 'SIN_MARCA',
      estadoSalida: null,
      estadoJornada: 'FALTA',
      horasComputadas: 0,
      horasPorJustificar: horasProgramadas,
      minutosTardanza: 0,
    };
  }

  const E = minutesOf(horaEntradaReal);
  let estadoEntrada: EstadoEntrada;
  let minutosTardanza = 0;
  let inicioEfectivo = H;

  if (E < H - config.adelantoMaxMin) {
    estadoEntrada = 'FUERA_DE_HORARIO';
    inicioEfectivo = H;
  } else if (E <= H) {
    estadoEntrada = E < H ? 'PUNTUAL_ANTICIPADO' : 'PUNTUAL';
    inicioEfectivo = H;
  } else if (E <= H + config.toleranciaEntradaMin) {
    estadoEntrada = 'PUNTUAL';
    inicioEfectivo = H;
  } else {
    estadoEntrada = 'TARDANZA';
    minutosTardanza = E - H;
    inicioEfectivo = E;
  }

  if (!horaSalidaReal) {
    return {
      estadoEntrada,
      estadoSalida: 'SIN_SALIDA',
      estadoJornada: 'ABIERTA',
      horasComputadas: 0,
      horasPorJustificar: horasProgramadas,
      minutosTardanza,
    };
  }

  const X = minutesOf(horaSalidaReal);
  let estadoSalida: EstadoSalida;
  let finEfectivo = S;

  if (X < S) {
    estadoSalida = 'SALIDA_ANTICIPADA';
    finEfectivo = X;
  } else if (X <= S + config.toleranciaSalidaMin) {
    estadoSalida = 'PUNTUAL';
    finEfectivo = S;
  } else if (X < S + config.limiteSinSalidaMin) {
    estadoSalida = 'FUERA_DE_HORA_SALIDA';
    finEfectivo = S;
  } else {
    estadoSalida = 'SIN_SALIDA';
  }

  if (estadoSalida === 'SIN_SALIDA') {
    return {
      estadoEntrada,
      estadoSalida,
      estadoJornada: 'CERRADA',
      horasComputadas: 0,
      horasPorJustificar: horasProgramadas,
      minutosTardanza,
    };
  }

  const horasComputadas = roundHours(
    (finEfectivo - inicioEfectivo - config.refrigerioMin) / 60,
  );

  return {
    estadoEntrada,
    estadoSalida,
    estadoJornada: 'CERRADA',
    horasComputadas,
    horasPorJustificar: 0,
    minutosTardanza,
  };
}
