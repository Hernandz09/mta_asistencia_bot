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

function horasProgramadasDe(
  horaProgramadaEntrada: string,
  horaProgramadaSalida: string,
  config: ToleranceConfig,
): number {
  const H = minutesOf(horaProgramadaEntrada);
  const S = minutesOf(horaProgramadaSalida);
  return roundHours((S - H - config.refrigerioMin) / 60);
}

function cerroConEntradaValida(estadoEntrada: EstadoEntrada): boolean {
  return (
    estadoEntrada === 'PUNTUAL' ||
    estadoEntrada === 'PUNTUAL_ANTICIPADO' ||
    estadoEntrada === 'TARDANZA'
  );
}

function jornadaCerradaSinSalida(
  estadoEntrada: EstadoEntrada,
  horasProgramadas: number,
  minutosTardanza: number,
): JornadaCalculo {
  const entro = cerroConEntradaValida(estadoEntrada);
  return {
    estadoEntrada,
    estadoSalida: 'SIN_SALIDA',
    estadoJornada: 'CERRADA',
    horasComputadas: entro ? horasProgramadas : 0,
    horasPorJustificar: entro ? 0 : horasProgramadas,
    minutosTardanza,
  };
}

/**
 * Cierre automático: hubo entrada y no marcaron salida.
 * Si llegó (puntual o tarde), las horas del turno cuentan y justificar
 * el cierre es opcional. La tardanza sigue visible en puntualidad.
 */
export function cerrarJornadaSinSalida(
  horaEntradaReal: string | null,
  horaProgramadaEntrada: string | null,
  horaProgramadaSalida: string | null,
  config: ToleranceConfig = SPEC_TOLERANCES,
): JornadaCalculo {
  const abierta = calcularJornada(
    horaEntradaReal,
    null,
    horaProgramadaEntrada,
    horaProgramadaSalida,
    config,
  );
  if (!horaProgramadaEntrada || !horaProgramadaSalida) {
    return {
      ...abierta,
      estadoSalida: 'SIN_SALIDA',
      estadoJornada: horaEntradaReal ? 'CERRADA' : abierta.estadoJornada,
    };
  }
  return jornadaCerradaSinSalida(
    abierta.estadoEntrada,
    horasProgramadasDe(horaProgramadaEntrada, horaProgramadaSalida, config),
    abierta.minutosTardanza,
  );
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
    // La tardanza solo afecta puntualidad. Justificarla es opcional:
    // las horas se computan desde H, igual que un puntual.
    inicioEfectivo = H;
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
    return jornadaCerradaSinSalida(
      estadoEntrada,
      horasProgramadas,
      minutosTardanza,
    );
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
