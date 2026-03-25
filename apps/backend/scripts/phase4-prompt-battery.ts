import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { InitialProfileExtractionResult, LlmService } from '../src/modules/llm/llm.service';

type Modality = 'remote' | 'hybrid' | 'onsite' | null;
type ExperienceLevel = 'none' | 'junior' | 'mid' | 'senior' | 'lead' | null;

interface ExpectedExtraction {
  roleIncludes?: string[];
  roleNull?: boolean;
  locationIncludes?: string[];
  locationNull?: boolean;
  modality?: Modality;
  experienceLevel?: ExperienceLevel;
  confidenceMin?: number;
}

interface BatteryCase {
  id: string;
  input: string;
  expected: ExpectedExtraction;
}

const BATTERY: BatteryCase[] = [
  {
    id: 'C01',
    input: 'Hola, busco analista de datos en Bogota, tengo 3 anos y prefiero remoto.',
    expected: {
      roleIncludes: ['analista de datos'],
      locationIncludes: ['bogota'],
      modality: 'remote',
      experienceLevel: 'mid',
      confidenceMin: 0.7,
    },
  },
  {
    id: 'C02',
    input: 'Quiero un cargo de director de credito en Medellin, senior.',
    expected: {
      roleIncludes: ['director de credito'],
      locationIncludes: ['medellin'],
      experienceLevel: 'senior',
      confidenceMin: 0.6,
    },
  },
  {
    id: 'C03',
    input: 'Necesito trabajo remoto, no tengo experiencia.',
    expected: {
      roleNull: true,
      locationNull: true,
      modality: 'remote',
      experienceLevel: 'none',
      confidenceMin: 0.6,
    },
  },
  {
    id: 'C04',
    input: 'Soy desarrollador full stack en Cali, 2 anos, sector fintech.',
    expected: {
      roleIncludes: ['desarrollador'],
      locationIncludes: ['cali'],
      experienceLevel: 'junior',
      confidenceMin: 0.6,
    },
  },
  {
    id: 'C05',
    input: 'Busco marketing en Madrid hibrido con 5 anos de experiencia.',
    expected: {
      roleIncludes: ['marketing'],
      locationIncludes: ['madrid'],
      modality: 'hybrid',
      experienceLevel: 'mid',
      confidenceMin: 0.6,
    },
  },
  {
    id: 'C06',
    input: 'Asesor comercial / call center en Barranquilla.',
    expected: {
      roleNull: true,
      locationIncludes: ['barranquilla'],
      confidenceMin: 0.5,
    },
  },
  {
    id: 'C07',
    input: 'Quiero algo presencial en Oporto, 7+ anos, gerencia comercial.',
    expected: {
      roleIncludes: ['gerencia comercial', 'gerente comercial'],
      locationIncludes: ['oporto'],
      modality: 'onsite',
      experienceLevel: 'lead',
      confidenceMin: 0.6,
    },
  },
  {
    id: 'C08',
    input: 'Data analyst, Miami, 1 year exp, remote.',
    expected: {
      roleIncludes: ['data analyst', 'analista de datos'],
      locationIncludes: ['miami'],
      modality: 'remote',
      experienceLevel: 'junior',
      confidenceMin: 0.6,
    },
  },
  {
    id: 'C09',
    input: 'No se, tal vez algo en tecnologia.',
    expected: {
      roleNull: true,
      locationNull: true,
      confidenceMin: 0.3,
    },
  },
  {
    id: 'C10',
    input: 'Quiero trabajo en Ciudad de Mexico, soy junior en ventas B2B.',
    expected: {
      roleIncludes: ['ventas'],
      locationIncludes: ['ciudad de mexico', 'mexico'],
      experienceLevel: 'junior',
      confidenceMin: 0.55,
    },
  },
  {
    id: 'C11',
    input: 'busco auxiliar administrativo en toronto home office',
    expected: {
      roleIncludes: ['auxiliar administrativo'],
      locationIncludes: ['toronto'],
      modality: 'remote',
      confidenceMin: 0.55,
    },
  },
  {
    id: 'C12',
    input: 'Gerente de operaciones en Lima o Arequipa, 10 anos.',
    expected: {
      roleIncludes: ['gerente de operaciones'],
      locationNull: true,
      experienceLevel: 'lead',
      confidenceMin: 0.5,
    },
  },
  {
    id: 'C13',
    input: '🚀 UX designer en Barcelona, presencial, 4 anos.',
    expected: {
      roleIncludes: ['ux designer', 'disenador ux'],
      locationIncludes: ['barcelona'],
      modality: 'onsite',
      experienceLevel: 'mid',
      confidenceMin: 0.55,
    },
  },
  {
    id: 'C14',
    input: 'Quiero empleo, me urge.',
    expected: {
      roleNull: true,
      locationNull: true,
      confidenceMin: 0.3,
    },
  },
  {
    id: 'C15',
    input: 'Soy senior backend engineer en Berlin, teletrabajo.',
    expected: {
      roleIncludes: ['backend engineer', 'ingeniero backend'],
      locationIncludes: ['berlin'],
      modality: 'remote',
      experienceLevel: 'senior',
      confidenceMin: 0.55,
    },
  },
];

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

function includesAny(base: string | null, candidates: string[]): boolean {
  if (!base) return false;
  const normalizedBase = normalize(base);
  return candidates.some((candidate) => normalizedBase.includes(normalize(candidate)));
}

function evaluateCase(
  result: InitialProfileExtractionResult,
  expected: ExpectedExtraction,
): string[] {
  const failures: string[] = [];

  if (expected.roleNull === true && result.role !== null) {
    failures.push(`role esperado null, obtenido "${result.role}"`);
  }

  if (expected.roleIncludes && !includesAny(result.role, expected.roleIncludes)) {
    failures.push(
      `role no coincide. Esperado alguno de [${expected.roleIncludes.join(', ')}], obtenido "${result.role}"`,
    );
  }

  if (expected.locationNull === true && result.location !== null) {
    failures.push(`location esperado null, obtenido "${result.location}"`);
  }

  if (expected.locationIncludes && !includesAny(result.location, expected.locationIncludes)) {
    failures.push(
      `location no coincide. Esperado alguno de [${expected.locationIncludes.join(', ')}], obtenido "${result.location}"`,
    );
  }

  if (expected.modality !== undefined && result.modality !== expected.modality) {
    failures.push(`modality esperada "${expected.modality}", obtenida "${result.modality}"`);
  }

  if (expected.experienceLevel !== undefined && result.experienceLevel !== expected.experienceLevel) {
    failures.push(
      `experienceLevel esperado "${expected.experienceLevel}", obtenido "${result.experienceLevel}"`,
    );
  }

  if (
    typeof expected.confidenceMin === 'number'
    && (typeof result.confidence !== 'number' || result.confidence < expected.confidenceMin)
  ) {
    failures.push(`confidence esperada >= ${expected.confidenceMin}, obtenida ${result.confidence}`);
  }

  return failures;
}

function printSummary(result: InitialProfileExtractionResult): void {
  const hasRole = Boolean(result.role);
  const hasLocationOrRemote = Boolean(result.location) || result.modality === 'remote';
  const hasExperience = Boolean(result.experienceLevel) || typeof result.experienceYears === 'number';
  const missing = [
    hasRole ? null : 'role',
    hasLocationOrRemote ? null : 'location/remoto',
    hasExperience ? null : 'experience',
  ].filter(Boolean);

  const nextStep = missing.length === 0 ? 'show_first_vacancy' : `ask_${missing[0]}`;
  console.log(`   readiness: role=${hasRole} locationOrRemote=${hasLocationOrRemote} experience=${hasExperience}`);
  console.log(`   next_step_sugerido: ${nextStep}`);
}

async function main(): Promise<void> {
  const configService = new ConfigService();
  const llmService = new LlmService(configService);

  console.log('\n=== FASE 4 PROMPT BATTERY ===');
  console.log(`Casos: ${BATTERY.length}\n`);

  let passed = 0;
  let failed = 0;
  let skipped = 0;

  for (const testCase of BATTERY) {
    const started = Date.now();
    const result = await llmService.extractInitialProfileFromFreeText(testCase.input);
    const elapsed = Date.now() - started;

    console.log(`\n[${testCase.id}] ${testCase.input}`);

    if (!result) {
      skipped += 1;
      console.log('   SKIP: no se obtuvo respuesta del LLM (sin API key o fallo de red).');
      continue;
    }

    const failures = evaluateCase(result, testCase.expected);

    console.log(`   output: ${JSON.stringify(result)}`);
    console.log(`   latency_ms: ${elapsed}`);
    printSummary(result);

    if (failures.length === 0) {
      passed += 1;
      console.log('   ✅ PASS');
    } else {
      failed += 1;
      console.log('   ❌ FAIL');
      failures.forEach((failure) => console.log(`      - ${failure}`));
    }
  }

  console.log('\n=== RESUMEN ===');
  console.log(`PASS: ${passed}`);
  console.log(`FAIL: ${failed}`);
  console.log(`SKIP: ${skipped}`);
  console.log(`TOTAL: ${BATTERY.length}`);

  if (skipped === BATTERY.length) {
    console.log('\nNo se pudo ejecutar la bateria porque no hubo respuesta del LLM.');
    process.exit(2);
  }

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Error ejecutando bateria Fase 4:', error);
  process.exit(1);
});
